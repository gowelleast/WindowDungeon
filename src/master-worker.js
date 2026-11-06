import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { DungeonChannel } from './channel.js';
import { cellId as getCellId, cellToScreenRect, getSlotSize, isCellValid, parseCellId } from './grid.js';

const channel = new DungeonChannel('master-worker');

let cellMap = new Map();
let screens = [];

// 플레이어 상태
const player = {
  cellId: 'lobby',
  lx: CONFIG.ROOM_OUTER_W / 2,
  ly: CONFIG.ROOM_OUTER_H / 2,
  vx: 0, vy: 0, speed: CONFIG.PLAYER_SPEED || 6, radius: 15, facing: 'down',
  kx: 0, ky: 0,
  stunTimer: 0, // 피격 시 일시 스턴 틱 카운터 (약 0.45초)
  invulnerableTimer: 0 // 피격 후 무적 시간 틱 카운터 (2.5초간 무적)
};

// 열쇠 & 탈출문 상태 (Stage 1)
let hasKey = false;
let exitCellId = null;
let keyCellId = null;
let exitDiscovered = false;
let keyDiscovered = false;
let isMuted = false;

// 황금방 & 패시브 아이템 상태 (Stage 1 -> 전 스테이지 유지)
let goldenCellId = null;
let goldenDiscovered = false;
let goldenItemType = 'map'; // 'map' (고대 지도) | 'boots' (바람의 신발)
let goldenItemCollected = false;
let hasMapItem = false;
let hasBootsItem = false;
let allReachableCells = [];

// 멀티 스테이지 & 영역 점령전 상태 (Stage 2)
let currentStage = 1;
let isStageTransition = false;
const closingWinIds = new Set();
const flagOwners = new Map(); // cellId -> 'neutral' | 'player' | 'monster'
let flagOwnersDirty = true;
let cachedFlagOwnersObj = {};
let cachedFlagScores = { playerScore: 0, monsterScore: 0 };
let stage2TimeLeft = 0;       // 남은 틱 수
let isOvertime = false;

// 크로스 윈도우 레이저 연결 퍼즐 상태 (Stage 3)
let laserSourceCellId = null;
let laserTargetCellId = null;
let laserTargetDiscovered = false;
const prismDirs = new Map();  // cellId -> 'up' | 'right' | 'down' | 'left'
let prismDirsDirty = true;
let cachedPrismDirsObj = {};
let laserSegments = [];       // Array<{ cellId, inDir, outDir, blockedByClosedRoom, isCoreHit }>
let laserConnected = false;
let laserChargeTimer = 0;     // 코어 연결 후 공명 연출 타이머
let wasSpacePressed = false;  // [Space] 키 엣지 트리거 감지용
let victoryTimestamp = 0;     // 승리 직후 스페이스바 연타로 인한 즉시 종료 방지 그레이스 타임스탬프

// 도망치는 자아 성검 & 철창 레버 상태 (Stage 4 -> Stage 5 유지)
const closedGates = new Set(); // 정렬된 두 인접 방 ID 쌍: "cellA<->cellB"
let closedGatesDirty = true;
let cachedClosedDoorsByCell = {};
const flyingSword = {
  cellId: null,
  lx: CONFIG.ROOM_OUTER_W / 2,
  ly: CONFIG.ROOM_OUTER_H / 2,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2,
  state: 'awakening', // 'awakening' | 'flying' | 'groggy' | 'trapped'
  passedCenter: true,
  targetDir: null,
  awakeningTimer: 16,
  groggyTimer: 0,
  lastEnteredFrom: null,
  lastBouncedDir: null,
  lastTransit: null   // { fromCellId, toCellId, dir, timestamp }
};
let hasLegendarySword = false;
let swordAwakenTimer = 0;           // 성검 포획 후 빛 흡수 각성 연출 타이머 (42틱 = 약 1.4초)
let stage4SequencePhase = 'none';   // 'none' | 'closing_rooms' (다른 방 먼저 닫기) | 'absorbing_light' (빛이 성검으로 모이는 연출)

// 심연의 마왕 멀티 윈도우 최종 보스전 상태 (Stage 5: 탄막 피하기 -> 방 탐색 & 성검 공격 -> 보스 순간이동 루프)
const boss = {
  cellId: null,
  visitedCellIds: [],     // 이번 보스전에서 탄막/전투가 이미 진행되었던 방 이력 (왕복 핑퐁 방지용)
  lx: CONFIG.ROOM_OUTER_W / 2,
  ly: CONFIG.ROOM_OUTER_H / 2,
  hp: 3,
  maxHp: 3,
  state: 'barrage',       // 'barrage' (탄막 피하기) | 'searching' (보스 추격 & 검 공격) | 'hit' (피격 후 순간이동) | 'dying' (격파 연출)
  barrageCellId: null,    // 현재 탄막 결계가 작동 중인 방 ID
  actionTimer: 150,       // 탄막 페이즈(150틱=5초), 피격 경직(24틱), 격파 연출(52틱) 타이머
  barrageDuration: 150,   // 탄막 피하기 지속 틱 (5초)
  searchTimer: 330,       // 보스 추격 제한 시간 (330틱 = 11초, 초과 시 현재 방에서 탄막 피하기 재발동!)
  searchDuration: 330,
  spawnTimer: 0,          // 블랙홀에서 소환되는 연출 타이머 (24틱)
  patternStep: 0,
  bullets: [],            // Array<{ x, y, vx, vy, radius, color }>
  slashEffect: null       // { cellId, x, y, angle, timer, maxTimer }
};

// 백그라운드 순찰 & 추적 몬스터 상태
const monster = {
  cellId: null,
  lx: CONFIG.ROOM_OUTER_W / 2,
  ly: CONFIG.ROOM_OUTER_H / 2,
  vx: 0, vy: 0,
  speed: CONFIG.MONSTER_SPEED || 2.5,
  wanderSpeed: CONFIG.MONSTER_WANDER_SPEED || 1.5,
  radius: 16,
  state: 'wandering', // 'wandering' | 'chasing'
  wanderCooldown: 0,
  attackCooldown: 0, // 플레이어 타격 후 멈칫하는 후딜레이 (1.5초)
  facing: 'down',
  targetDir: null,       // 현재 방에서 향하고 있는 목표 문 방향
  passedCenter: true,    // 방 중앙 경유 여부 (벽 대각선 관통 방지 및 자연스러운 동선)
  lastEnteredFrom: null  // 직전에 들어온 문 방향 (즉시 유턴 방지)
};

const keys = new Set();

function getAdjacentCell(screenLabel, gx, gy, dir) {
  const currentScreen = screens.find(s => s.label === screenLabel);
  if (!currentScreen) return null;

  let nx = gx, ny = gy;
  if (dir === 'up') ny -= 1;
  if (dir === 'down') ny += 1;
  if (dir === 'left') nx -= 1;
  if (dir === 'right') nx += 1;

  // 1. 현재 화면 내에서 유효한지 확인
  if (isCellValid(currentScreen, nx, ny, CONFIG)) {
    return { screen: currentScreen, gx: nx, gy: ny };
  }

  // 2. 현재 화면을 벗어났다면, 논리적 방향에 맞는 인접 모니터 찾기
  let targetScreen = null;
  let minDistance = Infinity;

  for (const s of screens) {
    if (s.label === currentScreen.label) continue;

    const currentCx = currentScreen.availLeft + currentScreen.availWidth / 2;
    const currentCy = currentScreen.availTop + currentScreen.availHeight / 2;
    const sCx = s.availLeft + s.availWidth / 2;
    const sCy = s.availTop + s.availHeight / 2;

    const dx = sCx - currentCx;
    const dy = sCy - currentCy;

    let isValidTarget = false;
    if (dir === 'right' && dx > 0 && Math.abs(dx) > Math.abs(dy)) isValidTarget = true;
    if (dir === 'left' && dx < 0 && Math.abs(dx) > Math.abs(dy)) isValidTarget = true;
    if (dir === 'down' && dy > 0 && Math.abs(dy) >= Math.abs(dx)) isValidTarget = true;
    if (dir === 'up' && dy < 0 && Math.abs(dy) >= Math.abs(dx)) isValidTarget = true;

    if (isValidTarget) {
      const dist = Math.hypot(sCx - currentCx, sCy - currentCy);
      if (dist < minDistance) {
        minDistance = dist;
        targetScreen = s;
      }
    }
  }

  if (targetScreen) {
    let mappedGx = 0;
    let mappedGy = 0;
    const { slotW, slotH } = getSlotSize(CONFIG);

    const maxGx = Math.floor(targetScreen.availWidth / slotW) - 1;
    const maxGy = Math.floor(targetScreen.availHeight / slotH) - 1;

    const alignY = () => {
      let y = Math.floor((gy * slotH + currentScreen.availTop - targetScreen.availTop) / slotH);
      return Math.max(0, Math.min(y, maxGy));
    };

    const alignX = () => {
      let x = Math.floor((gx * slotW + currentScreen.availLeft - targetScreen.availLeft) / slotW);
      return Math.max(0, Math.min(x, maxGx));
    };

    if (dir === 'right') {
      mappedGx = 0;
      mappedGy = alignY();
    } else if (dir === 'left') {
      mappedGx = maxGx;
      mappedGy = alignY();
    } else if (dir === 'down') {
      mappedGy = 0;
      mappedGx = alignX();
    } else if (dir === 'up') {
      mappedGy = maxGy;
      mappedGx = alignX();
    }

    if (isCellValid(targetScreen, mappedGx, mappedGy, CONFIG)) {
      return { screen: targetScreen, gx: mappedGx, gy: mappedGy };
    }
  }
  return null;
}

function calculateDoors(screen, gx, gy) {
  const doors = [];
  if (getAdjacentCell(screen.label, gx, gy, 'up')) doors.push('up');
  if (getAdjacentCell(screen.label, gx, gy, 'down')) doors.push('down');
  if (getAdjacentCell(screen.label, gx, gy, 'left')) doors.push('left');
  if (getAdjacentCell(screen.label, gx, gy, 'right')) doors.push('right');
  return doors;
}

let isVictory = false;
let isClosing = false;
let lastLockedDoorNotify = 0;
let doorTransitionSeq = 0;
let lastDoorTransition = null;
let doorTransferCooldown = 0;

/**
 * 시작 셀로부터 BFS를 수행하여 도달 가능한 모든 가상 그리드 셀 목록을 계산합니다.
 */
function computeReachableGrid(startScreenLabel, startGx, startGy) {
  const visited = new Set();
  const startId = getCellId(startScreenLabel, startGx, startGy);
  const startScreen = screens.find(s => s.label === startScreenLabel) || screens[0];
  const startNode = {
    screenLabel: startScreenLabel,
    gx: startGx,
    gy: startGy,
    dist: 0,
    id: startId,
    doors: startScreen ? calculateDoors(startScreen, startGx, startGy) : []
  };

  const queue = [startNode];
  const reachableCells = [];
  visited.add(startId);

  while (queue.length > 0) {
    const curr = queue.shift();
    const dirs = ['up', 'down', 'left', 'right'];
    for (const dir of dirs) {
      const adj = getAdjacentCell(curr.screenLabel, curr.gx, curr.gy, dir);
      if (adj) {
        const id = getCellId(adj.screen.label, adj.gx, adj.gy);
        if (!visited.has(id)) {
          visited.add(id);
          const nextNode = {
            screenLabel: adj.screen.label,
            gx: adj.gx,
            gy: adj.gy,
            dist: curr.dist + 1,
            id,
            doors: calculateDoors(adj.screen, adj.gx, adj.gy)
          };
          queue.push(nextNode);
          reachableCells.push(nextNode);
        }
      }
    }
  }

  return { startNode, reachableCells, allCells: [startNode, ...reachableCells] };
}

function getGateKey(cellId, dir) {
  const parsed = parseCellId(cellId);
  if (!parsed) return null;
  const adj = getAdjacentCell(parsed.screenLabel, parsed.gx, parsed.gy, dir);
  if (!adj) return null;
  const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
  return cellId < adjId ? `${cellId}<->${adjId}` : `${adjId}<->${cellId}`;
}

function isGateClosed(cellId, dir) {
  // Stage 5 탄막 피하기('barrage') 중에는 결계가 펼쳐진 방의 모든 문을 일시 봉쇄하여 탄막 회피 중 의도치 않은 창 이동 방지!
  if (currentStage === 5 && boss.state === 'barrage' && cellId === boss.barrageCellId) {
    return true;
  }
  if (currentStage !== 4) return false;
  const key = getGateKey(cellId, dir);
  return key ? closedGates.has(key) : false;
}

function getClosedDoorsForCell(cellId) {
  if (currentStage !== 4) return [];
  const dirs = ['up', 'down', 'left', 'right'];
  return dirs.filter(d => isGateClosed(cellId, d));
}

function getClosedDoorsMapObj() {
  if (currentStage !== 4 || closedGates.size === 0) return {};
  if (!closedGatesDirty) return cachedClosedDoorsByCell;
  const mapObj = {};
  for (const c of allReachableCells) {
    const closed = getClosedDoorsForCell(c.id);
    if (closed.length > 0) {
      mapObj[c.id] = closed;
    }
  }
  for (const c of cellMap.values()) {
    if (!mapObj[c.id]) {
      const closed = getClosedDoorsForCell(c.id);
      if (closed.length > 0) {
        mapObj[c.id] = closed;
      }
    }
  }
  cachedClosedDoorsByCell = mapObj;
  closedGatesDirty = false;
  return cachedClosedDoorsByCell;
}

function getFlagOwnersSnapshot() {
  if (flagOwnersDirty) {
    cachedFlagOwnersObj = Object.fromEntries(flagOwners);
    let playerScore = 0;
    let monsterScore = 0;
    for (const owner of flagOwners.values()) {
      if (owner === 'player') playerScore++;
      else if (owner === 'monster') monsterScore++;
    }
    cachedFlagScores = { playerScore, monsterScore };
    flagOwnersDirty = false;
  }
  return cachedFlagOwnersObj;
}

