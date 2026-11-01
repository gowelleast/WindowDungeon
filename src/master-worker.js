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

// 열쇠 & 탈출문 상태
let hasKey = false;
let exitCellId = null;
let keyCellId = null;
let exitDiscovered = false;
let keyDiscovered = false;
let isMuted = false;

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
 * 게임 시작 시 BFS로 던전 전체 가상 그리드를 파악하고
 * [황금 열쇠], [잠긴 탈출문], [순찰 몬스터]의 초기 위치를 로비 근처(거리 1~2 또는 3)에서 랜덤하게 배치합니다.
 * (1분 세미나 시연에 최적화: 너무 멀리 가지 않고 1~2방 내에서 탐험·발견 가능)
 */
function generateDungeonEntities(startScreenLabel, startGx, startGy) {
  const visited = new Set();
  const queue = [{ screenLabel: startScreenLabel, gx: startGx, gy: startGy, dist: 0 }];
  const reachableCells = [];

  const startId = getCellId(startScreenLabel, startGx, startGy);
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
          const nextNode = { screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy, dist: curr.dist + 1, id };
          queue.push(nextNode);
          reachableCells.push(nextNode);
        }
      }
    }
  }

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

    // 3. 몬스터: 시작하자마자 로비로 들이닥치지 않도록, 로비(dist 0) 및 바로 옆방(dist 1)을 피해 거리 2 이상의 먼 방에 배치!
    const farCandidates = reachableCells.filter(c => c.dist >= 2);
    let monsterTarget = null;
    if (farCandidates.length > 0) {
      monsterTarget = farCandidates[Math.floor(Math.random() * farCandidates.length)];
    } else {
      // 맵이 작은 경우 가장 먼 방 선택
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

    console.log("[Master] Entity Placement 완료 -> Exit:", exitCellId, "Key:", keyCellId, "Monster:", monster.cellId, "(dist:", monsterTarget.dist + ")");
  }
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
      // 해당 방이 열쇠 방이거나 탈출문 방이면 발견 처리
      if (cell.id === exitCellId) exitDiscovered = true;
      if (cell.id === keyCellId) keyDiscovered = true;

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
        channel.send(MSG.ASSIGN, {
          ...c,
          isExitRoom: (c.id === exitCellId),
          isKeyRoom: (c.id === keyCellId),
          hasKey,
          isMuted,
          doorTransition: recentTransition
        });
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
  const currentCell = cellMap.get(player.cellId);
  if (!currentCell) return;

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
  
  player.cellId = nextId;
  if (player.cellId === exitCellId) exitDiscovered = true;
  if (player.cellId === keyCellId) keyDiscovered = true;

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
    channel.send(MSG.ASSIGN, {
      ...nextCell,
      isExitRoom: (nextCell.id === exitCellId),
      isKeyRoom: (nextCell.id === keyCellId),
      hasKey,
      isMuted,
      doorTransition: lastDoorTransition
    });
  }

  // 플레이어가 문을 통해 다른 방으로 이동하면, 몬스터가 잠깐 멈칫한 뒤 문까지 직접 걸어가도록 짧은 반응 딜레이 부여
  monster.wanderCooldown = Math.max(monster.wanderCooldown, 18);

  keys.clear();
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

  if (isVictory && keys.has(' ')) {
    if (!isClosing) {
      isClosing = true;
      channel.send(MSG.CLOSE_ALL);
    }
  }
});

