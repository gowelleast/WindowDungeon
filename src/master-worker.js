import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { DungeonChannel } from './channel.js';
import { cellId as getCellId, cellToScreenRect, isCellValid } from './grid.js';

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
  facing: 'down'
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
      const dist = Math.sqrt((sCx - currentCx)**2 + (sCy - currentCy)**2);
      if (dist < minDistance) {
        minDistance = dist;
        targetScreen = s;
      }
    }
  }

  if (targetScreen) {
    let mappedGx = 0;
    let mappedGy = 0;
    
    const maxGx = Math.floor(targetScreen.availWidth / CONFIG.ROOM_OUTER_W) - 1;
    const maxGy = Math.floor(targetScreen.availHeight / CONFIG.ROOM_OUTER_H) - 1;

    const alignY = () => {
      let y = Math.floor((gy * CONFIG.ROOM_OUTER_H + currentScreen.availTop - targetScreen.availTop) / CONFIG.ROOM_OUTER_H);
      return Math.max(0, Math.min(y, maxGy));
    };

    const alignX = () => {
      let x = Math.floor((gx * CONFIG.ROOM_OUTER_W + currentScreen.availLeft - targetScreen.availLeft) / CONFIG.ROOM_OUTER_W);
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
    monster.wanderCooldown = 180; // 게임 시작 직후 6초간 순찰 대기 (충분한 탐험 시작 시간 확보)

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

      channel.send(MSG.ASSIGN, {
        ...cell,
        isExitRoom: (cell.id === exitCellId),
        isKeyRoom: (cell.id === keyCellId),
        hasKey
      });
    } else {
      console.warn("[Master] 알 수 없는 방 접속:", data.winId);
    }
  } catch (error) {
    console.error("[Master] Error in HELLO handler:", error);
  }
});