function getPrismDirsSnapshot() {
  if (prismDirsDirty) {
    cachedPrismDirsObj = Object.fromEntries(prismDirs);
    prismDirsDirty = false;
  }
  return cachedPrismDirsObj;
}

function buildAssignPayload(c, doorTransition = null) {
  return {
    ...c,
    stage: currentStage,
    isExitRoom: (currentStage === 1 && c.id === exitCellId),
    isKeyRoom: (currentStage === 1 && c.id === keyCellId),
    isGoldenRoom: (currentStage === 1 && c.id === goldenCellId),
    goldenItemType,
    goldenItemCollected,
    hasKey,
    hasMapItem,
    hasBootsItem,
    flagOwner: (currentStage === 2) ? (flagOwners.get(c.id) || 'neutral') : null,
    laserSourceCellId: (currentStage === 3) ? laserSourceCellId : null,
    laserTargetCellId: (currentStage === 3) ? laserTargetCellId : null,
    prismDir: (currentStage === 3) ? (prismDirs.get(c.id) || null) : null,
    laserConnected: (currentStage === 3) ? laserConnected : false,
    closedDoors: (currentStage === 4) ? getClosedDoorsForCell(c.id) : [],
    hasLegendarySword,
    isMuted,
    doorTransition
  };
}

/**
 * 게임 시작 시 BFS로 던전 전체 가상 그리드를 파악하고
 * [황금 열쇠], [잠긴 탈출문], [황금방 아이템], [순찰 몬스터]의 초기 위치를 배치합니다.
 */
function generateDungeonEntities(startScreenLabel, startGx, startGy) {
  const { reachableCells, allCells } = computeReachableGrid(startScreenLabel, startGx, startGy);
  allReachableCells = allCells;

  if (reachableCells.length > 0) {
    // 세미나 1분 컷 최적화: 거리 1~2인 가까운 방들을 최우선 후보군으로 구성
    const closeCandidates = reachableCells.filter(c => c.dist >= 1 && c.dist <= 2);
    const pool = (closeCandidates.length >= 2) ? [...closeCandidates] : [...reachableCells];

    // 무작위 셔플 (Fisher-Yates)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // 1. 잠긴 탈출문 (거리 1~2 방 중 랜덤)
    exitCellId = pool[0].id;

    // 2. 황금 열쇠 (탈출문과 다른 거리 1~2 방에 우선 배치)
    if (pool.length > 1) {
      keyCellId = pool[1].id;
    } else {
      keyCellId = pool[0].id;
    }

    // 3. 황금방(Golden Room): 탈출문·열쇠 방과 겹치지 않는 방 중 하나에 랜덤 배치 (아이템: 고대 지도 or 바람의 신발)
    const goldenCandidatesClose = reachableCells.filter(
      c => c.id !== exitCellId && c.id !== keyCellId && c.dist >= 1 && c.dist <= 2
    );
    const goldenCandidatesAll = reachableCells.filter(
      c => c.id !== exitCellId && c.id !== keyCellId
    );
    const goldenPool = goldenCandidatesClose.length > 0 ? goldenCandidatesClose : goldenCandidatesAll;
    if (goldenPool.length > 0) {
      goldenCellId = goldenPool[Math.floor(Math.random() * goldenPool.length)].id;
    } else {
      goldenCellId = null;
    }
    goldenItemType = Math.random() < 0.5 ? 'map' : 'boots';
    goldenItemCollected = false;

    // 4. 몬스터: 시작하자마자 로비로 들이닥치지 않도록, 로비(dist 0) 및 바로 옆방(dist 1)을 피해 거리 2 이상의 먼 방에 배치!
    const farCandidates = reachableCells.filter(c => c.dist >= 2);
    let monsterTarget = null;
    if (farCandidates.length > 0) {
      monsterTarget = farCandidates[Math.floor(Math.random() * farCandidates.length)];
    } else {
      const sortedByDist = [...reachableCells].sort((a, b) => b.dist - a.dist);
      monsterTarget = sortedByDist[0];
    }

    monster.cellId = monsterTarget.id;
    monster.lx = CONFIG.ROOM_OUTER_W / 2;
    monster.ly = CONFIG.ROOM_OUTER_H / 2;
    monster.state = 'wandering';
    monster.wanderCooldown = 90; // 게임 시작 직후 3초간 대기 후 순찰 시작
    monster.targetDir = null;
    monster.passedCenter = true;
    monster.lastEnteredFrom = null;

    console.log(
      "[Master] Stage 1 Placement -> Exit:", exitCellId,
      "Key:", keyCellId,
      "GoldenRoom:", goldenCellId, `(${goldenItemType})`,
      "Monster:", monster.cellId, `(dist: ${monsterTarget.dist})`
    );
  }
}

/**
 * 스테이지 클리어 시 (Stage 1 -> Stage 2 또는 Stage 2 -> Stage 3):
 * - 현재 플레이어가 있는 방(E)만 남기고 잠시 페이드아웃
 * - 지금까지 개척했던 이전 방들(A -> B -> C -> D)을 개척 순서대로 하나씩 쭈르륵 닫음
 * - 모두 닫힌 뒤 E 방에서부터 다음 스테이지(Stage 2 또는 Stage 3) 시작
 */
function startStageTransition(toStage) {
  if (isStageTransition) return;
  const fromStage = currentStage;
  isStageTransition = true;

  const survivingCell = cellMap.get(player.cellId);
  if (!survivingCell) {
    isStageTransition = false;
    return;
  }

  // 플레이어 이동 정지 및 키 입력 초기화
  keys.clear();
  wasSpacePressed = false;
  lastPromptDir = null;
  player.vx = 0; player.vy = 0;
  player.kx = 0; player.ky = 0;
  player.lx = CONFIG.ROOM_OUTER_W / 2;
  player.ly = CONFIG.ROOM_OUTER_H / 2;

  // Map은 삽입(개척) 순서를 보장하므로, 현재 방(E)을 제외한 나머지 방들이 정확히 A -> B -> C -> D 순서가 됨
  const roomsToClose = Array.from(cellMap.values()).filter(c => c.id !== survivingCell.id);
  for (const r of roomsToClose) {
    closingWinIds.add(r.winId);
  }

  console.log(
    `[Master] Stage ${fromStage} -> Stage ${toStage} 전환 시작! 남는 방: ${survivingCell.id} (${survivingCell.winId}), 순차 닫기 대상(${roomsToClose.length}개):`,
    roomsToClose.map(r => r.id)
  );

  // 1. E 방 페이드아웃 연출 시작 브로드캐스트
  channel.send(MSG.STAGE_TRANSITION, {
    phase: 'start',
    fromStage,
    toStage,
    activeCellId: survivingCell.id,
    activeWinId: survivingCell.winId,
    totalClosing: roomsToClose.length
  });

  // 2. 약간의 페이드아웃(350ms) 후 A -> B -> C -> D 순서대로 160ms 간격으로 쭈르륵 창 닫기
  // (단, Stage 4처럼 이미 다른 방들을 먼저 닫은 상태에서 호출된 경우 대기 시간을 최소화하고 즉시 다음 스테이지 초기화)
  if (roomsToClose.length === 0) {
    setTimeout(() => {
      if (toStage === 2) {
        initStage2(survivingCell);
      } else if (toStage === 3) {
        initStage3(survivingCell);
      } else if (toStage === 4) {
        initStage4(survivingCell);
      } else if (toStage === 5) {
        initStage5(survivingCell);
      }
    }, 420);
    return;
  }

  setTimeout(() => {
    let idx = 0;
    const cascadeTimer = setInterval(() => {
      if (idx < roomsToClose.length) {
        const room = roomsToClose[idx++];
        cellMap.delete(room.id);
        channel.send(MSG.CLOSE_ROOM, {
          targetWinId: room.winId,
          cellId: room.id,
          closedCount: idx,
          totalClosing: roomsToClose.length
        });
      } else {
        clearInterval(cascadeTimer);
        setTimeout(() => {
          if (toStage === 2) {
            initStage2(survivingCell);
          } else if (toStage === 3) {
            initStage3(survivingCell);
          } else if (toStage === 4) {
            initStage4(survivingCell);
          } else if (toStage === 5) {
            initStage5(survivingCell);
          }
        }, 420);
      }
    }, 160);
  }, 350);
}

/**
 * Stage 4 성검 포획 시 연출 시퀀스:
 * 1) 성검 획득 직후 현재 방은 밝은 상태로 유지한 채 다른 방들을 개척 순서대로 먼저 하나씩 닫음 ('closing_rooms')
 * 2) 다른 방들이 모두 꺼진 직후, 현재 방의 모든 빛이 성검으로 모이며 어두워지는 연출 진행 ('absorbing_light')
 */
function startStage4RoomCloseCascade(survivingCellId) {
  const roomsToClose = Array.from(cellMap.values()).filter(c => c.id !== survivingCellId);
  for (const r of roomsToClose) {
    closingWinIds.add(r.winId);
  }

  setTimeout(() => {
    if (currentStage !== 4 || !hasLegendarySword) return;
    let idx = 0;
    const cascadeTimer = setInterval(() => {
      if (currentStage !== 4 || !hasLegendarySword) {
        clearInterval(cascadeTimer);
        return;
      }
      if (idx < roomsToClose.length) {
        const room = roomsToClose[idx++];
        cellMap.delete(room.id);
        channel.send(MSG.CLOSE_ROOM, {
          targetWinId: room.winId,
          cellId: room.id,
          closedCount: idx,
          totalClosing: roomsToClose.length
        });
      } else {
        clearInterval(cascadeTimer);
        setTimeout(() => {
          if (currentStage === 4 && hasLegendarySword) {
            stage4SequencePhase = 'absorbing_light';
            swordAwakenTimer = 1;
            channel.send(MSG.SWORD_DRAWN, {
              cellId: survivingCellId,
              activeCellId: survivingCellId,
              phase: 'absorbing'
            });
          }
        }, 180);
      }
    }, 160);
  }, 200);
}

/**
 * 새 스테이지 진입 시 남는 방(survivingCell)만 유지하고 전체 도달 가능 그리드를 재계산하는 공용 헬퍼
 */
function prepareStageGridAndSurvivingRoom(startCell, nextStage) {
  currentStage = nextStage;
  isStageTransition = false;

  cellMap.clear();
  const targetScreen = screens.find(s => s.label === startCell.screenLabel) || screens[0];
  if (targetScreen) {
    startCell.doors = calculateDoors(targetScreen, startCell.gx, startCell.gy);
  }
  cellMap.set(startCell.id, startCell);

  const { reachableCells, allCells } = computeReachableGrid(startCell.screenLabel, startCell.gx, startCell.gy);
  allReachableCells = allCells;

  return {
    reachableCells,
    allCells,
    cx: CONFIG.ROOM_OUTER_W / 2,
    cy: CONFIG.ROOM_OUTER_H / 2
  };
}

/**
 * 스테이지 시작 시 플레이어 위치·속도·무적 타이머 초기화 공용 헬퍼
 */
function resetPlayerForStage(cellId, lx, ly) {
  player.cellId = cellId;
  player.lx = lx;
  player.ly = ly;
  player.facing = 'up';
  player.vx = 0;
  player.vy = 0;
  player.kx = 0;
  player.ky = 0;
  player.stunTimer = 0;
  player.invulnerableTimer = 45; // 시작 후 1.5초간 안전 무적
}

/**
 * 시작 방에서 거리 2 이상 떨어진 방에 몬스터를 배치하는 공용 헬퍼
 */
function placeMonsterAtFarCell(reachableCells, wanderCooldown) {
  if (reachableCells.length === 0) return;
  const farCandidates = reachableCells.filter(c => c.dist >= 2);
  const monsterTarget = farCandidates.length > 0
    ? farCandidates[Math.floor(Math.random() * farCandidates.length)]
    : reachableCells[reachableCells.length - 1];

  monster.cellId = monsterTarget.id;
  monster.lx = CONFIG.ROOM_OUTER_W / 2;
  monster.ly = CONFIG.ROOM_OUTER_H / 2;
  monster.state = 'wandering';
  monster.wanderCooldown = wanderCooldown;
  monster.targetDir = null;
  monster.passedCenter = true;
  monster.lastEnteredFrom = null;
}

/**
 * 스테이지 초기화 완료 후 생존 방 상태 할당 및 페이드인(complete) 브로드캐스트 공용 헬퍼
 */
function broadcastStageTransitionComplete(startCell, fromStage, toStage) {
  channel.send(MSG.ASSIGN, buildAssignPayload(startCell, null));
  channel.send(MSG.STAGE_TRANSITION, {
    phase: 'complete',
    fromStage,
    toStage,
    activeCellId: startCell.id,
    activeWinId: startCell.winId
  });
}

/**
 * E 방만 남은 상태에서 Stage 2(영역 점령전 / 땅따먹기) 초기화
 */
function initStage2(startCell) {
  const { reachableCells, allCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 2);

  flagOwners.clear();
  for (const c of allCells) {
    flagOwners.set(c.id, 'neutral');
  }

  // 플레이어를 E 방 중앙 깃발 바로 아래쪽에 배치 (시작하자마자 [Space]로 첫 방 점령 가능하도록 유도)
  resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 38));

  // 몬스터를 E 방에서 거리 2 이상 떨어진 방에 배치하고 해당 방을 몬스터 초기 영토(🔴 1)로 설정
  if (reachableCells.length > 0) {
    placeMonsterAtFarCell(reachableCells, 12); // 0.4초 뒤 즉시 민첩하게 땅따먹기 시작
    flagOwners.set(monster.cellId, 'monster');
  }
  flagOwnersDirty = true;

  // Stage 2 제한 시간: (전체 방 개수 + 5초), 최대 20초
  const stage2DurationSec = Math.min(20, Math.max(10, allCells.length + 5));
  stage2TimeLeft = stage2DurationSec * CONFIG.TICK_HZ;
  isOvertime = false;

  console.log(`[Master] Stage 2 시작! (제한시간: ${stage2DurationSec}s, 전체 방: ${allCells.length}개) 시작 방:`, startCell.id, "몬스터 시작 방:", monster.cellId);

  broadcastStageTransitionComplete(startCell, 1, 2);
}

