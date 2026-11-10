import { CONFIG } from '../config.js';
import { MSG } from '../protocol.js';
import { cellId as getCellId, getScreenSizing, isCellValid, parseCellId } from '../grid.js';

export const OPPOSITE_DIR = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
};

/**
 * 마스터 워커 전역 월드 상태 컨테이너 (순수 데이터 + 스냅샷 캐시)
 */
export const world = {
  cellMap: new Map(),
  screens: [],
  currentScreenLabel: null,
  allReachableCells: [],

  // 플레이어 상태
  player: {
    cellId: 'lobby',
    lx: CONFIG.ROOM_OUTER_W / 2,
    ly: CONFIG.ROOM_OUTER_H / 2,
    vx: 0,
    vy: 0,
    speed: CONFIG.PLAYER_SPEED || 6,
    radius: 15,
    facing: 'down',
    kx: 0,
    ky: 0,
    stunTimer: 0,
    invulnerableTimer: 0
  },

  // 백그라운드 순찰 & 추적 몬스터 상태
  monster: {
    cellId: null,
    lx: CONFIG.ROOM_OUTER_W / 2,
    ly: CONFIG.ROOM_OUTER_H / 2,
    vx: 0,
    vy: 0,
    speed: CONFIG.MONSTER_SPEED || 2.5,
    wanderSpeed: CONFIG.MONSTER_WANDER_SPEED || 1.5,
    radius: 16,
    state: 'wandering',
    wanderCooldown: 0,
    attackCooldown: 0,
    facing: 'down',
    targetDir: null,
    passedCenter: true,
    lastEnteredFrom: null
  },

  // 입력 및 공통 진행 상태
  keys: new Set(),
  wasSpacePressed: false,
  currentStage: 1,
  isStageTransition: false,
  closingWinIds: new Set(),
  isVictory: false,
  victoryTimestamp: 0,
  isClosing: false,
  isMuted: false,
  lastLockedDoorNotify: 0,
  doorTransitionSeq: 0,
  lastDoorTransition: null,
  doorTransferCooldown: 0,
  lastPromptDir: null,
  tickCount: 0,

  // Stage 1: 열쇠, 탈출문, 황금방 상태
  hasKey: false,
  exitCellId: null,
  keyCellId: null,
  exitDiscovered: false,
  keyDiscovered: false,
  goldenCellId: null,
  goldenDiscovered: false,
  goldenItemType: 'map',
  goldenItemCollected: false,
  hasMapItem: false,
  hasBootsItem: false,

  // Stage 2: 영역 점령전 (땅따먹기) 상태
  flagOwners: new Map(),
  flagOwnersDirty: true,
  cachedFlagOwnersObj: {},
  cachedFlagScores: { playerScore: 0, monsterScore: 0 },
  stage2TimeLeft: 0,
  isOvertime: false,

  // Stage 3: 크로스 윈도우 레이저 연결 퍼즐 상태
  laserSourceCellId: null,
  laserTargetCellId: null,
  laserTargetDiscovered: false,
  prismDirs: new Map(),
  prismDirsDirty: true,
  cachedPrismDirsObj: {},
  laserSegments: [],
  laserConnected: false,
  laserChargeTimer: 0,

  // Stage 4: 도망치는 자아 성검 & 철창 레버 상태
  closedGates: new Set(),
  closedGatesDirty: true,
  cachedClosedDoorsByCell: {},
  flyingSword: {
    cellId: null,
    lx: CONFIG.ROOM_OUTER_W / 2,
    ly: CONFIG.ROOM_OUTER_H / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    state: 'awakening',
    passedCenter: true,
    targetDir: null,
    awakeningTimer: 16,
    groggyTimer: 0,
    lastEnteredFrom: null,
    lastBouncedDir: null,
    lastTransit: null
  },
  hasLegendarySword: false,
  swordAwakenTimer: 0,
  stage4SequencePhase: 'none',

  // Stage 5: 심연의 마왕 최종 보스전 상태
  boss: {
    cellId: null,
    visitedCellIds: [],
    lx: CONFIG.ROOM_OUTER_W / 2,
    ly: CONFIG.ROOM_OUTER_H / 2,
    hp: 3,
    maxHp: 3,
    state: 'barrage',
    barrageCellId: null,
    actionTimer: 150,
    barrageDuration: 150,
    searchTimer: 330,
    searchDuration: 330,
    spawnTimer: 0,
    patternStep: 0,
    bullets: [],
    slashEffect: null
  }
};

export function getScreenByLabel(screenLabel) {
  return world.screens.find(s => s.label === screenLabel) || world.screens[0] || null;
}