channel.on(MSG.DOOR_CONFIRM, (data) => {
  const currentCell = cellMap.get(player.cellId);
  if (!currentCell) return;

  const adj = getAdjacentCell(currentCell.screenLabel, currentCell.gx, currentCell.gy, data.dir);
  if (!adj) return;

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

  // 플레이어가 문을 통해 다른 방으로 도망치면, 몬스터가 즉시 따라오지 못하도록 4초간 딜레이 부여 (따돌리기 성공)
  monster.wanderCooldown = Math.max(monster.wanderCooldown, 120);

  keys.clear();
  player.vx = 0; player.vy = 0;
  player.kx = 0; player.ky = 0;
  const doorMargin = player.radius + 35;
  if (data.dir === 'up') { player.ly = CONFIG.ROOM_OUTER_H - doorMargin; player.facing = 'up'; }
  else if (data.dir === 'down') { player.ly = doorMargin; player.facing = 'down'; }
  else if (data.dir === 'left') { player.lx = CONFIG.ROOM_OUTER_W - doorMargin; player.facing = 'left'; }
  else if (data.dir === 'right') { player.lx = doorMargin; player.facing = 'right'; }
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

/**
 * 몬스터 AI 업데이트:
 * - 미지의 방 순찰(Wandering) 및 인접 시 추적(Chasing)
 * - 방에 진입할 때는 방 한가운데 텔레포트가 아니라, 반드시 문(Door)을 통해 걸어 들어옴!
 * - 플레이어가 다른 방으로 도망가면 4~5초간 탐색 여유를 주며, 따돌릴 수 있도록 밸런싱
 */
function updateMonsterAI() {
  if (!monster.cellId || isVictory) return;

  const isSameRoom = (monster.cellId === player.cellId);

  // 현재 몬스터가 위치한 셀 좌표 파악 (cellId 형식: "label:gx,gy")
  const lastColonIndex = monster.cellId.lastIndexOf(':');
  let mScreenLabel = '';
  let mGx = 0, mGy = 0;
  if (lastColonIndex !== -1) {
    mScreenLabel = monster.cellId.substring(0, lastColonIndex);
    const coords = monster.cellId.substring(lastColonIndex + 1).split(',');
    mGx = parseInt(coords[0], 10) || 0;
    mGy = parseInt(coords[1], 10) || 0;
  }

  // 플레이어와의 셀 거리 계산
  let pGx = 0, pGy = 0;
  const pCell = cellMap.get(player.cellId);
  if (pCell) {
    pGx = pCell.gx;
    pGy = pCell.gy;
  }
  const cellDist = Math.abs(mGx - pGx) + Math.abs(mGy - pGy);

  // 상태 전환: 같은 방이거나 1칸 이내면 추적 상태!
  if (isSameRoom || cellDist <= 1) {
    monster.state = 'chasing';
  } else {
    monster.state = 'wandering';
  }

  if (isSameRoom) {
    // 1. 같은 방에 있을 때: 플레이어를 향해 서서히 이동
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
      const dist = Math.sqrt(mdx * mdx + mdy * mdy);

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
          player.invulnerableTimer = 75; // 2.5초간 완전 무적 (연속 피격 및 무한 공격 완벽 방지)
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
  } else if (monster.state === 'chasing' && cellDist === 1) {
    // 2. 인접한 방에서 플레이어 방으로 이동을 시도하는 중
    monster.wanderCooldown -= 1;
    if (monster.wanderCooldown <= 0) {
      monster.wanderCooldown = 135; // 다음 방 이동 쿨다운 약 4.5초

      // 플레이어가 도망쳤을 때 따돌릴 수 있도록 65% 확률로 추적, 35%는 다른 방으로 방황
      const shouldFollow = Math.random() < 0.65;

      if (shouldFollow) {
        // 플레이어 방으로 문을 통해 걸어 들어옴 (방 한가운데 스폰 금지!)
        const prevGx = mGx;
        const prevGy = mGy;
        monster.cellId = player.cellId;

        const doorMargin = 38;
        if (prevGx > pGx) {
          // 오른쪽 방에서 건너옴 -> 오른쪽 문 안쪽에서 등장
          monster.lx = CONFIG.ROOM_OUTER_W - doorMargin;
          monster.ly = CONFIG.ROOM_OUTER_H / 2;
          monster.facing = 'left';
        } else if (prevGx < pGx) {
          // 왼쪽 방에서 건너옴 -> 왼쪽 문 안쪽에서 등장
          monster.lx = doorMargin;
          monster.ly = CONFIG.ROOM_OUTER_H / 2;
          monster.facing = 'right';
        } else if (prevGy > pGy) {
          // 아래쪽 방에서 건너옴 -> 아래쪽 문 안쪽에서 등장
          monster.lx = CONFIG.ROOM_OUTER_W / 2;
          monster.ly = CONFIG.ROOM_OUTER_H - doorMargin;
          monster.facing = 'up';
        } else if (prevGy < pGy) {
          // 위쪽 방에서 건너옴 -> 위쪽 문 안쪽에서 등장
          monster.lx = CONFIG.ROOM_OUTER_W / 2;
          monster.ly = doorMargin;
          monster.facing = 'down';
        }
      } else {
        // 다른 인접 방으로 방황 (따돌리기 성공)
        const dirs = ['up', 'down', 'left', 'right'];
        const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
        const adj = getAdjacentCell(mScreenLabel, mGx, mGy, randomDir);
        if (adj) {
          monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
        }
      }
    }
  } else {
    // 3. 미지의 가상 방에서 자유 순찰 (Wandering)
    monster.wanderCooldown -= 1;
    if (monster.wanderCooldown <= 0) {
      monster.wanderCooldown = 90 + Math.floor(Math.random() * 45); // 3~4.5초마다 다음 방으로
      
      const dirs = ['up', 'down', 'left', 'right'];
      const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
      const adj = getAdjacentCell(mScreenLabel, mGx, mGy, randomDir);
      if (adj) {
        monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
        const doorMargin = 38;
        if (randomDir === 'right') { monster.lx = doorMargin; monster.ly = CONFIG.ROOM_OUTER_H / 2; }
        else if (randomDir === 'left') { monster.lx = CONFIG.ROOM_OUTER_W - doorMargin; monster.ly = CONFIG.ROOM_OUTER_H / 2; }
        else if (randomDir === 'down') { monster.lx = CONFIG.ROOM_OUTER_W / 2; monster.ly = doorMargin; }
        else if (randomDir === 'up') { monster.lx = CONFIG.ROOM_OUTER_W / 2; monster.ly = CONFIG.ROOM_OUTER_H - doorMargin; }
      }
    }
  }

  // 몬스터 방 내 좌표 클램핑
  const mMinX = 25; const mMaxX = CONFIG.ROOM_OUTER_W - 25;
  const mMinY = 25; const mMaxY = CONFIG.ROOM_OUTER_H - 25;
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

  let dx = 0; let dy = 0;
  if (player.stunTimer <= 0) {
    if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
    if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
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
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  const isAtDoorOpening = (dir) => {
    if (!currentCell || !currentCell.doors.includes(dir)) return false;
    if (dir === 'up' || dir === 'down') return Math.abs(player.lx - cx) < doorWidth / 2;
    return Math.abs(player.ly - cy) < doorWidth / 2;
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

  // 벽 충돌 검사
  if (player.ly < minY) {
    player.ly = minY;
    bounce('y', prevLy <= minY, 'up', player.vy, +1);
  }
  if (player.ly > maxY) {
    player.ly = maxY;
    bounce('y', prevLy >= maxY, 'down', player.vy, -1);
  }
  if (player.lx < minX) {
    player.lx = minX;
    bounce('x', prevLx <= minX, 'left', player.vx, +1);
  }
  if (player.lx > maxX) {
    player.lx = maxX;
    bounce('x', prevLx >= maxX, 'right', player.vx, -1);
  }

  // 1. 황금 열쇠 획득 판정
  if (!hasKey && player.cellId === keyCellId) {
    const distToKey = Math.sqrt((player.lx - cx)**2 + (player.ly - cy)**2);
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
    const distToExit = Math.sqrt((player.lx - cx)**2 + (player.ly - cy)**2);
    
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

  // 4. 문 프롬프트 감지
  let hitDoor = null;
  const triggerMargin = 10;

  if (player.ly <= minY + triggerMargin) {
    if (currentCell.doors.includes('up') && Math.abs(player.lx - cx) < doorWidth/2) hitDoor = 'up';
  }
  if (player.ly >= maxY - triggerMargin) {
    if (currentCell.doors.includes('down') && Math.abs(player.lx - cx) < doorWidth/2) hitDoor = 'down';
  }
  if (player.lx <= minX + triggerMargin) {
    if (currentCell.doors.includes('left') && Math.abs(player.ly - cy) < doorWidth/2) hitDoor = 'left';
  }
  if (player.lx >= maxX - triggerMargin) {
    if (currentCell.doors.includes('right') && Math.abs(player.ly - cy) < doorWidth/2) hitDoor = 'right';
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

  // 30Hz 브로드캐스트 패킷 전송
  channel.send(MSG.TICK, {
    activeCellId: player.cellId,
    lx: player.lx,
    ly: player.ly,
    facing: player.facing,
    isStunned: player.stunTimer > 0,
    isInvulnerable: player.invulnerableTimer > 0,
    hasKey,
    exitCellId,
    keyCellId,
    exitDiscovered,
    keyDiscovered,
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