/**
 * Stage 3 전용: 현재 열려 있는 브라우저 창(cellMap)들을 따라
 * 레이저 발사대(⚡)에서 프리즘(💎)을 거쳐 고대 코어(🔮)까지 이어지는 실시간 광선 궤적을 계산합니다.
 * - 핵심 규칙: 인접한 방의 브라우저 창이 실제로 열려 있어야만(cellMap.has(nextId)) 레이저가 그 창으로 넘어갑니다!
 */
function computeLaserPath() {
  laserSegments = [];
  laserConnected = false;

  if (currentStage !== 3 || !laserSourceCellId || !cellMap.has(laserSourceCellId)) {
    return;
  }

  const visitedInBeam = new Set();
  let currId = laserSourceCellId;
  let inDir = null;
  let steps = 0;

  while (currId && steps < 32) {
    steps++;
    visitedInBeam.add(currId);

    // 고대 코어(목표 방)에 도달한 경우: 광선 연결 성공!
    if (currId === laserTargetCellId) {
      laserSegments.push({
        cellId: currId,
        inDir,
        outDir: null,
        blockedByClosedRoom: false,
        isCoreHit: true
      });
      laserConnected = true;
      break;
    }

    const outDir = prismDirs.get(currId) || null;
    if (!outDir) {
      laserSegments.push({
        cellId: currId,
        inDir,
        outDir: null,
        blockedByClosedRoom: false,
        isCoreHit: false
      });
      break;
    }

    // 프리즘이 방금 들어온 문 방향(inDir)을 그대로 가리키고 있으면 역방향 반사되어 더 나아가지 않음
    if (inDir && outDir === inDir) {
      laserSegments.push({
        cellId: currId,
        inDir,
        outDir,
        blockedByClosedRoom: false,
        isCoreHit: false
      });
      break;
    }

    const parsed = parseCellId(currId);
    if (!parsed) break;

    const adj = getAdjacentCell(parsed.screenLabel, parsed.gx, parsed.gy, outDir);
    if (!adj) {
      // 해당 방향에 문/인접 셀이 없는 경우
      laserSegments.push({
        cellId: currId,
        inDir,
        outDir,
        blockedByClosedRoom: false,
        isCoreHit: false
      });
      break;
    }

    const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

    // 핵심: 다음 방 브라우저 창이 아직 화면에 열려 있지 않다면 문턱에서 스파크를 내며 막힘!
    if (!cellMap.has(nextId)) {
      laserSegments.push({
        cellId: currId,
        inDir,
        outDir,
        blockedByClosedRoom: true,
        isCoreHit: false
      });
      break;
    }

    // 다음 방 창이 열려 있다면 현재 방 통과 기록 후 다음 방으로 광선 전파
    laserSegments.push({
      cellId: currId,
      inDir,
      outDir,
      blockedByClosedRoom: false,
      isCoreHit: false
    });

    const nextInDir = OPPOSITE_DIR[outDir];
    if (visitedInBeam.has(nextId)) {
      // 루프 방지
      break;
    }

    currId = nextId;
    inDir = nextInDir;
  }
}

/**
 * 남는 방에서 Stage 3(크로스 윈도우 레이저 & 빛을 잃은 성검 부활 퍼즐) 초기화
 */
function initStage3(startCell) {
  const { reachableCells, allCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 3);
  laserConnected = false;
  laserChargeTimer = 0;
  laserTargetDiscovered = hasMapItem;
  laserSourceCellId = startCell.id;

  // 목표 성검 제단 방(🗡️ 빛을 잃은 성검): 시작 방에서 거리 2(최우선) 또는 거리 2~3 떨어진 방에 배치하여 최소 1개 이상의 프리즘 방을 거치도록 설계
  const dist2Candidates = reachableCells.filter(c => c.dist === 2);
  const distFarCandidates = reachableCells.filter(c => c.dist >= 2);
  const targetPool = dist2Candidates.length > 0
    ? dist2Candidates
    : (distFarCandidates.length > 0 ? distFarCandidates : reachableCells);

  if (targetPool.length > 0) {
    const chosenTarget = targetPool[Math.floor(Math.random() * targetPool.length)];
    laserTargetCellId = chosenTarget.id;
  } else {
    laserTargetCellId = startCell.id;
  }

  // 모든 방에 회전 가능한 프리즘(발사대 포함) 초기 방향 설정 (해당 방에 실제로 존재하는 문 방향 중 하나)
  const cwOrder = ['up', 'right', 'down', 'left'];
  prismDirs.clear();
  for (const c of allCells) {
    if (c.id === laserTargetCellId) continue;
    const validDoors = cwOrder.filter(d => c.doors.includes(d));
    if (validDoors.length > 0) {
      const randomDir = validDoors[Math.floor(Math.random() * validDoors.length)];
      prismDirs.set(c.id, randomDir);
    }
  }
  prismDirsDirty = true;

  computeLaserPath();

  // 플레이어를 시작 방(⚡ 발사대) 바로 아래쪽에 배치
  resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 38));

  // 방해꾼 몬스터를 거리 2 이상 떨어진 방에 배치 (1.5초 후 순찰 시작)
  placeMonsterAtFarCell(reachableCells, 45);

  console.log(
    `[Master] Stage 3 시작! 발사대(⚡): ${laserSourceCellId}, 성검 제단(🗡️): ${laserTargetCellId}, 몬스터: ${monster.cellId}`
  );

  broadcastStageTransitionComplete(startCell, 2, 3);
}

/**
 * 남는 방에서 Stage 4(도망치는 자아 성검 포획작전 — The Flying Sword Chase & Trap) 초기화
 */
function initStage4(startCell) {
  const { reachableCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 4);
  hasLegendarySword = false;
  swordAwakenTimer = 0;
  stage4SequencePhase = 'none';
  closedGates.clear();
  closedGatesDirty = true;

  // 시작 방 중앙에서 자아를 가진 성검이 깨어나 잠시 후 열린 문으로 고속 도주!
  flyingSword.cellId = startCell.id;
  flyingSword.lx = cx;
  flyingSword.ly = cy - 12;
  flyingSword.vx = 0;
  flyingSword.vy = 0;
  flyingSword.angle = -Math.PI / 2;
  flyingSword.state = 'awakening';
  flyingSword.passedCenter = true;
  flyingSword.targetDir = null;
  flyingSword.awakeningTimer = 16; // 약 0.5초간 각성 후 즉시 고속 비행 시작!
  flyingSword.groggyTimer = 0;
  flyingSword.lastEnteredFrom = null;
  flyingSword.lastBouncedDir = null;
  flyingSword.lastTransit = null;

  // 플레이어를 시작 방 아래쪽에 배치
  resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 44));

  // 방해꾼 몬스터를 거리 2 이상 떨어진 방에 배치
  placeMonsterAtFarCell(reachableCells, 40);

  console.log(
    `[Master] Stage 4 시작! 도망치는 성검(🗡️) 시작 위치: ${flyingSword.cellId}`
  );

  broadcastStageTransitionComplete(startCell, 3, 4);
}

/**
 * Stage 5 전용: 보스가 순간이동할 다음 방을 선택합니다.
 * - 현재 플레이어가 있는 방(excludeCellId)이 아닌 다른 방 중에서,
 *   열린 방/미개척 방 구분 없이 거리 1~2 이내의 방들을 고르게 후보로 삼고,
 *   직전에 보스전(탄막·전투)이 벌어졌던 방으로는 되돌아가지 않도록 감점합니다.
 */