export function getCellRoomDim(cellId) {
  if (cellId) {
    const cell = world.cellMap.get(cellId);
    if (cell && cell.rect && cell.rect.width && cell.rect.height) {
      return { W: cell.rect.width, H: cell.rect.height };
    }
    const parsed = parseCellId(cellId);
    const screen = parsed ? getScreenByLabel(parsed.screenLabel) : world.screens[0];
    if (screen) {
      const sizing = getScreenSizing(screen, CONFIG);
      return { W: sizing.roomW, H: sizing.roomH };
    }
  }
  return { W: CONFIG.ROOM_OUTER_W, H: CONFIG.ROOM_OUTER_H };
}

export function syncConfigToCell(cellId) {
  const parsed = parseCellId(cellId);
  const screen = parsed ? getScreenByLabel(parsed.screenLabel) : world.screens[0];
  if (screen) {
    const sizing = getScreenSizing(screen, CONFIG);
    CONFIG.ROOM_OUTER_W = sizing.roomW;
    CONFIG.ROOM_SLOT_W = sizing.slotW;
  }
}

export function getDoorPosition(dir, margin = 24, cellId = null) {
  const { W, H } = cellId ? getCellRoomDim(cellId) : { W: CONFIG.ROOM_OUTER_W, H: CONFIG.ROOM_OUTER_H };
  const cx = W / 2;
  const cy = H / 2;
  if (dir === 'up') return { x: cx, y: margin };
  if (dir === 'down') return { x: cx, y: H - margin };
  if (dir === 'left') return { x: margin, y: cy };
  return { x: W - margin, y: cy };
}

/**
 * 해상도/분할 수가 다른 두 인접 모니터 사이에서 양방향 대칭(1:1)이 보장되는 셀 인덱스를 계산합니다.
 */
function resolveCrossScreenAxis(currStart, currSpan, currSlot, currCount, currIdx, targetStart, targetSpan, targetSlot, targetCount) {
  const mapCoarseToFine = (cStart, cSlot, cIdx, fStart, fSpan, fSlot, fCount) => {
    const cellStart = cStart + cIdx * cSlot;
    const cellEnd = cellStart + cSlot;
    const fEnd = fStart + fSpan;
    if (Math.min(cellEnd, fEnd) - Math.max(cellStart, fStart) <= 0) {
      return -1;
    }
    const center = cellStart + cSlot * 0.5;
    const rawIdx = Math.floor((center - fStart) / fSlot);
    if (rawIdx < 0 || rawIdx >= fCount) {
      return -1;
    }
    return rawIdx;
  };

  if (currSlot > targetSlot) {
    return mapCoarseToFine(currStart, currSlot, currIdx, targetStart, targetSpan, targetSlot, targetCount);
  }
  if (currSlot < targetSlot) {
    for (let tIdx = 0; tIdx < targetCount; tIdx++) {
      if (mapCoarseToFine(targetStart, targetSlot, tIdx, currStart, currSpan, currSlot, currCount) === currIdx) {
        return tIdx;
      }
    }
    return -1;
  }

  // 슬롯 크기가 동일한 경우: 중심점 반올림 매핑이 양방향 일치할 때만 연결
  const mapped = Math.round((currIdx * currSlot + currStart - targetStart) / targetSlot);
  if (mapped < 0 || mapped >= targetCount) return -1;
  const reverse = Math.round((mapped * targetSlot + targetStart - currStart) / currSlot);
  return reverse === currIdx ? mapped : -1;
}

export function getAdjacentCell(screenLabel, gx, gy, dir) {
  const currentScreen = world.screens.find(s => s.label === screenLabel);
  if (!currentScreen) return null;

  let nx = gx;
  let ny = gy;
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

  for (const s of world.screens) {
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
    const currSizing = getScreenSizing(currentScreen, CONFIG);
    const targetSizing = getScreenSizing(targetScreen, CONFIG);
    const maxGx = targetSizing.cols - 1;
    const maxGy = targetSizing.rows - 1;

    let mappedGx = -1;
    let mappedGy = -1;

    if (dir === 'right' || dir === 'left') {
      mappedGx = (dir === 'right') ? 0 : maxGx;
      mappedGy = resolveCrossScreenAxis(
        currentScreen.availTop,
        currentScreen.availHeight,
        currSizing.slotH,
        currSizing.rows,
        gy,
        targetScreen.availTop,
        targetScreen.availHeight,
        targetSizing.slotH,
        targetSizing.rows
      );
    } else if (dir === 'down' || dir === 'up') {
      mappedGy = (dir === 'down') ? 0 : maxGy;
      mappedGx = resolveCrossScreenAxis(
        currentScreen.availLeft,
        currentScreen.availWidth,
        currSizing.slotW,
        currSizing.cols,
        gx,
        targetScreen.availLeft,
        targetScreen.availWidth,
        targetSizing.slotW,
        targetSizing.cols
      );
    }

    if (mappedGx >= 0 && mappedGy >= 0 && isCellValid(targetScreen, mappedGx, mappedGy, CONFIG)) {
      return { screen: targetScreen, gx: mappedGx, gy: mappedGy };
    }
  }
  return null;
}

