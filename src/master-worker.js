import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { DungeonChannel } from './channel.js';
import { cellId as getCellId, cellToScreenRect, isCellValid, neighbors } from './grid.js';

const channel = new DungeonChannel('master-worker');

let cellMap = new Map(); 
let screens = [];

const player = {
  cellId: 'lobby',
  lx: CONFIG.ROOM_OUTER_W / 2,
  ly: CONFIG.ROOM_OUTER_H / 2,
  vx: 0, vy: 0, speed: CONFIG.PLAYER_SPEED || 6, radius: 15, facing: 'down',
  // 벽 반동 넉백 속도. 입력 속도와 별도로 유지되며 매 tick 감쇠합니다.
  kx: 0, ky: 0
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
    // X축 거리(dx)가 Y축 거리(dy)보다 크면 좌/우 관계로 판별, 반대면 상/하 관계로 판별
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

    // Y축 정렬 (좌/우 이동 시)
    const alignY = () => {
      let y = Math.floor((gy * CONFIG.ROOM_OUTER_H + currentScreen.availTop - targetScreen.availTop) / CONFIG.ROOM_OUTER_H);
      return Math.max(0, Math.min(y, maxGy));
    };

    // X축 정렬 (상/하 이동 시)
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

let flagCellId = null;
let isVictory = false;
let isClosing = false;

function generateFlag(startScreenLabel, startGx, startGy) {
  const visited = new Set();
  const queue = [{ screenLabel: startScreenLabel, gx: startGx, gy: startGy }];
  const reachableCells = [];

  visited.add(getCellId(startScreenLabel, startGx, startGy));

  while(queue.length > 0) {
    const curr = queue.shift();
    const dirs = ['up', 'down', 'left', 'right'];
    for (const dir of dirs) {
      const adj = getAdjacentCell(curr.screenLabel, curr.gx, curr.gy, dir);
      if (adj) {
        const id = getCellId(adj.screen.label, adj.gx, adj.gy);
        if (!visited.has(id)) {
          visited.add(id);
          queue.push({ screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy });
          reachableCells.push(id);
        }
      }
    }
  }

  if (reachableCells.length > 0) {
    const randomIndex = Math.floor(Math.random() * reachableCells.length);
    flagCellId = reachableCells[randomIndex];
    console.log("[Master] Flag mapped to:", flagCellId);
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
  if (!flagCellId) {
    const lobby = Array.from(cellMap.values()).find(c => c.gx === 0 && c.gy === 0);
    if (lobby) generateFlag(lobby.screenLabel, 0, 0);
  }
});

channel.on(MSG.HELLO, (data) => {
  console.log("[Master] Received HELLO from:", data.winId, "Screens count:", screens.length);
  
  try {
    let cell = Array.from(cellMap.values()).find(c => c.winId === data.winId);
    
    if (!cell) {
      if (data.winId === 'lobby' && screens.length > 0) {
        console.log("[Master] Creating lobby cell...");
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
        console.log("[Master] Created lobby cell:", cell);
        cellMap.set(lobbyId, cell);
        player.cellId = lobbyId;
        
        if (!flagCellId) {
          console.log("[Master] Generating flag...");
          generateFlag(targetScreen.label, 0, 0);
        }
      }
    }

    if (cell) {
      console.log("[Master] Sending ASSIGN to:", data.winId);
      channel.send(MSG.ASSIGN, {
        ...cell,
        hasFlag: (cell.id === flagCellId)
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
    cellMap.set(nextId, {
      id: nextId, gx: adj.gx, gy: adj.gy, screenLabel: adj.screen.label,
      doors: calculateDoors(adj.screen, adj.gx, adj.gy),
      winId: data.targetWinId,
      rect: cellToScreenRect(adj.screen, adj.gx, adj.gy, CONFIG)
    });
  }
  
  player.cellId = nextId;
  keys.clear();
  player.vx = 0;
  player.vy = 0;
  player.kx = 0;
  player.ky = 0;
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
  console.log("[Master] Received BYE from:", data.winId, "- Aborting game");
  channel.send(MSG.CLOSE_ALL);
});

const TICK_MS = 1000 / CONFIG.TICK_HZ;
let tickCount = 0;
let lastPromptDir = null;

setInterval(() => {
  if (cellMap.size === 0 || isVictory) return;

  let dx = 0; let dy = 0;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;

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

  // 실제 이동 속도 = 입력 속도 + 넉백 속도
  player.vx = inputVx + player.kx;
  player.vy = inputVy + player.ky;

  const prevLx = player.lx;
  const prevLy = player.ly;
  player.lx += player.vx;
  player.ly += player.vy;

  // 넉백 감쇠
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

  // 해당 방향 벽의 문 구멍 앞에 있는지 (문은 벽이 아니므로 반동하지 않음 → 문 프롬프트 유지)
  const isAtDoorOpening = (dir) => {
    if (!currentCell || !currentCell.doors.includes(dir)) return false;
    if (dir === 'up' || dir === 'down') return Math.abs(player.lx - cx) < doorWidth / 2;
    return Math.abs(player.ly - cy) < doorWidth / 2;
  };

  const bounceStrength = CONFIG.WALL_BOUNCE_STRENGTH ?? 2;
  // 이번 tick에 새로 벽에 부딪혔을 때만 넉백 임펄스 부여 (벽에 붙어 있는 동안 연속 발동 방지)
  // sign: 벽에서 멀어지는 방향 (+1 / -1)
  const bounce = (axis, wasTouching, dir, impactSpeed, sign) => {
    const k = axis === 'x' ? 'kx' : 'ky';
    if (CONFIG.ENABLE_WALL_BOUNCE && !wasTouching && !isAtDoorOpening(dir)) {
      player[k] = sign * Math.abs(impactSpeed) * bounceStrength;
    } else if (Math.sign(player[k]) === -sign) {
      // 벽 쪽으로 향하던 잔여 넉백은 제거
      player[k] = 0;
    }
  };

  // 1. 벽 충돌 처리 (이동 제한 및 넉백 반동)
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

  // 플래그 충돌 판정
  if (player.cellId === flagCellId) {
    const cx = CONFIG.ROOM_OUTER_W / 2;
    const cy = CONFIG.ROOM_OUTER_H / 2;
    const dist = Math.sqrt((player.lx - cx)**2 + (player.ly - cy)**2);
    if (dist < player.radius + 20) {
      isVictory = true;

      // 전체 활성 화면 및 방들의 전역 절대 좌표계 범위 계산
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
          minTop,
          maxBottom,
          minLeft,
          maxRight,
          roomsMinTop,
          roomsMaxBottom,
          totalHeight: maxBottom - minTop
        },
        startTime: Date.now()
      });
      return;
    }
  }

  // 2. 문 프롬프트 감지 (벽에 딱 붙지 않아도 10px 이내면 인식)
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

  channel.send(MSG.TICK, {
    activeCellId: player.cellId,
    lx: player.lx,
    ly: player.ly,
    facing: player.facing,
    tickCount: tickCount++,
    debugTime: Date.now()
  });

}, TICK_MS);