function pickNextBossRoom(excludeCellId) {
  const parsedFrom = parseCellId(excludeCellId);
  const candidates = allReachableCells.filter(c => c.id !== excludeCellId);
  if (candidates.length === 0) return excludeCellId;

  const visitedList = Array.isArray(boss.visitedCellIds) ? boss.visitedCellIds : [];

  const scored = candidates.map(c => {
    let score = Math.random() * 25;
    if (parsedFrom) {
      const mDist = Math.abs(c.gx - parsedFrom.gx) + Math.abs(c.gy - parsedFrom.gy);
      if (mDist === 1) score += 42;
      else if (mDist === 2) score += 40;
      else score -= mDist * 10;
    }
    if (candidates.length > 1) {
      if (c.id === boss.cellId || c.id === boss.barrageCellId) {
        score -= 80;
      } else if (visitedList.includes(c.id)) {
        score -= 55;
      }
    }
    return { id: c.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosenId = scored[0].id;
  if (!visitedList.includes(excludeCellId)) {
    visitedList.push(excludeCellId);
  }
  if (!visitedList.includes(chosenId)) {
    visitedList.push(chosenId);
  }
  boss.visitedCellIds = visitedList;
  return chosenId;
}

/**
 * 남는 방에서 Stage 5(심연의 마왕 — 탄막 피하기 & 방 추격 성검 결전) 초기화
 */
function initStage5(startCell) {
  const { cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 5);
  hasLegendarySword = true;
  closedGates.clear();
  monster.cellId = null; // 최종 보스전에서는 잡몹 대신 심연의 마왕(👑)과 1:1 결전!

  // 플레이어를 시작 방 중앙에 배치 (전설의 성검 장착 상태)
  resetPlayerForStage(startCell.id, cx, cy + 20);

  // 시작 방에서 즉시 1차 탄막 피하기('barrage', 5초 = 150틱) 시작 & 보스는 다른 방에 은신!
  boss.hp = 3;
  boss.maxHp = 3;
  boss.cellId = null;
  boss.barrageCellId = startCell.id;
  boss.visitedCellIds = [startCell.id];
  boss.cellId = pickNextBossRoom(startCell.id);
  boss.lx = cx;
  boss.ly = cy;
  boss.state = 'barrage';
  boss.barrageDuration = 150; // 5.0초간 탄막 피하기
  boss.actionTimer = 150;
  boss.searchDuration = 330;  // 11.0초간 보스 추격 제한 시간
  boss.searchTimer = 330;
  boss.spawnTimer = 0;
  boss.patternStep = 0;
  boss.bullets = [];
  boss.slashEffect = null;

  console.log(
    `[Master] Stage 5 최종 보스전 시작! 시작 방(${startCell.id}) 탄막 피하기 발동, 보스(👑 HP ${boss.hp}/${boss.maxHp}) 은신 위치: ${boss.cellId}`
  );

  broadcastStageTransitionComplete(startCell, 4, 5);
}

function getFlagScores() {
  if (flagOwnersDirty) {
    getFlagOwnersSnapshot();
  }
  return cachedFlagScores;
}

function triggerFinalVictory() {
  if (isVictory) return;
  isVictory = true;
  victoryTimestamp = Date.now();
  keys.delete(' ');
  wasSpacePressed = false;
  const { playerScore, monsterScore } = getFlagScores();
  console.log(`[Master] 최종 승리! (Stage ${currentStage}) 🟢 ${playerScore} vs 🔴 ${monsterScore}`);

  const minTop = screens.length > 0 ? Math.min(...screens.map(s => s.availTop)) : 0;
  const maxBottom = screens.length > 0 ? Math.max(...screens.map(s => s.availTop + s.availHeight)) : CONFIG.ROOM_OUTER_H;
  const minLeft = screens.length > 0 ? Math.min(...screens.map(s => s.availLeft)) : 0;
  const maxRight = screens.length > 0 ? Math.max(...screens.map(s => s.availLeft + s.availWidth)) : CONFIG.ROOM_OUTER_W;

  const cellsList = Array.from(cellMap.values());
  const roomsMinTop = cellsList.length > 0 ? Math.min(...cellsList.map(c => c.rect.top)) : minTop;
  const roomsMaxBottom = cellsList.length > 0 ? Math.max(...cellsList.map(c => c.rect.top + c.rect.height)) : maxBottom;

  const activeCell = cellMap.get(player.cellId);
  channel.send(MSG.VICTORY, {
    winnerWinId: activeCell ? activeCell.winId : 'lobby',
    stage: currentStage,
    playerScore,
    monsterScore,
    globalBounds: {
      minTop, maxBottom, minLeft, maxRight,
      roomsMinTop, roomsMaxBottom,
      totalHeight: maxBottom - minTop
    },
    startTime: Date.now()
  });
}

let currentScreenLabel = null;

channel.on(MSG.SCREENS_UPDATE, (data) => {
  screens = data.screens;
  currentScreenLabel = data.currentScreenLabel;
  if (data.roomW && data.roomH) {
    CONFIG.ROOM_OUTER_W = data.roomW;
    CONFIG.ROOM_OUTER_H = data.roomH;
    CONFIG.ROOM_SLOT_W = data.slotW || data.roomW;
    CONFIG.ROOM_SLOT_H = data.slotH || (data.roomH + (CONFIG.CHROME_OVERHEAD_Y || 63));
    if (cellMap.size === 0) {
      player.lx = CONFIG.ROOM_OUTER_W / 2;
      player.ly = CONFIG.ROOM_OUTER_H / 2;
    }
  }
  if (!exitCellId) {
    const lobby = Array.from(cellMap.values()).find(c => c.gx === 0 && c.gy === 0);
    if (lobby) generateDungeonEntities(lobby.screenLabel, 0, 0);
  } else if (cellMap.size > 0) {
    const firstCell = Array.from(cellMap.values())[0];
    const { allCells } = computeReachableGrid(firstCell.screenLabel, firstCell.gx, firstCell.gy);
    allReachableCells = allCells;
  }
});

channel.on(MSG.HELLO, (data) => {
  try {
    if (data.overheadY && data.overheadY > 0) {
      CONFIG.CHROME_OVERHEAD_Y = data.overheadY;
      if (CONFIG.ROOM_SLOT_H) {
        CONFIG.ROOM_OUTER_H = CONFIG.ROOM_SLOT_H - CONFIG.CHROME_OVERHEAD_Y;
      }
    }
    let cell = Array.from(cellMap.values()).find(c => c.winId === data.winId);

    if (!cell) {
      if (data.winId === 'lobby' && screens.length > 0) {
        const targetScreen = screens.find(s => s.label === currentScreenLabel) || screens.find(s => s.isPrimary) || screens[0];
        const lobbyId = getCellId(targetScreen.label, 0, 0);
        cell = {
          id: lobbyId,
          gx: 0, gy: 0,
          screenLabel: targetScreen.label,
          doors: calculateDoors(targetScreen, 0, 0),
          winId: 'lobby',
          rect: cellToScreenRect(targetScreen, 0, 0, CONFIG)
        };
        cellMap.set(lobbyId, cell);
        player.cellId = lobbyId;

        if (!exitCellId) {
          generateDungeonEntities(targetScreen.label, 0, 0);
        }
      }
    }

    if (cell) {
      // 해당 방이 열쇠 방, 탈출문 방, 황금방, 또는 Stage 3 코어 방이면 발견 처리
      if (currentStage === 1) {
        if (cell.id === exitCellId) exitDiscovered = true;
        if (cell.id === keyCellId) keyDiscovered = true;
        if (cell.id === goldenCellId) goldenDiscovered = true;
      } else if (currentStage === 3) {
        if (cell.id === laserTargetCellId) laserTargetDiscovered = true;
        computeLaserPath();
      }

      if (screens.length > 0) {
        channel.send(MSG.SCREENS_UPDATE, {
          screens,
          currentScreenLabel,
          roomW: CONFIG.ROOM_OUTER_W,
          roomH: CONFIG.ROOM_OUTER_H,
          slotW: CONFIG.ROOM_SLOT_W,
          slotH: CONFIG.ROOM_SLOT_H
        });
      }

      // 전체 개척된 방 동기화 브로드캐스트
      const recentTransition = (lastDoorTransition && (Date.now() - lastDoorTransition.timestamp < 800))
        ? lastDoorTransition
        : null;
      for (const c of cellMap.values()) {
        channel.send(MSG.ASSIGN, buildAssignPayload(c, recentTransition));
      }
    } else {
      console.warn("[Master] 알 수 없는 방 접속:", data.winId);
    }
  } catch (error) {
    console.error("[Master] Error in HELLO handler:", error);
  }
});

channel.on(MSG.SOUND_MUTE_SYNC, (data) => {
  isMuted = !!data.isMuted;
});

channel.on(MSG.DOOR_CONFIRM, (data) => {
  if (isStageTransition) return;
  const currentCell = cellMap.get(player.cellId);
  if (!currentCell) return;
  if (isGateClosed(currentCell.id, data.dir)) return;

  const adj = getAdjacentCell(currentCell.screenLabel, currentCell.gx, currentCell.gy, data.dir);
  if (!adj) return;

  const fromCellId = currentCell.id;
  const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

  if (!cellMap.has(nextId)) {
    const actualRect = data.actualRect || cellToScreenRect(adj.screen, adj.gx, adj.gy, CONFIG);
    cellMap.set(nextId, {
      id: nextId, gx: adj.gx, gy: adj.gy, screenLabel: adj.screen.label,
      doors: calculateDoors(adj.screen, adj.gx, adj.gy),
      winId: data.targetWinId,
      rect: actualRect
    });
  }

  if (currentStage === 2 && !flagOwners.has(nextId)) {
    flagOwners.set(nextId, 'neutral');
    flagOwnersDirty = true;
  }

  player.cellId = nextId;
  if (currentStage === 1) {
    if (player.cellId === exitCellId) exitDiscovered = true;
    if (player.cellId === keyCellId) keyDiscovered = true;
    if (player.cellId === goldenCellId) goldenDiscovered = true;
  } else if (currentStage === 3) {
    if (player.cellId === laserTargetCellId) laserTargetDiscovered = true;
    const openedCell = cellMap.get(nextId);
    if (openedCell && nextId !== laserTargetCellId && !prismDirs.has(nextId)) {
      const cwOrder = ['up', 'right', 'down', 'left'];
      const validDoors = cwOrder.filter(d => openedCell.doors.includes(d));
      if (validDoors.length > 0) {
        prismDirs.set(nextId, validDoors[0]);
        prismDirsDirty = true;
      }
    }
    computeLaserPath();
  }

  // 방 이동 크로스 윈도우 전이 이벤트 기록
  lastDoorTransition = {
    id: ++doorTransitionSeq,
    fromCellId,
    toCellId: nextId,
    dir: data.dir,
    timestamp: Date.now()
  };
  doorTransferCooldown = 5; // 이동 직후 약 0.16초간 중복 문 트리거 방지

  const nextCell = cellMap.get(nextId);
  if (nextCell) {
    channel.send(MSG.ASSIGN, buildAssignPayload(nextCell, lastDoorTransition));
  }

  // Stage 1, 3, 4에서는 플레이어 방 이동 시 몬스터에게 짧은 반응 딜레이 부여 (Stage 2는 영토 점령에 집중하도록 딜레이 없음)
  if (currentStage === 1 || currentStage === 3 || currentStage === 4) {
    monster.wanderCooldown = Math.max(monster.wanderCooldown, 18);
  }

  keys.clear();
  wasSpacePressed = false;
  lastPromptDir = null;
  player.vx = 0; player.vy = 0;
  player.kx = 0; player.ky = 0;

  // 다음 방에 도착했을 때 어색하게 멀리 떨어지지 않고 방금 통과한 문틀 바로 앞(24px) 중앙에 자연스럽게 위치
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;
  const doorSpawnMargin = 24;
  if (data.dir === 'up') {
    player.lx = cx;
    player.ly = CONFIG.ROOM_OUTER_H - doorSpawnMargin;
    player.facing = 'up';
  } else if (data.dir === 'down') {
    player.lx = cx;
    player.ly = doorSpawnMargin;
    player.facing = 'down';
  } else if (data.dir === 'left') {
    player.lx = CONFIG.ROOM_OUTER_W - doorSpawnMargin;
    player.ly = cy;
    player.facing = 'left';
  } else if (data.dir === 'right') {
    player.lx = doorSpawnMargin;
    player.ly = cy;
    player.facing = 'right';
  }
});

channel.on(MSG.INPUT, (data) => {
  keys.clear();
  data.keys.forEach(k => keys.add(k));

  // 승리 직후 1.8초(1800ms) 동안은 스페이스바 연타로 인해 승리 화면이 스킵되지 않도록 보호!
  if (isVictory && keys.has(' ') && (Date.now() - victoryTimestamp >= 1800)) {
    if (!isClosing) {
      isClosing = true;
      channel.send(MSG.CLOSE_ALL);
    }
  }
});

channel.on(MSG.BYE, (data) => {
  // 스테이지 전환(순차 창 닫기) 중 닫히는 방의 BYE는 전체 종료(CLOSE_ALL)를 트리거하지 않음
  if (isClosing || isStageTransition) return;
  if (data && data.winId && closingWinIds.has(data.winId)) {
    closingWinIds.delete(data.winId);
    return;
  }
  isClosing = true;
  channel.send(MSG.CLOSE_ALL);
});

const TICK_MS = 1000 / CONFIG.TICK_HZ;
let tickCount = 0;
let lastPromptDir = null;

const OPPOSITE_DIR = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
};

function getDoorPosition(dir, margin = 24) {
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;
  if (dir === 'up') return { x: cx, y: margin };
  if (dir === 'down') return { x: cx, y: CONFIG.ROOM_OUTER_H - margin };
  if (dir === 'left') return { x: margin, y: cy };
  return { x: CONFIG.ROOM_OUTER_W - margin, y: cy };
}

function moveMonsterToward(targetX, targetY, moveSpeed) {
  const mdx = targetX - monster.lx;
  const mdy = targetY - monster.ly;
  const dist = Math.hypot(mdx, mdy);

  if (Math.abs(mdx) > Math.abs(mdy)) {
    monster.facing = mdx >= 0 ? 'right' : 'left';
  } else if (dist > 0.5) {
    monster.facing = mdy >= 0 ? 'down' : 'up';
  }

  if (dist <= moveSpeed + 1.5) {
    monster.lx = targetX;
    monster.ly = targetY;
    monster.vx = 0;
    monster.vy = 0;
    return true;
  }

  monster.vx = (mdx / dist) * moveSpeed;
  monster.vy = (mdy / dist) * moveSpeed;
  monster.lx += monster.vx;
  monster.ly += monster.vy;
  return false;
}

/**
 * Stage 2 전용: 몬스터의 현재 방에서 가장 가까운 미점령 방('neutral' 또는 'player' 소유 방)으로 향하는
 * 최단 경로의 첫 번째 이동 방향('up'|'down'|'left'|'right')을 BFS로 탐색합니다.
 */
function findBestStage2Dir(startScreenLabel, startGx, startGy, lastEnteredFrom) {
  const allDirs = ['up', 'down', 'left', 'right'];
  const validDirs = allDirs.filter(d => getAdjacentCell(startScreenLabel, startGx, startGy, d) !== null);
  if (validDirs.length === 0) return null;

  // 방금 들어온 방향이 아닌 방향을 우선 탐색하도록 정렬
  const orderedDirs = [
    ...validDirs.filter(d => d !== lastEnteredFrom),
    ...validDirs.filter(d => d === lastEnteredFrom)
  ];

  const visited = new Set([getCellId(startScreenLabel, startGx, startGy)]);
  const queue = [];

  for (const dir of orderedDirs) {
    const adj = getAdjacentCell(startScreenLabel, startGx, startGy, dir);
    if (!adj) continue;
    const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
    visited.add(adjId);
    if (flagOwners.get(adjId) !== 'monster') {
      return dir; // 바로 인접한 방이 중립 또는 플레이어 방이면 즉시 그곳으로 이동!
    }
    queue.push({ screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy, firstDir: dir });
  }

  while (queue.length > 0) {
    const curr = queue.shift();
    for (const dir of allDirs) {
      const adj = getAdjacentCell(curr.screenLabel, curr.gx, curr.gy, dir);
      if (!adj) continue;
      const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
      if (visited.has(adjId)) continue;
      visited.add(adjId);
      if (flagOwners.get(adjId) !== 'monster') {
        return curr.firstDir;
      }
      queue.push({ screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy, firstDir: curr.firstDir });
    }
  }

  // 모든 방을 이미 점령했다면 직전 진입 문이 아닌 방향 중 랜덤 순찰
  const forwardDirs = validDirs.filter(d => d !== lastEnteredFrom);
  const pool = forwardDirs.length > 0 ? forwardDirs : validDirs;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 몬스터 AI 업데이트:
 * - Stage 1: 평소에는 순찰하다가 인접 방/같은 방에 플레이어가 있으면 추적(Chasing) 및 타격
 * - Stage 2: 플레이어를 쫓아다니는 대신, 더 민첩한 속도로 미점령 방('neutral'/'player') 최단 경로를 찾아
 *   방 중앙 깃발을 점령하고 다음 방으로 빠르게 넘어가는 영토 확장 우선 AI 동작
 */
function updateMonsterAI() {
  if (!monster.cellId || isVictory || isStageTransition) return;

  const isSameRoom = (monster.cellId === player.cellId);
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  // Stage 2: 몬스터가 방 중앙(깃발 반경 28px 이내)을 지나가면 해당 방을 적 영토('monster')로 즉시 점령!
  if (currentStage === 2 && flagOwners.get(monster.cellId) !== 'monster') {
    const distToCenter = Math.hypot(monster.lx - cx, monster.ly - cy);
    if (distToCenter < 28) {
      flagOwners.set(monster.cellId, 'monster');
      flagOwnersDirty = true;
      channel.send(MSG.FLAG_CAPTURED, {
        cellId: monster.cellId,
        owner: 'monster',
        activeCellId: player.cellId
      });
    }
  }

  // 현재 몬스터가 위치한 셀 좌표 파악 (cellId 형식: "label:gx,gy")
  const parsedMonsterCell = parseCellId(monster.cellId);
  const mScreenLabel = parsedMonsterCell ? parsedMonsterCell.screenLabel : '';
  const mGx = parsedMonsterCell ? parsedMonsterCell.gx : 0;
  const mGy = parsedMonsterCell ? parsedMonsterCell.gy : 0;
  const allDirs = ['up', 'down', 'left', 'right'];

  // =========================================================
  // STAGE 2 전용 AI: 플레이어 추격보다 민첩한 영토 점령 최우선!
  // =========================================================
  if (currentStage === 2) {
    monster.state = 'wandering';

    if (monster.attackCooldown > 0) {
      monster.attackCooldown--;
    }

    // 같은 방에서 이동 중 플레이어와 직접 부딪히면 넉백 타격은 그대로 발생
    if (isSameRoom) {
      const distToPlayer = Math.hypot(player.lx - monster.lx, player.ly - monster.ly);
      if (distToPlayer < player.radius + monster.radius && player.invulnerableTimer <= 0 && monster.attackCooldown <= 0) {
        player.stunTimer = 12;
        player.invulnerableTimer = 65;
        monster.attackCooldown = 20;

        const angle = Math.atan2(player.ly - monster.ly, player.lx - monster.lx);
        player.kx = Math.cos(angle) * 15;
        player.ky = Math.sin(angle) * 15;
        channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
      }
    }

    if (monster.wanderCooldown > 0) {
      monster.wanderCooldown--;
      return;
    }

    // Stage 2 민첩 이동 속도 (기본 추적 속도보다 약간 더 빠르고 경쾌하게 거점 간 이동)
    const stage2MoveSpeed = monster.speed * 1.1;

    // 현재 방 깃발이 아직 내(몬스터) 것이 아니거나 중앙을 경유하지 않았다면 무조건 방 중앙(깃발)으로 직행!
    if (!monster.passedCenter || flagOwners.get(monster.cellId) !== 'monster') {
      const reachedCenter = moveMonsterToward(cx, cy, stage2MoveSpeed);
      if (reachedCenter) {
        monster.passedCenter = true;
        if (flagOwners.get(monster.cellId) !== 'monster') {
          flagOwners.set(monster.cellId, 'monster');
          flagOwnersDirty = true;
          channel.send(MSG.FLAG_CAPTURED, {
            cellId: monster.cellId,
            owner: 'monster',
            activeCellId: player.cellId
          });
        }
        // 중앙 깃발 점령 직후 다음 미점령 방 방향을 즉시 탐색
        monster.targetDir = findBestStage2Dir(mScreenLabel, mGx, mGy, monster.lastEnteredFrom);
      }
    } else {
      const validDirs = allDirs.filter(d => getAdjacentCell(mScreenLabel, mGx, mGy, d) !== null);
      if (validDirs.length === 0) return;

      if (!monster.targetDir || !validDirs.includes(monster.targetDir)) {
        monster.targetDir = findBestStage2Dir(mScreenLabel, mGx, mGy, monster.lastEnteredFrom);
      }

      if (monster.targetDir) {
        const doorPos = getDoorPosition(monster.targetDir, 22);
        const reachedDoor = moveMonsterToward(doorPos.x, doorPos.y, stage2MoveSpeed);
        if (reachedDoor) {
          const adj = getAdjacentCell(mScreenLabel, mGx, mGy, monster.targetDir);
          if (adj) {
            const enteredFrom = OPPOSITE_DIR[monster.targetDir];
            const entryPos = getDoorPosition(enteredFrom, 26);
            monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
            monster.lx = entryPos.x;
            monster.ly = entryPos.y;
            monster.facing = monster.targetDir;
            monster.lastEnteredFrom = enteredFrom;
            monster.targetDir = null;
            monster.passedCenter = false;
          } else {
            monster.targetDir = null;
          }
        }
      }
    }

    const mMinX = 22; const mMaxX = CONFIG.ROOM_OUTER_W - 22;
    const mMinY = 22; const mMaxY = CONFIG.ROOM_OUTER_H - 22;
    monster.lx = Math.max(mMinX, Math.min(monster.lx, mMaxX));
    monster.ly = Math.max(mMinY, Math.min(monster.ly, mMaxY));
    return;
  }

  // =========================================================
  // STAGE 1, 3, 4 공용 AI: 순찰 및 플레이어 감지 시 추격 (Stage 4에서는 닫힌 철창 통과 불가!)
  // =========================================================
  let dirToPlayerRoom = null;
  if (!isSameRoom) {
    for (const d of allDirs) {
      if (isGateClosed(monster.cellId, d)) continue;
      const adj = getAdjacentCell(mScreenLabel, mGx, mGy, d);
      if (adj && getCellId(adj.screen.label, adj.gx, adj.gy) === player.cellId) {
        dirToPlayerRoom = d;
        break;
      }
    }
  }

  // 상태 전환: 같은 방이거나 바로 옆방(문으로 연결된 방)이면 추적 상태
  if (isSameRoom || dirToPlayerRoom !== null) {
    monster.state = 'chasing';
  } else {
    monster.state = 'wandering';
  }

  if (isSameRoom) {
    // 1. 같은 방에 있을 때: 플레이어를 향해 직접 이동
    monster.targetDir = null;
    if (monster.attackCooldown > 0) {
      monster.attackCooldown--;
      monster.vx *= 0.8;
      monster.vy *= 0.8;
      monster.lx += monster.vx;
      monster.ly += monster.vy;
    } else {
      const mdx = player.lx - monster.lx;
      const mdy = player.ly - monster.ly;
      const dist = Math.hypot(mdx, mdy);

      if (dist > 5) {
        monster.vx = (mdx / dist) * monster.speed;
        monster.vy = (mdy / dist) * monster.speed;
        monster.lx += monster.vx;
        monster.ly += monster.vy;
      }

      if (Math.abs(mdx) > Math.abs(mdy)) {
        monster.facing = mdx > 0 ? 'right' : 'left';
      } else {
        monster.facing = mdy > 0 ? 'down' : 'up';
      }

      // 플레이어 피격 충돌 검사 (무적 시간 아닐 때만 피격 발생)
      if (dist < player.radius + monster.radius) {
        if (player.invulnerableTimer <= 0) {
          player.stunTimer = 14; // 약 0.45초간 짧은 스턴 (빠른 조작권 회복)
          player.invulnerableTimer = 75; // 2.5초간 완전 무적 (연속 피격 및 무한 공격 방지)
          monster.attackCooldown = 45; // 몬스터 공격 후 1.5초간 멈칫

          const angle = Math.atan2(player.ly - monster.ly, player.lx - monster.lx);
          player.kx = Math.cos(angle) * 16;
          player.ky = Math.sin(angle) * 16;

          monster.vx = -Math.cos(angle) * 3;
          monster.vy = -Math.sin(angle) * 3;

          channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
        }
      }
    }
  } else {
    if (monster.wanderCooldown > 0) {
      monster.wanderCooldown--;
      return;
    }

    if (dirToPlayerRoom) {
      if (monster.targetDir !== dirToPlayerRoom) {
        monster.targetDir = dirToPlayerRoom;
        const distFromCenter = Math.hypot(monster.lx - cx, monster.ly - cy);
        monster.passedCenter = distFromCenter < 45;
      }
    } else {
      const validDirs = allDirs.filter(
        d => getAdjacentCell(mScreenLabel, mGx, mGy, d) !== null && !isGateClosed(monster.cellId, d)
      );
      if (validDirs.length === 0) return;

      if (!monster.targetDir || !validDirs.includes(monster.targetDir)) {
        const forwardDirs = validDirs.filter(d => d !== monster.lastEnteredFrom);
        const candidateDirs = forwardDirs.length > 0 ? forwardDirs : validDirs;
        monster.targetDir = candidateDirs[Math.floor(Math.random() * candidateDirs.length)];
        monster.passedCenter = false;
      }
    }

    if (!monster.targetDir || isGateClosed(monster.cellId, monster.targetDir)) {
      monster.targetDir = null;
      return;
    }

    const moveSpeed = dirToPlayerRoom ? monster.speed * 0.85 : monster.wanderSpeed;

    if (!monster.passedCenter) {
      const reachedCenter = moveMonsterToward(cx, cy, moveSpeed);
      if (reachedCenter) {
        monster.passedCenter = true;
      }
    } else {
      const doorPos = getDoorPosition(monster.targetDir, 22);
      const reachedDoor = moveMonsterToward(doorPos.x, doorPos.y, moveSpeed);

      if (reachedDoor) {
        const adj = getAdjacentCell(mScreenLabel, mGx, mGy, monster.targetDir);
        if (adj && !isGateClosed(monster.cellId, monster.targetDir)) {
          const enteredFrom = OPPOSITE_DIR[monster.targetDir];
          const entryPos = getDoorPosition(enteredFrom, 26);
          monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
          monster.lx = entryPos.x;
          monster.ly = entryPos.y;
          monster.facing = monster.targetDir;
          monster.lastEnteredFrom = enteredFrom;
          monster.targetDir = null;
          monster.passedCenter = false;
        } else {
          monster.targetDir = null;
        }
      }
    }
  }

  // 몬스터 방 내 좌표 클램핑
  const mMinX = 22; const mMaxX = CONFIG.ROOM_OUTER_W - 22;
  const mMinY = 22; const mMaxY = CONFIG.ROOM_OUTER_H - 22;
  monster.lx = Math.max(mMinX, Math.min(monster.lx, mMaxX));
  monster.ly = Math.max(mMinY, Math.min(monster.ly, mMaxY));
}

/**
 * Stage 4 전용: 창과 창 사이를 빠르게 날아다니는 자아 성검(🗡️) AI 업데이트
 * - 성검은 방 중앙에 멈춰 있지 않고, 입구 문 -> 방 중앙 -> 다음 문으로 빠르게(속도 6.2) 연속 비행합니다.
 * - 빠르게 날아가던 성검이 플레이어가 레버로 닫아둔 문(철창 🔒)에 부딪히면,
 *   강하게 튕겨나오며 약 3.7초(110틱) 동안 스턴/그로기('groggy') 상태에 빠져 움직이지 못합니다!
 * - 그로기 상태(또는 모든 문이 잠긴 'trapped' 상태)일 때 성검에게 다가가 [Space]로 포획할 수 있습니다.
 */
function updateFlyingSwordAI() {
  if (currentStage !== 4 || hasLegendarySword || !flyingSword.cellId || isVictory || isStageTransition) return;

  const parsed = parseCellId(flyingSword.cellId);
  if (!parsed) return;
  const { screenLabel, gx, gy } = parsed;
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;
  const allDirs = ['up', 'down', 'left', 'right'];

  const roomDoors = allDirs.filter(d => getAdjacentCell(screenLabel, gx, gy, d) !== null);
  const openDoors = roomDoors.filter(d => !isGateClosed(flyingSword.cellId, d));
  const SWORD_FLY_SPEED = 7.2;
  const GROGGY_DURATION = 84; // 약 2.8초간 스턴/그로기 후 깨어나 다시 도주!

  // 1. 닫힌 문에 부딪혀 스턴/그로기('groggy' / 'trapped') 상태일 때: 시간이 지나면 반드시 그로기가 풀리고 탈출!
  if (flyingSword.state === 'groggy' || flyingSword.state === 'trapped') {
    flyingSword.lx += flyingSword.vx;
    flyingSword.ly += flyingSword.vy;
    flyingSword.vx *= 0.82;
    flyingSword.vy *= 0.82;
    flyingSword.angle += 0.24;

    const margin = 36;
    flyingSword.lx = Math.max(margin, Math.min(CONFIG.ROOM_OUTER_W - margin, flyingSword.lx));
    flyingSword.ly = Math.max(margin, Math.min(CONFIG.ROOM_OUTER_H - margin, flyingSword.ly));

    flyingSword.state = (openDoors.length === 0) ? 'trapped' : 'groggy';
    flyingSword.groggyTimer--;

    if (flyingSword.groggyTimer <= 0) {
      // 만약 그로기가 끝날 때까지 방의 모든 문이 닫혀 있었다면, 성검이 충격파로 철창 하나를 튕겨내어 열고 탈출!
      let currentOpenDoors = roomDoors.filter(d => !isGateClosed(flyingSword.cellId, d));
      if (currentOpenDoors.length === 0 && roomDoors.length > 0) {
        const breakDir = (flyingSword.lastBouncedDir && roomDoors.includes(flyingSword.lastBouncedDir))
          ? flyingSword.lastBouncedDir
          : roomDoors[Math.floor(Math.random() * roomDoors.length)];
        const gateKey = getGateKey(flyingSword.cellId, breakDir);
        if (gateKey) {
          closedGates.delete(gateKey);
          closedGatesDirty = true;
          channel.send(MSG.GATE_TOGGLED, {
            cellId: flyingSword.cellId,
            dir: breakDir,
            isClosed: false,
            activeCellId: player.cellId
          });
        }
        currentOpenDoors = [breakDir];
      }

      flyingSword.state = 'flying';
      flyingSword.passedCenter = true;
      // 그로기에서 깨어난 직후에는 같은 방의 닫힌 문에 또 박지 않도록 열린 문으로 즉시 도주!
      if (currentOpenDoors.length > 0) {
        const nonEntryOpen = currentOpenDoors.filter(d => d !== flyingSword.lastEnteredFrom);
        const pool = nonEntryOpen.length > 0 ? nonEntryOpen : currentOpenDoors;
        flyingSword.targetDir = pool[Math.floor(Math.random() * pool.length)];
      } else {
        flyingSword.targetDir = null;
      }
    }
    return;
  }

  // 다음 비행 목표 문 선택 (아직 이 방에서 부딪힌 적이 없을 때만 닫힌 문도 후보에 포함하고, 한 번 부딪힌 뒤에는 열린 문 우선!)
  const pickNextFlightDoor = () => {
    if (roomDoors.length === 0) return null;
    const candidateDirs = (flyingSword.lastBouncedDir && openDoors.length > 0)
      ? openDoors
      : roomDoors;
    let bestDir = candidateDirs[0];
    let bestScore = -Infinity;

    for (const d of candidateDirs) {
      let score = 0;
      const adj = getAdjacentCell(screenLabel, gx, gy, d);
      const adjId = adj ? getCellId(adj.screen.label, adj.gx, adj.gy) : null;
      const isOpenWindow = adjId ? cellMap.has(adjId) : false;

      if (isOpenWindow && cellMap.size >= 2) {
        score += 22;
      }

      if (d !== flyingSword.lastEnteredFrom) {
        score += 45;
      }
      if (d === flyingSword.lastBouncedDir && candidateDirs.length > 1) {
        score -= 80;
      }

      score += Math.random() * 25;
      if (score > bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }
    return bestDir;
  };

  // 2. Stage 4 시작 직후 짧은 각성('awakening') 후 첫 도주 출발
  if (flyingSword.state === 'awakening') {
    if (!flyingSword.targetDir || !roomDoors.includes(flyingSword.targetDir)) {
      flyingSword.targetDir = pickNextFlightDoor();
    }
    if (flyingSword.awakeningTimer > 0) {
      flyingSword.awakeningTimer--;
      const dPos = getDoorPosition(flyingSword.targetDir, 18);
      flyingSword.angle = Math.atan2(dPos.y - flyingSword.ly, dPos.x - flyingSword.lx);
      return;
    }
    flyingSword.state = 'flying';
    flyingSword.passedCenter = true;
  }

  flyingSword.state = 'flying';

  // 4-A. 입구 문에서 방 중앙(cx, cy)을 향해 고속 비행
  if (!flyingSword.passedCenter) {
    const cdx = cx - flyingSword.lx;
    const cdy = cy - flyingSword.ly;
    const cdist = Math.hypot(cdx, cdy);
    if (cdist > 0.5) {
      flyingSword.angle = Math.atan2(cdy, cdx);
    }

    if (cdist <= SWORD_FLY_SPEED + 1.5) {
      flyingSword.lx = cx;
      flyingSword.ly = cy;
      flyingSword.passedCenter = true;
      flyingSword.targetDir = pickNextFlightDoor();
    } else {
      flyingSword.vx = (cdx / cdist) * SWORD_FLY_SPEED;
      flyingSword.vy = (cdy / cdist) * SWORD_FLY_SPEED;
      flyingSword.lx += flyingSword.vx;
      flyingSword.ly += flyingSword.vy;
    }
    return;
  }

  // 4-B. 방 중앙에서 목표 출입문(targetDir)을 향해 고속 비행
  if (!flyingSword.targetDir || !roomDoors.includes(flyingSword.targetDir)) {
    flyingSword.targetDir = pickNextFlightDoor();
  }
  if (!flyingSword.targetDir) return;

  const doorPos = getDoorPosition(flyingSword.targetDir, 20);
  const sdx = doorPos.x - flyingSword.lx;
  const sdy = doorPos.y - flyingSword.ly;
  const sdist = Math.hypot(sdx, sdy);
  if (sdist > 0.5) {
    flyingSword.angle = Math.atan2(sdy, sdx);
  }

  if (sdist <= SWORD_FLY_SPEED + 2) {
    // 목표 문 앞에 도달했을 때 해당 문이 레버로 닫혀 있는지 검사!
    if (isGateClosed(flyingSword.cellId, flyingSword.targetDir)) {
      // 💥 닫힌 철창에 고속 충돌 -> 튕겨나오며 스턴/그로기('groggy') 상태 돌입!
      flyingSword.lx = doorPos.x;
      flyingSword.ly = doorPos.y;
      const bAngle = Math.atan2(cy - doorPos.y, cx - doorPos.x) + (Math.random() - 0.5) * 0.3;
      flyingSword.vx = Math.cos(bAngle) * 7.8;
      flyingSword.vy = Math.sin(bAngle) * 7.8;
      flyingSword.lastBouncedDir = flyingSword.targetDir;
      flyingSword.targetDir = null;
      flyingSword.passedCenter = false;
      flyingSword.state = (openDoors.length === 0) ? 'trapped' : 'groggy';
      flyingSword.groggyTimer = GROGGY_DURATION;

      channel.send(MSG.SWORD_BOUNCED, {
        cellId: flyingSword.cellId,
        isTrapped: openDoors.length === 0,
        isGroggy: true,
        activeCellId: player.cellId
      });
    } else {
      // 열린 문이면 다음 방의 입구 문 위치(margin 22px)로 진입하여 연속 비행 이어감!
      const adj = getAdjacentCell(screenLabel, gx, gy, flyingSword.targetDir);
      if (adj) {
        const prevCellId = flyingSword.cellId;
        const nextCellId = getCellId(adj.screen.label, adj.gx, adj.gy);
        const enteredFrom = OPPOSITE_DIR[flyingSword.targetDir];
        const entryPos = getDoorPosition(enteredFrom, 22);

        flyingSword.cellId = nextCellId;
        flyingSword.lx = entryPos.x;
        flyingSword.ly = entryPos.y;
        flyingSword.lastEnteredFrom = enteredFrom;
        flyingSword.lastBouncedDir = null;
        flyingSword.passedCenter = false;
        flyingSword.lastTransit = {
          fromCellId: prevCellId,
          toCellId: nextCellId,
          dir: flyingSword.targetDir,
          timestamp: Date.now()
        };
        flyingSword.targetDir = null;
      } else {
        flyingSword.targetDir = null;
      }
    }
  } else {
    flyingSword.vx = (sdx / sdist) * SWORD_FLY_SPEED;
    flyingSword.vy = (sdy / sdist) * SWORD_FLY_SPEED;
    flyingSword.lx += flyingSword.vx;
    flyingSword.ly += flyingSword.vy;
  }
}

/**
 * Stage 5 전용: 심연의 마왕(👑) 탄막 회피 & 방 추격·성검 직격 보스전 AI 업데이트
 * - 'barrage' (탄막 결계 페이즈, 약 5초 = 150틱):
 *   플레이어의 현재 방(`boss.barrageCellId`)의 문들이 결계로 잠시 봉쇄되고,
 *   네 모서리 심연 포탈에서 다양한 탄막(조준 확산탄 + 회전 나선탄)이 쏟아집니다!
 * - 'searching' (보스 추격 & 성검 공격 페이즈, 약 11초 = 330틱):
 *   5초간 탄막을 버티면 결계가 풀리고 문이 열립니다! 플레이어는 방들을 이동하며 숨어있는 보스를 찾아
 *   근접해서 [SPACE] 키로 성검 참격을 먹입니다!
 *   보스와 같은 방에 들어가면 보스도 방어용 에너지 구체(3방향 완만한 탄)를 발사합니다.
 *   만약 보스를 찾는 시간이 너무 길어지면(`searchTimer <= 0`), 다시 플레이어의 현재 방에 탄막 결계('barrage')가 발동됩니다!
 * - 'hit' (성검 피격 경직, 24틱):
 *   성검에 베인 보스는 경직 후 다른 방으로 순간이동하고, 공격이 일어났던 플레이어의 방에 즉시 다음 탄막 결계('barrage')를 발동시킵니다!
 */
function updateStage5BossAI() {
  if (currentStage !== 5 || isVictory || isStageTransition) return;

  const W = CONFIG.ROOM_OUTER_W;
  const H = CONFIG.ROOM_OUTER_H;
  const cx = W / 2;
  const cy = H / 2;

  if (boss.slashEffect) {
    boss.slashEffect.timer--;
    if (boss.slashEffect.timer <= 0) {
      boss.slashEffect = null;
    }
  }

  // 0. 활성 탄막 이동 및 플레이어 충돌 판정
  const activeBulletCellId = boss.state === 'barrage' ? boss.barrageCellId : boss.cellId;
  for (let i = boss.bullets.length - 1; i >= 0; i--) {
    const b = boss.bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    // 방 경계를 벗어나면 제거
    if (b.x < -16 || b.x > W + 16 || b.y < -16 || b.y > H + 16) {
      boss.bullets.splice(i, 1);
      continue;
    }

    // 탄막이 존재하는 방에 플레이어가 있을 때 충돌 체크
    if (player.cellId === activeBulletCellId && player.invulnerableTimer <= 0) {
      const dist = Math.hypot(player.lx - b.x, player.ly - b.y);
      if (dist < player.radius + (b.r || 6) - 2) {
        player.stunTimer = 10;
        player.invulnerableTimer = 48;
        const hitAngle = Math.atan2(player.ly - b.y, player.lx - b.x);
        player.kx = Math.cos(hitAngle) * 11;
        player.ky = Math.sin(hitAngle) * 11;
        boss.bullets.splice(i, 1);
        channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
      }
    }
  }

  // 1. 보스 체력이 0이 되어 최후의 대폭발('dying') 연출 중일 때 (52틱 = 약 1.73초 후 최종 승리!)
  if (boss.state === 'dying') {
    boss.actionTimer--;
    boss.bullets = [];
    player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
    if (boss.actionTimer <= 0) {
      triggerFinalVictory();
    }
    return;
  }

  // 2. 성검 참격에 피격되어 경직('hit') 중일 때 -> 경직 종료 후 다른 방으로 순간이동 & 현재 방에서 탄막 피하기('barrage') 시작!
  if (boss.state === 'hit') {
    boss.actionTimer--;
    boss.bullets = [];
    if (boss.actionTimer <= 0) {
      boss.cellId = pickNextBossRoom(player.cellId);
      boss.lx = cx;
      boss.ly = cy;
      boss.state = 'barrage';
      boss.barrageCellId = player.cellId;
      boss.barrageDuration = 150; // 5초 탄막 회피
      boss.actionTimer = boss.barrageDuration;
      boss.patternStep = 0;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'teleport_barrage',
        activeCellId: player.cellId
      });
    }
    return;
  }

  // 3. 탄막 피하기 페이즈 ('barrage'): 5초간 현재 방의 네 모서리 심연 포탈에서 탄막 발사!
  if (boss.state === 'barrage') {
    boss.barrageCellId = player.cellId;
    boss.actionTimer--;

    // 보스 남은 체력에 따라 탄막 발사 주기와 탄속이 점점 긴박해짐 (HP 3 -> 2 -> 1)
    const fireInterval = boss.hp === 3 ? 17 : boss.hp === 2 ? 14 : 11;
    const elapsed = boss.barrageDuration - boss.actionTimer;

    if (elapsed > 12 && boss.actionTimer > 15 && elapsed % fireInterval === 0) {
      const corners = [
        { x: 34, y: 34 },
        { x: W - 34, y: 34 },
        { x: W - 34, y: H - 34 },
        { x: 34, y: H - 34 }
      ];
      const step = boss.patternStep++;
      const bulletSpeed = boss.hp === 3 ? 3.1 : boss.hp === 2 ? 3.5 : 3.9;

      if (step % 2 === 0) {
        // 패턴 A: 대각선 2개 포탈에서 플레이어 방향 조준탄 (HP가 낮으면 좌우 확산탄 추가)
        const activeCorners = [corners[step % 4], corners[(step + 2) % 4]];
        for (const c of activeCorners) {
          const baseAngle = Math.atan2(player.ly - c.y, player.lx - c.x);
          const spreadAngles = boss.hp === 1 ? [-0.26, 0, 0.26] : [-0.15, 0.15];
          for (const offset of spreadAngles) {
            const a = baseAngle + offset;
            boss.bullets.push({
              x: c.x,
              y: c.y,
              vx: Math.cos(a) * bulletSpeed,
              vy: Math.sin(a) * bulletSpeed,
              r: 6,
              color: '#f43f5e'
            });
          }
        }
      } else {
        // 패턴 B: 네 모서리 포탈에서 방 중앙을 스쳐 회전하는 나선 탄막
        for (let idx = 0; idx < 4; idx++) {
          const c = corners[idx];
          const toCenter = Math.atan2(cy - c.y, cx - c.x);
          const waveOffset = Math.sin(step * 0.75 + idx) * 0.42;
          const a = toCenter + waveOffset;
          boss.bullets.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * (bulletSpeed * 0.92),
            vy: Math.sin(a) * (bulletSpeed * 0.92),
            r: 5.5,
            color: '#c084fc'
          });
        }
      }

      channel.send(MSG.BOSS_ATTACK, {
        activeCellId: player.cellId,
        silent: step % 2 !== 0
      });
    }

    // 5초 탄막 회피 완료 -> 탄막 소멸 & 문 봉쇄 해제, 보스 추격('searching') 시작!
    if (boss.actionTimer <= 0) {
      boss.bullets = [];
      boss.state = 'searching';
      boss.searchDuration = 330; // 11초 탐색 시간
      boss.searchTimer = boss.searchDuration;

      if (!boss.cellId || boss.cellId === player.cellId) {
        boss.cellId = pickNextBossRoom(player.cellId);
      }
      boss.lx = cx;
      boss.ly = cy;
      boss.spawnTimer = 24;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'search_start',
        activeCellId: player.cellId
      });
    }
    return;
  }

  // 4. 보스 추격 & 성검 공격 페이즈 ('searching')
  if (boss.state === 'searching') {
    boss.searchTimer--;
    if (boss.spawnTimer > 0) {
      boss.spawnTimer--;
    }

    // 플레이어가 보스가 있는 방에 진입했을 때: 중앙 부유·견제 탄막 발사 (재차 블랙홀 연출 없이 즉시 전투 유지)
    if (player.cellId === boss.cellId) {
      boss.lx = cx + Math.cos(tickCount * 0.06) * 28;
      boss.ly = cy + Math.sin(tickCount * 0.08) * 18;

      // 블랙홀 소환 중(초반 14틱)이나 소멸 직전에는 몸통 충돌 및 견제 탄막 유예
      if (boss.spawnTimer <= 8 && boss.searchTimer > 20) {
        // 보스 본체와 너무 깊숙이 부딪히면 가벼운 넉백
        const distToBoss = Math.hypot(player.lx - boss.lx, player.ly - boss.ly);
        if (distToBoss < player.radius + 22 && player.invulnerableTimer <= 0) {
          player.stunTimer = 10;
          player.invulnerableTimer = 45;
          const angle = Math.atan2(player.ly - boss.ly, player.lx - boss.lx);
          player.kx = Math.cos(angle) * 12;
          player.ky = Math.sin(angle) * 12;
          channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
        }

        // 보스가 36틱(약 1.2초)마다 플레이어 쪽으로 완만한 3갈래 암흑 구체 발사
        if (tickCount % 36 === 0) {
          const baseAngle = Math.atan2(player.ly - boss.ly, player.lx - boss.lx);
          for (const offset of [-0.32, 0, 0.32]) {
            const a = baseAngle + offset;
            boss.bullets.push({
              x: boss.lx,
              y: boss.ly,
              vx: Math.cos(a) * 2.9,
              vy: Math.sin(a) * 2.9,
              r: 6,
              color: '#e879f9'
            });
          }
        }
      }
    } else {
      boss.lx = cx;
      boss.ly = cy;
      boss.bullets = [];
    }

    // 보스를 찾는 시간이 너무 길어지면(11초 경과) 플레이어의 현재 방에서 다시 탄막 피하기('barrage') 발동!
    if (boss.searchTimer <= 0) {
      if (boss.cellId === player.cellId) {
        boss.cellId = pickNextBossRoom(player.cellId);
      }
      boss.state = 'barrage';
      boss.barrageCellId = player.cellId;
      boss.barrageDuration = 150;
      boss.actionTimer = boss.barrageDuration;
      boss.bullets = [];
      boss.patternStep = 0;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'timeout_barrage',
        activeCellId: player.cellId
      });
    }
  }
}