export function calculateDoors(screen, gx, gy) {
  const doors = [];
  if (getAdjacentCell(screen.label, gx, gy, 'up')) doors.push('up');
  if (getAdjacentCell(screen.label, gx, gy, 'down')) doors.push('down');
  if (getAdjacentCell(screen.label, gx, gy, 'left')) doors.push('left');
  if (getAdjacentCell(screen.label, gx, gy, 'right')) doors.push('right');
  return doors;
}

/**
 * 시작 셀로부터 BFS를 수행하여 도달 가능한 모든 가상 그리드 셀 목록을 계산합니다.
 */
export function computeReachableGrid(startScreenLabel, startGx, startGy) {
  const visited = new Set();
  const startId = getCellId(startScreenLabel, startGx, startGy);
  const startScreen = world.screens.find(s => s.label === startScreenLabel) || world.screens[0];
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

export function getGateKey(cellId, dir) {
  const parsed = parseCellId(cellId);
  if (!parsed) return null;
  const adj = getAdjacentCell(parsed.screenLabel, parsed.gx, parsed.gy, dir);
  if (!adj) return null;
  const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
  return cellId < adjId ? `${cellId}<->${adjId}` : `${adjId}<->${cellId}`;
}

export function isGateClosed(cellId, dir) {
  if (world.currentStage === 5 && world.boss.state === 'barrage' && cellId === world.boss.barrageCellId) {
    return true;
  }
  if (world.currentStage !== 4) return false;
  const key = getGateKey(cellId, dir);
  return key ? world.closedGates.has(key) : false;
}

export function getClosedDoorsForCell(cellId) {
  if (world.currentStage !== 4) return [];
  const dirs = ['up', 'down', 'left', 'right'];
  return dirs.filter(d => isGateClosed(cellId, d));
}

export function getClosedDoorsMapObj() {
  if (world.currentStage !== 4 || world.closedGates.size === 0) return {};
  if (!world.closedGatesDirty) return world.cachedClosedDoorsByCell;
  const mapObj = {};
  for (const c of world.allReachableCells) {
    const closed = getClosedDoorsForCell(c.id);
    if (closed.length > 0) {
      mapObj[c.id] = closed;
    }
  }
  for (const c of world.cellMap.values()) {
    if (!mapObj[c.id]) {
      const closed = getClosedDoorsForCell(c.id);
      if (closed.length > 0) {
        mapObj[c.id] = closed;
      }
    }
  }
  world.cachedClosedDoorsByCell = mapObj;
  world.closedGatesDirty = false;
  return world.cachedClosedDoorsByCell;
}

export function getFlagOwnersSnapshot() {
  if (world.flagOwnersDirty) {
    world.cachedFlagOwnersObj = Object.fromEntries(world.flagOwners);
    let playerScore = 0;
    let monsterScore = 0;
    for (const owner of world.flagOwners.values()) {
      if (owner === 'player') playerScore++;
      else if (owner === 'monster') monsterScore++;
    }
    world.cachedFlagScores = { playerScore, monsterScore };
    world.flagOwnersDirty = false;
  }
  return world.cachedFlagOwnersObj;
}

export function getFlagScores() {
  if (world.flagOwnersDirty) {
    getFlagOwnersSnapshot();
  }
  return world.cachedFlagScores;
}

export function getPrismDirsSnapshot() {
  if (world.prismDirsDirty) {
    world.cachedPrismDirsObj = Object.fromEntries(world.prismDirs);
    world.prismDirsDirty = false;
  }
  return world.cachedPrismDirsObj;
}

export function buildAssignPayload(c, doorTransition = null) {
  const { currentStage } = world;
  const neighborCells = {};
  if (Array.isArray(c.doors)) {
    for (const dir of c.doors) {
      const adj = getAdjacentCell(c.screenLabel, c.gx, c.gy, dir);
      if (adj) {
        neighborCells[dir] = getCellId(adj.screen.label, adj.gx, adj.gy);
      }
    }
  }
  return {
    ...c,
    neighborCells,
    stage: currentStage,
    isExitRoom: (currentStage === 1 && c.id === world.exitCellId),
    isKeyRoom: (currentStage === 1 && c.id === world.keyCellId),
    isGoldenRoom: (currentStage === 1 && c.id === world.goldenCellId),
    goldenItemType: world.goldenItemType,
    goldenItemCollected: world.goldenItemCollected,
    hasKey: world.hasKey,
    hasMapItem: world.hasMapItem,
    hasBootsItem: world.hasBootsItem,
    flagOwner: (currentStage === 2) ? (world.flagOwners.get(c.id) || 'neutral') : null,
    laserSourceCellId: (currentStage === 3) ? world.laserSourceCellId : null,
    laserTargetCellId: (currentStage === 3) ? world.laserTargetCellId : null,
    prismDir: (currentStage === 3) ? (world.prismDirs.get(c.id) || null) : null,
    laserConnected: (currentStage === 3) ? world.laserConnected : false,
    closedDoors: (currentStage === 4) ? getClosedDoorsForCell(c.id) : [],
    hasLegendarySword: world.hasLegendarySword,
    isMuted: world.isMuted,
    doorTransition
  };
}

/**
 * 새 스테이지 진입 시 남는 방(survivingCell)만 유지하고 전체 도달 가능 그리드를 재계산하는 공용 헬퍼
 */
export function prepareStageGridAndSurvivingRoom(startCell, nextStage) {
  world.currentStage = nextStage;
  world.isStageTransition = false;

  syncConfigToCell(startCell.id);

  world.cellMap.clear();
  const targetScreen = world.screens.find(s => s.label === startCell.screenLabel) || world.screens[0];
  if (targetScreen) {
    startCell.doors = calculateDoors(targetScreen, startCell.gx, startCell.gy);
    startCell.rect = startCell.rect || {
      width: CONFIG.ROOM_OUTER_W,
      height: CONFIG.ROOM_OUTER_H
    };
  }
  world.cellMap.set(startCell.id, startCell);

  const { reachableCells, allCells } = computeReachableGrid(startCell.screenLabel, startCell.gx, startCell.gy);
  world.allReachableCells = allCells;

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
export function resetPlayerForStage(cellId, lx, ly) {
  const { player } = world;
  player.cellId = cellId;
  player.lx = lx;
  player.ly = ly;
  player.facing = 'up';
  player.vx = 0;
  player.vy = 0;
  player.kx = 0;
  player.ky = 0;
  player.stunTimer = 0;
  player.invulnerableTimer = 45;
}

/**
 * 시작 방에서 거리 2 이상 떨어진 방에 몬스터를 배치하는 공용 헬퍼
 */
export function placeMonsterAtFarCell(reachableCells, wanderCooldown) {
  if (reachableCells.length === 0) return;
  const farCandidates = reachableCells.filter(c => c.dist >= 2);
  const monsterTarget = farCandidates.length > 0
    ? farCandidates[Math.floor(Math.random() * farCandidates.length)]
    : reachableCells[reachableCells.length - 1];

  const { monster } = world;
  const { W, H } = getCellRoomDim(monsterTarget.id);
  monster.cellId = monsterTarget.id;
  monster.lx = W / 2;
  monster.ly = H / 2;
  monster.state = 'wandering';
  monster.wanderCooldown = wanderCooldown;
  monster.targetDir = null;
  monster.passedCenter = true;
  monster.lastEnteredFrom = null;
}

/**
 * 스테이지 초기화 완료 후 생존 방 상태 할당 및 페이드인(complete) 브로드캐스트 공용 헬퍼
 */
export function broadcastStageTransitionComplete(channel, startCell, fromStage, toStage) {
  channel.send(MSG.ASSIGN, buildAssignPayload(startCell, null));
  channel.send(MSG.STAGE_TRANSITION, {
    phase: 'complete',
    fromStage,
    toStage,
    activeCellId: startCell.id,
    activeWinId: startCell.winId
  });
}

export function triggerFinalVictory(channel) {
  if (world.isVictory) return;
  world.isVictory = true;
  world.victoryTimestamp = Date.now();
  world.keys.delete(' ');
  world.wasSpacePressed = false;
  const { playerScore, monsterScore } = getFlagScores();
  console.log(`[Master] 최종 승리! (Stage ${world.currentStage}) 🟢 ${playerScore} vs 🔴 ${monsterScore}`);

  const { screens, cellMap, player, currentStage } = world;
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