channel.on(MSG.BYE, (data) => {
  if (isClosing) return;
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
 * 몬스터 AI 업데이트:
 * - 모든 방에서 쿨다운 텔레포트 없이 실제로 방 내부를 걸어서 문(Door)까지 이동한 뒤 다음 방으로 넘어감
 * - 평소(거리 2 이상)에는 방 중앙 → 목표 문 순서로 자연스럽게 순찰(Wandering)
 * - 인접한 방(거리 1)에 플레이어가 있으면 플레이어 방과 연결된 문을 향해 이동 후 진입
 * - 같은 방에서는 플레이어를 직접 추적 및 타격
 */
function updateMonsterAI() {
  if (!monster.cellId || isVictory) return;

  const isSameRoom = (monster.cellId === player.cellId);

  // 현재 몬스터가 위치한 셀 좌표 파악 (cellId 형식: "label:gx,gy")
  const parsedMonsterCell = parseCellId(monster.cellId);
  const mScreenLabel = parsedMonsterCell ? parsedMonsterCell.screenLabel : '';
  const mGx = parsedMonsterCell ? parsedMonsterCell.gx : 0;
  const mGy = parsedMonsterCell ? parsedMonsterCell.gy : 0;

  // 플레이어와의 연결 문 확인 (몬스터 방에서 한 칸 이동해 플레이어 방으로 갈 수 있는지)
  const allDirs = ['up', 'down', 'left', 'right'];
  let dirToPlayerRoom = null;
  if (!isSameRoom) {
    for (const d of allDirs) {
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
      // 공격 후 1.5초간 일시 경직 및 감쇠 (플레이어가 도망칠 수 있도록)
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

          // 피격 넉백 (플레이어는 반대 방향으로 튕겨나감)
          const angle = Math.atan2(player.ly - monster.ly, player.lx - monster.lx);
          player.kx = Math.cos(angle) * 16;
          player.ky = Math.sin(angle) * 16;

          // 몬스터도 반작용으로 살짝 밀려남
          monster.vx = -Math.cos(angle) * 3;
          monster.vy = -Math.sin(angle) * 3;

          channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
        }
      }
    }
  } else {
    // 다른 방에 있을 때: 초기 대기 또는 반응 딜레이 체크
    if (monster.wanderCooldown > 0) {
      monster.wanderCooldown--;
      return;
    }

    const cx = CONFIG.ROOM_OUTER_W / 2;
    const cy = CONFIG.ROOM_OUTER_H / 2;

    // 2. 인접한 방(옆방)에 플레이어가 있으면 플레이어 방으로 통하는 문을 목표로 설정
    if (dirToPlayerRoom) {
      if (monster.targetDir !== dirToPlayerRoom) {
        monster.targetDir = dirToPlayerRoom;
        // 현재 위치가 방 가장자리에 치우쳐 있으면 중앙을 거쳐 문으로 이동
        const distFromCenter = Math.hypot(monster.lx - cx, monster.ly - cy);
        monster.passedCenter = distFromCenter < 45;
      }
    } else {
      // 3. 멀리 떨어져 있을 때는 유효한 인접 문 중 하나를 선택해 순찰
      const validDirs = allDirs.filter(d => getAdjacentCell(mScreenLabel, mGx, mGy, d) !== null);
      if (validDirs.length === 0) return;

      if (!monster.targetDir || !validDirs.includes(monster.targetDir)) {
        // 막다른 길이 아니라면 방금 들어온 문으로 바로 되돌아가지 않도록 필터링
        const forwardDirs = validDirs.filter(d => d !== monster.lastEnteredFrom);
        const candidateDirs = forwardDirs.length > 0 ? forwardDirs : validDirs;
        monster.targetDir = candidateDirs[Math.floor(Math.random() * candidateDirs.length)];
        monster.passedCenter = false;
      }
    }

    const moveSpeed = dirToPlayerRoom ? monster.speed * 0.85 : monster.wanderSpeed;

    // Step 1: 아직 방 중앙을 지나지 않았다면 방 중앙으로 먼저 이동
    if (!monster.passedCenter) {
      const reachedCenter = moveMonsterToward(cx, cy, moveSpeed);
      if (reachedCenter) {
        monster.passedCenter = true;
      }
    } else {
      // Step 2: 목표 문(Door) 좌표를 향해 실제로 걸어감
      const doorPos = getDoorPosition(monster.targetDir, 22);
      const reachedDoor = moveMonsterToward(doorPos.x, doorPos.y, moveSpeed);

      // 문 앞에 실제로 도달했을 때만 다음 방의 반대편 문 입구로 넘어감
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

  // 몬스터 방 내 좌표 클램핑
  const mMinX = 22; const mMaxX = CONFIG.ROOM_OUTER_W - 22;
  const mMinY = 22; const mMaxY = CONFIG.ROOM_OUTER_H - 22;
  monster.lx = Math.max(mMinX, Math.min(monster.lx, mMaxX));
  monster.ly = Math.max(mMinY, Math.min(monster.ly, mMaxY));
}

// 메인 30Hz 물리 & 게임 루프
setInterval(() => {
  if (cellMap.size === 0 || isVictory) return;

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
  if (player.stunTimer <= 0) {
    if (keys.has('ArrowUp') || keys.has('arrowup') || keys.has('w') || keys.has('W') || keys.has('ㅈ') || keys.has('ㅉ')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('arrowdown') || keys.has('s') || keys.has('S') || keys.has('ㄴ')) dy += 1;
    if (keys.has('ArrowLeft') || keys.has('arrowleft') || keys.has('a') || keys.has('A') || keys.has('ㅁ')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('arrowright') || keys.has('d') || keys.has('D') || keys.has('ㅇ')) dx += 1;
  }

  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx*dx + dy*dy);
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
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  const isAtDoorOpening = (dir) => {
    if (!currentCell || !currentCell.doors.includes(dir)) return false;
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
    // 상단 문턱 안에서 좌우로 이동할 때 문기둥에 걸리지 않도록 방 안쪽으로 부드럽게 미끄러짐
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

  // 1. 황금 열쇠 획득 판정
  if (!hasKey && player.cellId === keyCellId) {
    const distToKey = Math.hypot(player.lx - cx, player.ly - cy);
    if (distToKey < player.radius + 22) {
      hasKey = true;
      keyDiscovered = true;
      console.log("[Master] 황금 열쇠 획득!");
      channel.send(MSG.KEY_COLLECTED, { activeCellId: player.cellId });
    }
  }

  // 2. 잠긴 탈출문 도달 판정
  if (player.cellId === exitCellId) {
    exitDiscovered = true;
    const distToExit = Math.hypot(player.lx - cx, player.ly - cy);
    
    if (distToExit < player.radius + 24) {
      if (hasKey) {
        // 승리! 탈출 성공!
        isVictory = true;
        console.log("[Master] 탈출 성공! Victory!");

        const minTop = screens.length > 0 ? Math.min(...screens.map(s => s.availTop)) : 0;
        const maxBottom = screens.length > 0 ? Math.max(...screens.map(s => s.availTop + s.availHeight)) : CONFIG.ROOM_OUTER_H;
        const minLeft = screens.length > 0 ? Math.min(...screens.map(s => s.availLeft)) : 0;
        const maxRight = screens.length > 0 ? Math.max(...screens.map(s => s.availLeft + s.availWidth)) : CONFIG.ROOM_OUTER_W;

        const cellsList = Array.from(cellMap.values());
        const roomsMinTop = cellsList.length > 0 ? Math.min(...cellsList.map(c => c.rect.top)) : minTop;
        const roomsMaxBottom = cellsList.length > 0 ? Math.max(...cellsList.map(c => c.rect.top + c.rect.height)) : maxBottom;

        channel.send(MSG.VICTORY, {
          winnerWinId: cellMap.get(player.cellId).winId,
          globalBounds: {
            minTop, maxBottom, minLeft, maxRight,
            roomsMinTop, roomsMaxBottom,
            totalHeight: maxBottom - minTop
          },
          startTime: Date.now()
        });
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

  // 3. 백그라운드 몬스터 AI 갱신
  updateMonsterAI();

  // 4. 문 통과 감지 (플레이어가 문턱 20px 라인까지 실제로 닿고, 해당 문 방향으로 진입할 때 트리거)
  let hitDoor = null;
  const doorTriggerThreshold = 20;

  if (doorTransferCooldown <= 0 && currentCell) {
    if (
      currentCell.doors.includes('up') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly <= doorTriggerThreshold &&
      (dy < 0 || lastPromptDir === 'up')
    ) {
      hitDoor = 'up';
    } else if (
      currentCell.doors.includes('down') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly >= CONFIG.ROOM_OUTER_H - doorTriggerThreshold &&
      (dy > 0 || lastPromptDir === 'down')
    ) {
      hitDoor = 'down';
    } else if (
      currentCell.doors.includes('left') &&
      Math.abs(player.ly - cy) <= doorHalfSpan &&
      player.lx <= doorTriggerThreshold &&
      (dx < 0 || lastPromptDir === 'left')
    ) {
      hitDoor = 'left';
    } else if (
      currentCell.doors.includes('right') &&
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
        targetWinId = 'room-' + crypto.randomUUID().slice(0,8);
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

  // 몬스터 접근 텐션 계산 (0: 2칸 이상 멀리 있음, 0.55: 바로 옆방, 0.78~1.0: 같은 방)
  let monsterTension = 0;
  if (monster.cellId && monster.state === 'chasing') {
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

  // 30Hz 브로드캐스트 패킷 전송
  channel.send(MSG.TICK, {
    activeCellId: player.cellId,
    lx: player.lx,
    ly: player.ly,
    vx: player.vx,
    vy: player.vy,
    facing: player.facing,
    isStunned: player.stunTimer > 0,
    isInvulnerable: player.invulnerableTimer > 0,
    hasKey,
    exitCellId,
    keyCellId,
    exitDiscovered,
    keyDiscovered,
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