// 메인 30Hz 물리 & 게임 루프
setInterval(() => {
  if (cellMap.size === 0 || isVictory) return;

  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  // 스테이지 전환 연출 중에는 물리 이동을 멈추고 상태 브로드캐스트만 유지
  if (isStageTransition) {
    channel.send(MSG.TICK, {
      stage: currentStage,
      isStageTransition: true,
      activeCellId: player.cellId,
      lx: player.lx,
      ly: player.ly,
      vx: 0,
      vy: 0,
      facing: player.facing,
      isStunned: false,
      isInvulnerable: false,
      hasKey,
      hasMapItem,
      hasBootsItem,
      hasLegendarySword,
      swordAwakenProgress: (currentStage === 4 && hasLegendarySword) ? 1 : 0,
      exitCellId,
      keyCellId,
      goldenCellId,
      goldenItemType,
      goldenItemCollected,
      exitDiscovered,
      keyDiscovered,
      goldenDiscovered,
      monsterTension: 0,
      doorTransition: null,
      monster: {
        cellId: null,
        lx: cx,
        ly: cy,
        facing: 'down',
        state: 'wandering'
      },
      tickCount: tickCount++,
      debugTime: Date.now()
    });
    return;
  }

  // 스턴 중에는 플레이어 키 입력 불가
  if (player.stunTimer > 0) {
    player.stunTimer--;
  }
  // 무적 시간 카운트다운
  if (player.invulnerableTimer > 0) {
    player.invulnerableTimer--;
  }
  if (doorTransferCooldown > 0) {
    doorTransferCooldown--;
  }

  let dx = 0; let dy = 0;
  if (player.stunTimer <= 0 && !(currentStage === 4 && hasLegendarySword)) {
    if (keys.has('ArrowUp') || keys.has('arrowup') || keys.has('w') || keys.has('W') || keys.has('ㅈ') || keys.has('ㅉ')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('arrowdown') || keys.has('s') || keys.has('S') || keys.has('ㄴ')) dy += 1;
    if (keys.has('ArrowLeft') || keys.has('arrowleft') || keys.has('a') || keys.has('A') || keys.has('ㅁ')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('arrowright') || keys.has('d') || keys.has('D') || keys.has('ㅇ')) dx += 1;
  }

  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len; dy /= len;
  }

  const inputVx = dx * player.speed;
  const inputVy = dy * player.speed;

  if (inputVx < 0) player.facing = 'left';
  else if (inputVx > 0) player.facing = 'right';
  else if (inputVy < 0) player.facing = 'up';
  else if (inputVy > 0) player.facing = 'down';

  player.vx = inputVx + player.kx;
  player.vy = inputVy + player.ky;

  const prevLx = player.lx;
  const prevLy = player.ly;
  player.lx += player.vx;
  player.ly += player.vy;

  const decay = CONFIG.WALL_BOUNCE_DECAY ?? 0.6;
  player.kx *= decay;
  player.ky *= decay;
  if (Math.abs(player.kx) < 0.1) player.kx = 0;
  if (Math.abs(player.ky) < 0.1) player.ky = 0;

  const minX = 20 + player.radius;
  const maxX = CONFIG.ROOM_OUTER_W - 20 - player.radius;
  const minY = 20 + player.radius;
  const maxY = CONFIG.ROOM_OUTER_H - 20 - player.radius;

  const currentCell = cellMap.get(player.cellId);
  const doorWidth = 80;
  const doorHalfSpan = doorWidth / 2 - player.radius + 3; // 28px (문틀 기둥 안쪽 여유 폭)
  const doorRecessMargin = 16; // 문 안쪽 턱까지 자연스럽게 걸어 들어갈 수 있는 한계치

  const isAtDoorOpening = (dir) => {
    if (!currentCell || !currentCell.doors.includes(dir)) return false;
    if (isGateClosed(currentCell.id, dir)) return false;
    if (dir === 'up' || dir === 'down') return Math.abs(player.lx - cx) <= doorHalfSpan;
    return Math.abs(player.ly - cy) <= doorHalfSpan;
  };

  const bounceStrength = CONFIG.WALL_BOUNCE_STRENGTH ?? 2;
  const bounce = (axis, wasTouching, dir, impactSpeed, sign) => {
    const k = axis === 'x' ? 'kx' : 'ky';
    if (CONFIG.ENABLE_WALL_BOUNCE && !wasTouching && !isAtDoorOpening(dir)) {
      player[k] = sign * Math.abs(impactSpeed) * bounceStrength;
    } else if (Math.sign(player[k]) === -sign) {
      player[k] = 0;
    }
  };

  // 벽 충돌 검사 (문이 있는 구간에서는 문턱 안쪽 16px까지 진입 허용, 문틀 옆으로 빠져나갈 때는 부드럽게 가이드)
  const minAllowedY = isAtDoorOpening('up') ? doorRecessMargin : minY;
  const maxAllowedY = isAtDoorOpening('down') ? (CONFIG.ROOM_OUTER_H - doorRecessMargin) : maxY;
  const minAllowedX = isAtDoorOpening('left') ? doorRecessMargin : minX;
  const maxAllowedX = isAtDoorOpening('right') ? (CONFIG.ROOM_OUTER_W - doorRecessMargin) : maxX;

  if (player.ly < minAllowedY) {
    player.ly = minAllowedY;
    bounce('y', prevLy <= minAllowedY, 'up', player.vy, +1);
  } else if (player.ly < minY && dx !== 0 && dy >= 0) {
    player.ly = Math.min(minY, player.ly + 4);
  }

  if (player.ly > maxAllowedY) {
    player.ly = maxAllowedY;
    bounce('y', prevLy >= maxAllowedY, 'down', player.vy, -1);
  } else if (player.ly > maxY && dx !== 0 && dy <= 0) {
    player.ly = Math.max(maxY, player.ly - 4);
  }

  if (player.lx < minAllowedX) {
    player.lx = minAllowedX;
    bounce('x', prevLx <= minAllowedX, 'left', player.vx, +1);
  } else if (player.lx < minX && dy !== 0 && dx >= 0) {
    player.lx = Math.min(minX, player.lx + 4);
  }

  if (player.lx > maxAllowedX) {
    player.lx = maxAllowedX;
    bounce('x', prevLx >= maxAllowedX, 'right', player.vx, -1);
  } else if (player.lx > maxX && dy !== 0 && dx <= 0) {
    player.lx = Math.max(maxX, player.lx - 4);
  }

  // =====================================================
  // STAGE 1 전용 로직: 황금 열쇠, 황금방 보물 아이템, 탈출 포탈
  // =====================================================
  if (currentStage === 1) {
    // 1-A. 황금 열쇠 획득 판정
    if (!hasKey && player.cellId === keyCellId) {
      const distToKey = Math.hypot(player.lx - cx, player.ly - cy);
      if (distToKey < player.radius + 22) {
        hasKey = true;
        keyDiscovered = true;
        console.log("[Master] 황금 열쇠 획득!");
        channel.send(MSG.KEY_COLLECTED, { activeCellId: player.cellId });
      }
    }

    // 1-B. 황금방(Golden Room) 패시브 아이템 획득 판정
    if (player.cellId === goldenCellId) {
      goldenDiscovered = true;
      if (!goldenItemCollected) {
        const distToItem = Math.hypot(player.lx - cx, player.ly - cy);
        if (distToItem < player.radius + 24) {
          goldenItemCollected = true;
          if (goldenItemType === 'map') {
            hasMapItem = true;
            exitDiscovered = true;
            keyDiscovered = true;
            goldenDiscovered = true;
          } else if (goldenItemType === 'boots') {
            hasBootsItem = true;
            player.speed = Math.round((CONFIG.PLAYER_SPEED || 6) * 1.3 * 10) / 10;
          }
          console.log(`[Master] 황금방 아이템 획득! (${goldenItemType})`);
          channel.send(MSG.ITEM_COLLECTED, {
            activeCellId: player.cellId,
            itemType: goldenItemType,
            hasMapItem,
            hasBootsItem
          });
        }
      }
    }

    // 1-C. 잠긴 탈출문 도달 판정 -> 열쇠 소지 시 Stage 2 전환(순차 창 닫기) 시작!
    if (player.cellId === exitCellId) {
      exitDiscovered = true;
      const distToExit = Math.hypot(player.lx - cx, player.ly - cy);

      if (distToExit < player.radius + 24) {
        if (hasKey) {
          startStageTransition(2);
          return;
        } else {
          // 열쇠 없이 접근 시: 1.5초마다 잠김 경고 전송
          const now = Date.now();
          if (now - lastLockedDoorNotify > 1500) {
            lastLockedDoorNotify = now;
            channel.send(MSG.DOOR_LOCKED, { activeCellId: player.cellId });
          }
        }
      }
    }
  }

  const isSpaceDown = keys.has(' ');
  const spaceJustPressed = isSpaceDown && !wasSpacePressed;
  wasSpacePressed = isSpaceDown;

  // =====================================================
  // STAGE 2 전용 로직: 중앙 깃발 스페이스바 점령 & 타이머 클리어 판정 (-> Stage 3 전환)
  // =====================================================
  let isNearFlag = false;
  if (currentStage === 2) {
    const distToFlag = Math.hypot(player.lx - cx, player.ly - cy);
    isNearFlag = distToFlag < player.radius + 36;

    // 깃발 근처에서 [Space] 키 입력 시 내 땅('player')으로 점령!
    if (isNearFlag && keys.has(' ') && flagOwners.get(player.cellId) !== 'player') {
      flagOwners.set(player.cellId, 'player');
      flagOwnersDirty = true;
      console.log(`[Master] 플레이어 방 점령! (${player.cellId})`);
      channel.send(MSG.FLAG_CAPTURED, {
        cellId: player.cellId,
        owner: 'player',
        activeCellId: player.cellId
      });
    }

    if (stage2TimeLeft > 0) {
      stage2TimeLeft--;
    }

    const { playerScore, monsterScore } = getFlagScores();
    if (stage2TimeLeft <= 0) {
      if (playerScore > monsterScore) {
        startStageTransition(3);
        return;
      } else {
        // 동점이거나 뒤처진 상태로 시간이 끝나면 서든데스(Overtime) 돌입: 역전하는 즉시 Stage 3로 진입!
        isOvertime = true;
      }
    }
  }

  // =====================================================
  // STAGE 3 전용 로직: 크로스 윈도우 레이저 연결 퍼즐 (⚡ -> 💎 -> 🔮)
  // =====================================================
  let isNearPrism = false;
  if (currentStage === 3) {
    if (player.cellId === laserTargetCellId) {
      laserTargetDiscovered = true;
    }

    const distToNode = Math.hypot(player.lx - cx, player.ly - cy);
    isNearPrism = (player.cellId !== laserTargetCellId) && (distToNode < player.radius + 38);

    // 발사대(⚡) 또는 반사 프리즘(💎) 근처에서 [Space] 키 입력 시 출사 방향 시계방향 회전!
    if (isNearPrism && spaceJustPressed && !laserConnected && currentCell) {
      const cwOrder = ['up', 'right', 'down', 'left'];
      const validDoors = cwOrder.filter(d => currentCell.doors.includes(d));
      if (validDoors.length > 0) {
        // 현재 이 방으로 들어오고 있는 입사 광선 방향(inDir)이 있다면, 불필요하게 역방향으로 되돌아가지 않도록 회전 후보에서 제외
        const activeSeg = laserSegments.find(s => s.cellId === player.cellId);
        const incomingDir = activeSeg ? activeSeg.inDir : null;
        const candidates = (incomingDir && validDoors.length > 1)
          ? validDoors.filter(d => d !== incomingDir)
          : validDoors;

        const currentDir = prismDirs.get(player.cellId) || candidates[0];
        const currIdx = candidates.indexOf(currentDir);
        const nextDir = candidates[(currIdx + 1) % candidates.length];

        prismDirs.set(player.cellId, nextDir);
        prismDirsDirty = true;
        computeLaserPath();

        console.log(`[Master] 프리즘 회전 (${player.cellId}): ${currentDir} -> ${nextDir} (코어 연결: ${laserConnected})`);
        channel.send(MSG.LASER_ROTATED, {
          cellId: player.cellId,
          dir: nextDir,
          connected: laserConnected,
          activeCellId: player.cellId
        });

        if (laserConnected) {
          laserChargeTimer = 1;
        }
      }
    }

    // 코어(🔮)에 레이저가 도달하면 약 1.4초(42틱)간 코어로 빛과 에너지가 응축되는 차징 연출 후 최종 승리!
    const LASER_CHARGE_TICKS = 42;
    if (laserConnected) {
      if (laserChargeTimer === 0) {
        channel.send(MSG.LASER_ROTATED, {
          cellId: laserTargetCellId,
          dir: null,
          connected: true,
          activeCellId: player.cellId
        });
      }
      laserChargeTimer++;
      player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
      if (laserChargeTimer >= LASER_CHARGE_TICKS) {
        startStageTransition(4);
        return;
      }
    } else {
      laserChargeTimer = 0;
    }
  }

  // =====================================================
  // STAGE 4 전용 로직: 도망치는 자아 성검 포획 (문 근처 [Space]로 철창 개폐 -> 성검 포위 후 획득)
  // =====================================================
  let nearestGateDir = null;
  let isNearTrappedSword = false;
  if (currentStage === 4) {
    updateFlyingSwordAI();

    if (!hasLegendarySword && currentCell) {
      // 1. 현재 방의 출입문/레버 중 플레이어와 가장 가까운 문(64px 이내) 탐색
      let minGateDist = 64;
      const leverOffsets = {
        up: { x: cx + 46, y: 28 },
        down: { x: cx - 46, y: CONFIG.ROOM_OUTER_H - 28 },
        left: { x: 28, y: cy - 46 },
        right: { x: CONFIG.ROOM_OUTER_W - 28, y: cy + 46 }
      };
      for (const d of currentCell.doors) {
        const dPos = getDoorPosition(d, 26);
        const lPos = leverOffsets[d];
        const dist = Math.min(
          Math.hypot(player.lx - dPos.x, player.ly - dPos.y),
          Math.hypot(player.lx - lPos.x, player.ly - lPos.y)
        );
        if (dist < minGateDist) {
          minGateDist = dist;
          nearestGateDir = d;
        }
      }

      // 2. 같은 방에서 닫힌 문에 부딪혀 스턴/그로기('groggy') 또는 완전 포위('trapped')된 성검 근처인지 확인
      if (
        flyingSword.cellId === player.cellId &&
        (flyingSword.state === 'groggy' || flyingSword.state === 'trapped')
      ) {
        const distToSword = Math.hypot(player.lx - flyingSword.lx, player.ly - flyingSword.ly);
        isNearTrappedSword = distToSword < player.radius + 46;

        if (distToSword < player.radius + 22 || (isNearTrappedSword && spaceJustPressed)) {
          hasLegendarySword = true;
          swordAwakenTimer = 0;
          stage4SequencePhase = 'closing_rooms';
          monster.cellId = null;
          keys.clear();
          player.vx = 0;
          player.vy = 0;
          player.kx = 0;
          player.ky = 0;
          if (lastPromptDir !== null) {
            lastPromptDir = null;
            channel.send(MSG.DOOR_PROMPT, { activeCellId: player.cellId, clear: true });
          }
          console.log(`[Master] 그로기 상태의 전설의 성검 포획 완료! (${player.cellId}) -> 다른 방 순차 닫기 후 빛 흡수 연출`);
          channel.send(MSG.SWORD_DRAWN, {
            cellId: player.cellId,
            activeCellId: player.cellId,
            phase: 'captured'
          });
          startStage4RoomCloseCascade(player.cellId);
        }
      }

      // 3. 성검 포획 입력이 아닐 때 문 근처에서 [Space] 입력 시 해당 문의 철창 레버 토글(닫기 <-> 열기)
      if (!hasLegendarySword && !isNearTrappedSword && nearestGateDir && spaceJustPressed) {
        const gateKey = getGateKey(player.cellId, nearestGateDir);
        if (gateKey) {
          let isClosed = false;
          if (closedGates.has(gateKey)) {
            closedGates.delete(gateKey);
            isClosed = false;
          } else {
            closedGates.add(gateKey);
            isClosed = true;
          }
          closedGatesDirty = true;

          // 레버 조작 직후 의도치 않게 문 밖으로 즉시 이동하지 않도록 짧은 쿨다운 및 프롬프트 해제
          doorTransferCooldown = Math.max(doorTransferCooldown, 10);
          if (lastPromptDir !== null) {
            lastPromptDir = null;
            channel.send(MSG.DOOR_PROMPT, { activeCellId: player.cellId, clear: true });
          }

          console.log(`[Master] 철창 레버 작동 (${player.cellId} - ${nearestGateDir}): ${isClosed ? '🔒 닫힘' : '🔓 열림'}`);
          channel.send(MSG.GATE_TOGGLED, {
            cellId: player.cellId,
            dir: nearestGateDir,
            isClosed,
            activeCellId: player.cellId
          });
        }
      }
    }

    // 다른 방들이 모두 꺼진 뒤('absorbing_light'), 약 1.4초(42틱)간 빛이 성검으로 모이는 연출 후 Stage 5(최종 보스전)로 전환!
    const SWORD_AWAKEN_TICKS = 42;
    if (hasLegendarySword) {
      player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
      if (stage4SequencePhase === 'absorbing_light') {
        swordAwakenTimer++;
        if (swordAwakenTimer >= SWORD_AWAKEN_TICKS) {
          stage4SequencePhase = 'none';
          startStageTransition(5);
          return;
        }
      }
    }
  }

  // =====================================================
  // STAGE 5 전용 로직: 심연의 마왕 탄막 피하기 & 방 추격·성검 참격([Space]) 보스전!
  // =====================================================
  let isNearBoss = false;
  if (currentStage === 5) {
    updateStage5BossAI();

    if (boss.state === 'searching' && boss.cellId && player.cellId === boss.cellId) {
      const distToBoss = Math.hypot(player.lx - boss.lx, player.ly - boss.ly);
      isNearBoss = distToBoss < 76;

      if (isNearBoss && spaceJustPressed) {
        boss.hp = Math.max(0, boss.hp - 1);
        boss.bullets = [];
        boss.slashEffect = {
          cellId: player.cellId,
          x: boss.lx,
          y: boss.ly,
          angle: Math.atan2(boss.ly - player.ly, boss.lx - player.lx),
          timer: 20,
          maxTimer: 20
        };

        // 성검으로 베는 순간 플레이어에게 짧은 무적 부여
        player.invulnerableTimer = Math.max(player.invulnerableTimer, 30);

        if (boss.hp <= 0) {
          boss.state = 'dying';
          boss.actionTimer = 52; // 약 1.73초간 마왕 소멸 연출 후 최종 승리!
        } else {
          boss.state = 'hit';
          boss.actionTimer = 28; // 피격 경직 후 블랙홀 소용돌이 속으로 슈루룩 빨려 들어가는 순간이동 연출!
        }

        console.log(`[Master] ⚔️ 성검 참격 적중! 보스 남은 체력: ${boss.hp}/${boss.maxHp}`);
        channel.send(MSG.BOSS_HIT, {
          fromCellId: player.cellId,
          bossCellId: boss.cellId,
          hp: boss.hp,
          maxHp: boss.maxHp,
          isDefeated: boss.hp <= 0,
          activeCellId: player.cellId
        });
      }
    }
  }

  // 3. 백그라운드 몬스터 AI 갱신 (Stage 1~4)
  if (currentStage !== 5) {
    updateMonsterAI();
  }

  // 4. 문 통과 감지 (플레이어가 문턱 20px 라인까지 실제로 닿고, 열린 문 방향으로 진입할 때 트리거)
  let hitDoor = null;
  const doorTriggerThreshold = 20;

  if (doorTransferCooldown <= 0 && currentCell) {
    if (
      currentCell.doors.includes('up') &&
      !isGateClosed(currentCell.id, 'up') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly <= doorTriggerThreshold &&
      (dy < 0 || lastPromptDir === 'up')
    ) {
      hitDoor = 'up';
    } else if (
      currentCell.doors.includes('down') &&
      !isGateClosed(currentCell.id, 'down') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly >= CONFIG.ROOM_OUTER_H - doorTriggerThreshold &&
      (dy > 0 || lastPromptDir === 'down')
    ) {
      hitDoor = 'down';
    } else if (
      currentCell.doors.includes('left') &&
      !isGateClosed(currentCell.id, 'left') &&
      Math.abs(player.ly - cy) <= doorHalfSpan &&
      player.lx <= doorTriggerThreshold &&
      (dx < 0 || lastPromptDir === 'left')
    ) {
      hitDoor = 'left';
    } else if (
      currentCell.doors.includes('right') &&
      !isGateClosed(currentCell.id, 'right') &&
      Math.abs(player.ly - cy) <= doorHalfSpan &&
      player.lx >= CONFIG.ROOM_OUTER_W - doorTriggerThreshold &&
      (dx > 0 || lastPromptDir === 'right')
    ) {
      hitDoor = 'right';
    }
  }

  if (hitDoor && hitDoor !== lastPromptDir) {
    lastPromptDir = hitDoor;
    const adj = getAdjacentCell(currentCell.screenLabel, currentCell.gx, currentCell.gy, hitDoor);
    if (adj) {
      const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

      let willOpenNew = true;
      let targetWinId = null;
      let rect = null;

      if (cellMap.has(nextId)) {
        willOpenNew = false;
        targetWinId = cellMap.get(nextId).winId;
        rect = cellMap.get(nextId).rect;
      } else {
        willOpenNew = true;
        targetWinId = 'room-' + crypto.randomUUID().slice(0, 8);
        rect = cellToScreenRect(adj.screen, adj.gx, adj.gy, CONFIG);
      }

      channel.send(MSG.DOOR_PROMPT, {
        activeCellId: player.cellId,
        dir: hitDoor,
        willOpenNew,
        targetWinId,
        rect
      });
    }
  } else if (!hitDoor && lastPromptDir !== null) {
    lastPromptDir = null;
    channel.send(MSG.DOOR_PROMPT, { activeCellId: player.cellId, clear: true });
  }

  // 몬스터 접근 텐션 계산 (0: 2칸 이상 멀리 있음, 0.55: 바로 옆방, 0.78~1.0: 같은 방 / Stage 5는 보스전 긴장감 유지)
  let monsterTension = 0;
  if (currentStage === 5) {
    monsterTension = (boss.state === 'barrage' || player.cellId === boss.cellId) ? 0.9 : 0.65;
  } else if (monster.cellId && monster.state === 'chasing') {
    if (monster.cellId === player.cellId) {
      const dist = Math.hypot(player.lx - monster.lx, player.ly - monster.ly);
      const maxRoomDist = Math.hypot(CONFIG.ROOM_OUTER_W, CONFIG.ROOM_OUTER_H);
      monsterTension = Math.min(1, 0.78 + (1 - Math.min(1, dist / maxRoomDist)) * 0.22);
    } else {
      monsterTension = 0.55;
    }
  }

  const activeDoorTransition = (lastDoorTransition && (Date.now() - lastDoorTransition.timestamp < 750))
    ? lastDoorTransition
    : null;

  const { playerScore, monsterScore } = (currentStage === 2) ? getFlagScores() : cachedFlagScores;
  const flagOwnersObj = (currentStage === 2) ? getFlagOwnersSnapshot() : null;
  const prismDirsObj = (currentStage === 3) ? getPrismDirsSnapshot() : null;
  const closedDoorsByCell = (currentStage === 4) ? getClosedDoorsMapObj() : null;
  const activeSwordTransit = (currentStage === 4 && flyingSword.lastTransit && (Date.now() - flyingSword.lastTransit.timestamp < 2200))
    ? flyingSword.lastTransit
    : null;

  // 30Hz 브로드캐스트 패킷 전송
  channel.send(MSG.TICK, {
    stage: currentStage,
    isStageTransition: false,
    activeCellId: player.cellId,
    lx: player.lx,
    ly: player.ly,
    vx: player.vx,
    vy: player.vy,
    facing: player.facing,
    isStunned: player.stunTimer > 0,
    isInvulnerable: player.invulnerableTimer > 0,
    hasKey,
    hasMapItem,
    hasBootsItem,
    exitCellId,
    keyCellId,
    goldenCellId,
    goldenItemType,
    goldenItemCollected,
    exitDiscovered,
    keyDiscovered,
    goldenDiscovered,
    allCells: hasMapItem ? allReachableCells : null,
    flagOwners: flagOwnersObj,
    isNearFlag,
    playerScore,
    monsterScore,
    stage2TimeLeft: Math.ceil(stage2TimeLeft / CONFIG.TICK_HZ),
    isOvertime,
    laserSourceCellId,
    laserTargetCellId,
    laserTargetDiscovered,
    prismDirs: prismDirsObj,
    laserSegments: (currentStage === 3) ? laserSegments : null,
    laserConnected,
    laserChargeProgress: (currentStage === 3 && laserConnected) ? Math.min(1, laserChargeTimer / 42) : 0,
    isNearPrism,
    closedDoorsByCell,
    nearestGateDir,
    isNearTrappedSword,
    flyingSword: (currentStage === 4) ? {
      cellId: flyingSword.cellId,
      lx: flyingSword.lx,
      ly: flyingSword.ly,
      angle: flyingSword.angle,
      state: flyingSword.state,
      groggyRatio: (flyingSword.state === 'groggy' || flyingSword.state === 'trapped')
        ? Math.max(0, flyingSword.groggyTimer / 84)
        : 0,
      targetDir: flyingSword.targetDir,
      lastTransit: activeSwordTransit
    } : null,
    hasLegendarySword,
    swordAwakenProgress: (currentStage === 4 && hasLegendarySword && stage4SequencePhase === 'absorbing_light')
      ? Math.min(1, swordAwakenTimer / 42)
      : 0,
    boss: (currentStage === 5) ? {
      cellId: boss.cellId,
      lx: boss.lx,
      ly: boss.ly,
      hp: boss.hp,
      maxHp: boss.maxHp,
      state: boss.state,
      barrageCellId: boss.barrageCellId,
      barrageTimeLeft: boss.state === 'barrage' ? Math.ceil(boss.actionTimer / CONFIG.TICK_HZ) : 0,
      barrageProgress: boss.state === 'barrage'
        ? Math.max(0, Math.min(1, 1 - (boss.actionTimer / Math.max(1, boss.barrageDuration))))
        : 0,
      searchTimeLeft: boss.state === 'searching' ? Math.ceil(boss.searchTimer / CONFIG.TICK_HZ) : 0,
      spawnProgress: boss.state === 'searching'
        ? Math.max(0, Math.min(1, 1 - (boss.spawnTimer / 24)))
        : 1,
      vanishProgress: boss.state === 'hit'
        ? (boss.actionTimer < 20 ? Math.max(0, Math.min(1, (20 - boss.actionTimer) / 20)) : 0)
        : (boss.state === 'searching' && boss.searchTimer < 20
          ? Math.max(0, Math.min(1, (20 - boss.searchTimer) / 20))
          : 0),
      dyingProgress: boss.state === 'dying'
        ? Math.max(0, Math.min(1, 1 - (boss.actionTimer / 52)))
        : 0,
      bullets: boss.bullets.map(b => ({ x: b.x, y: b.y, r: b.r, color: b.color })),
      slashEffect: boss.slashEffect ? {
        cellId: boss.slashEffect.cellId,
        x: boss.slashEffect.x,
        y: boss.slashEffect.y,
        angle: boss.slashEffect.angle,
        progress: 1 - (boss.slashEffect.timer / boss.slashEffect.maxTimer)
      } : null
    } : null,
    isNearBoss,
    monsterTension,
    doorTransition: activeDoorTransition,
    monster: {
      cellId: monster.cellId,
      lx: monster.lx,
      ly: monster.ly,
      facing: monster.facing,
      state: monster.state
    },
    tickCount: tickCount++,
    debugTime: Date.now()
  });

}, TICK_MS);
