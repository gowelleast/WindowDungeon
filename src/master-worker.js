import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { DungeonChannel } from './channel.js';
import { cellId as getCellId, cellToScreenRect } from './grid.js';
import {
  world,
  getAdjacentCell,
  calculateDoors,
  computeReachableGrid,
  isGateClosed,
  getClosedDoorsMapObj,
  getFlagOwnersSnapshot,
  getFlagScores,
  getPrismDirsSnapshot,
  buildAssignPayload
} from './master/world.js';
import { updateMonsterAI } from './master/monster-ai.js';
import {
  generateDungeonEntities,
  getActiveStageController,
  startStageTransition
} from './master/stages/index.js';

const channel = new DungeonChannel('master-worker');
const transitionToStage = (toStage) => startStageTransition(channel, toStage);

// ----------------------------------------------------
// 📡 1. 마스터 워커 메시지 핸들러 맵 (Message Router Pattern)
// ----------------------------------------------------
const MESSAGE_HANDLERS = {
  [MSG.SCREENS_UPDATE](data) {
    world.screens = data.screens;
    world.currentScreenLabel = data.currentScreenLabel;
    if (data.roomW && data.roomH) {
      CONFIG.ROOM_OUTER_W = data.roomW;
      CONFIG.ROOM_OUTER_H = data.roomH;
      CONFIG.ROOM_SLOT_W = data.slotW || data.roomW;
      CONFIG.ROOM_SLOT_H = data.slotH || (data.roomH + (CONFIG.CHROME_OVERHEAD_Y || 63));
      if (world.cellMap.size === 0) {
        world.player.lx = CONFIG.ROOM_OUTER_W / 2;
        world.player.ly = CONFIG.ROOM_OUTER_H / 2;
      }
    }
    if (!world.exitCellId) {
      const lobby = Array.from(world.cellMap.values()).find(c => c.gx === 0 && c.gy === 0);
      if (lobby) generateDungeonEntities(lobby.screenLabel, 0, 0);
    } else if (world.cellMap.size > 0) {
      const firstCell = Array.from(world.cellMap.values())[0];
      const { allCells } = computeReachableGrid(firstCell.screenLabel, firstCell.gx, firstCell.gy);
      world.allReachableCells = allCells;
    }
  },

  [MSG.HELLO](data) {
    try {
      if (data.overheadY && data.overheadY > 0) {
        CONFIG.CHROME_OVERHEAD_Y = data.overheadY;
        if (CONFIG.ROOM_SLOT_H) {
          CONFIG.ROOM_OUTER_H = CONFIG.ROOM_SLOT_H - CONFIG.CHROME_OVERHEAD_Y;
        }
      }
      let cell = Array.from(world.cellMap.values()).find(c => c.winId === data.winId);

      if (!cell && data.winId === 'lobby' && world.screens.length > 0) {
        const targetScreen = world.screens.find(s => s.label === world.currentScreenLabel) ||
          world.screens.find(s => s.isPrimary) ||
          world.screens[0];
        const lobbyId = getCellId(targetScreen.label, 0, 0);
        cell = {
          id: lobbyId,
          gx: 0,
          gy: 0,
          screenLabel: targetScreen.label,
          doors: calculateDoors(targetScreen, 0, 0),
          winId: 'lobby',
          rect: cellToScreenRect(targetScreen, 0, 0, CONFIG)
        };
        world.cellMap.set(lobbyId, cell);
        world.player.cellId = lobbyId;

        if (!world.exitCellId) {
          generateDungeonEntities(targetScreen.label, 0, 0);
        }
      }

      if (cell) {
        getActiveStageController().onRoomDiscovered(cell.id);

        if (world.screens.length > 0) {
          channel.send(MSG.SCREENS_UPDATE, {
            screens: world.screens,
            currentScreenLabel: world.currentScreenLabel,
            roomW: CONFIG.ROOM_OUTER_W,
            roomH: CONFIG.ROOM_OUTER_H,
            slotW: CONFIG.ROOM_SLOT_W,
            slotH: CONFIG.ROOM_SLOT_H
          });
        }

        const recentTransition = (world.lastDoorTransition && (Date.now() - world.lastDoorTransition.timestamp < 800))
          ? world.lastDoorTransition
          : null;
        for (const c of world.cellMap.values()) {
          channel.send(MSG.ASSIGN, buildAssignPayload(c, recentTransition));
        }
      } else {
        console.warn('[Master] 알 수 없는 방 접속:', data.winId);
      }
    } catch (error) {
      console.error('[Master] Error in HELLO handler:', error);
    }
  },

  [MSG.SOUND_MUTE_SYNC](data) {
    world.isMuted = Boolean(data.isMuted);
  },

  [MSG.DOOR_CONFIRM](data) {
    if (world.isStageTransition) return;
    const currentCell = world.cellMap.get(world.player.cellId);
    if (!currentCell) return;
    if (isGateClosed(currentCell.id, data.dir)) return;

    const adj = getAdjacentCell(currentCell.screenLabel, currentCell.gx, currentCell.gy, data.dir);
    if (!adj) return;

    const fromCellId = currentCell.id;
    const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

    if (!world.cellMap.has(nextId)) {
      const actualRect = data.actualRect || cellToScreenRect(adj.screen, adj.gx, adj.gy, CONFIG);
      world.cellMap.set(nextId, {
        id: nextId,
        gx: adj.gx,
        gy: adj.gy,
        screenLabel: adj.screen.label,
        doors: calculateDoors(adj.screen, adj.gx, adj.gy),
        winId: data.targetWinId,
        rect: actualRect
      });
    }

    world.player.cellId = nextId;
    getActiveStageController().onDoorConfirm(nextId);

    world.lastDoorTransition = {
      id: ++world.doorTransitionSeq,
      fromCellId,
      toCellId: nextId,
      dir: data.dir,
      timestamp: Date.now()
    };
    world.doorTransferCooldown = 5;

    const nextCell = world.cellMap.get(nextId);
    if (nextCell) {
      channel.send(MSG.ASSIGN, buildAssignPayload(nextCell, world.lastDoorTransition));
    }

    if (world.currentStage === 1 || world.currentStage === 3 || world.currentStage === 4) {
      world.monster.wanderCooldown = Math.max(world.monster.wanderCooldown, 18);
    }

    world.keys.clear();
    world.wasSpacePressed = false;
    world.lastPromptDir = null;
    world.player.vx = 0;
    world.player.vy = 0;
    world.player.kx = 0;
    world.player.ky = 0;

    const cx = CONFIG.ROOM_OUTER_W / 2;
    const cy = CONFIG.ROOM_OUTER_H / 2;
    const doorSpawnMargin = 24;
    if (data.dir === 'up') {
      world.player.lx = cx;
      world.player.ly = CONFIG.ROOM_OUTER_H - doorSpawnMargin;
      world.player.facing = 'up';
    } else if (data.dir === 'down') {
      world.player.lx = cx;
      world.player.ly = doorSpawnMargin;
      world.player.facing = 'down';
    } else if (data.dir === 'left') {
      world.player.lx = CONFIG.ROOM_OUTER_W - doorSpawnMargin;
      world.player.ly = cy;
      world.player.facing = 'left';
    } else if (data.dir === 'right') {
      world.player.lx = doorSpawnMargin;
      world.player.ly = cy;
      world.player.facing = 'right';
    }
  },

  [MSG.INPUT](data) {
    world.keys.clear();
    data.keys.forEach(k => world.keys.add(k));

    if (world.isVictory && world.keys.has(' ') && (Date.now() - world.victoryTimestamp >= 1800)) {
      if (!world.isClosing) {
        world.isClosing = true;
        channel.send(MSG.CLOSE_ALL);
      }
    }
  },

  [MSG.BYE](data) {
    if (world.isClosing || world.isStageTransition) return;
    if (data && data.winId && world.closingWinIds.has(data.winId)) {
      world.closingWinIds.delete(data.winId);
      return;
    }
    world.isClosing = true;
    channel.send(MSG.CLOSE_ALL);
  }
};

for (const [msgType, handler] of Object.entries(MESSAGE_HANDLERS)) {
  channel.on(msgType, handler);
}

// ----------------------------------------------------
// ⚙️ 2. 메인 30Hz 물리 & 스테이지 컨트롤러 루프
// ----------------------------------------------------
const TICK_MS = 1000 / CONFIG.TICK_HZ;

setInterval(() => {
  const { player, monster, boss, flyingSword } = world;
  if (world.cellMap.size === 0 || world.isVictory) return;

  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  // 스테이지 전환 연출 중에는 물리 이동을 멈추고 상태 브로드캐스트만 유지
  if (world.isStageTransition) {
    channel.send(MSG.TICK, {
      stage: world.currentStage,
      isStageTransition: true,
      activeCellId: player.cellId,
      lx: player.lx,
      ly: player.ly,
      vx: 0,
      vy: 0,
      facing: player.facing,
      isStunned: false,
      isInvulnerable: false,
      hasKey: world.hasKey,
      hasMapItem: world.hasMapItem,
      hasBootsItem: world.hasBootsItem,
      hasLegendarySword: world.hasLegendarySword,
      swordAwakenProgress: (world.currentStage === 4 && world.hasLegendarySword) ? 1 : 0,
      exitCellId: world.exitCellId,
      keyCellId: world.keyCellId,
      goldenCellId: world.goldenCellId,
      goldenItemType: world.goldenItemType,
      goldenItemCollected: world.goldenItemCollected,
      exitDiscovered: world.exitDiscovered,
      keyDiscovered: world.keyDiscovered,
      goldenDiscovered: world.goldenDiscovered,
      monsterTension: 0,
      doorTransition: null,
      monster: {
        cellId: null,
        lx: cx,
        ly: cy,
        facing: 'down',
        state: 'wandering'
      },
      tickCount: world.tickCount++,
      debugTime: Date.now()
    });
    return;
  }

  // 타이머 카운트다운
  if (player.stunTimer > 0) player.stunTimer--;
  if (player.invulnerableTimer > 0) player.invulnerableTimer--;
  if (world.doorTransferCooldown > 0) world.doorTransferCooldown--;

  // 1. 플레이어 이동 입력 및 벽/문턱 물리 판정
  let dx = 0;
  let dy = 0;
  if (player.stunTimer <= 0 && !(world.currentStage === 4 && world.hasLegendarySword)) {
    if (world.keys.has('ArrowUp') || world.keys.has('arrowup') || world.keys.has('w') || world.keys.has('W') || world.keys.has('ㅈ') || world.keys.has('ㅉ')) dy -= 1;
    if (world.keys.has('ArrowDown') || world.keys.has('arrowdown') || world.keys.has('s') || world.keys.has('S') || world.keys.has('ㄴ')) dy += 1;
    if (world.keys.has('ArrowLeft') || world.keys.has('arrowleft') || world.keys.has('a') || world.keys.has('A') || world.keys.has('ㅁ')) dx -= 1;
    if (world.keys.has('ArrowRight') || world.keys.has('arrowright') || world.keys.has('d') || world.keys.has('D') || world.keys.has('ㅇ')) dx += 1;
  }

  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
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

  const currentCell = world.cellMap.get(player.cellId);
  const doorWidth = 80;
  const doorHalfSpan = doorWidth / 2 - player.radius + 3;
  const doorRecessMargin = 16;

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

  const isSpaceDown = world.keys.has(' ');
  const spaceJustPressed = isSpaceDown && !world.wasSpacePressed;
  world.wasSpacePressed = isSpaceDown;

  // 2. 현재 스테이지 컨트롤러(Strategy Pattern) 업데이트 실행
  const stageResult = getActiveStageController().update(channel, {
    cx,
    cy,
    currentCell,
    spaceJustPressed,
    startStageTransition: transitionToStage
  });

  if (stageResult && stageResult.shouldReturn) {
    return;
  }

  const isNearFlag = Boolean(stageResult && stageResult.isNearFlag);
  const isNearPrism = Boolean(stageResult && stageResult.isNearPrism);
  const nearestGateDir = (stageResult && stageResult.nearestGateDir) || null;
  const isNearTrappedSword = Boolean(stageResult && stageResult.isNearTrappedSword);
  const isNearBoss = Boolean(stageResult && stageResult.isNearBoss);

  // 3. 백그라운드 몬스터 AI 갱신 (Stage 1~4)
  if (world.currentStage !== 5) {
    updateMonsterAI(channel);
  }

  // 4. 문 통과 감지
  let hitDoor = null;
  const doorTriggerThreshold = 20;

  if (world.doorTransferCooldown <= 0 && currentCell) {
    if (
      currentCell.doors.includes('up') &&
      !isGateClosed(currentCell.id, 'up') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly <= doorTriggerThreshold &&
      (dy < 0 || world.lastPromptDir === 'up')
    ) {
      hitDoor = 'up';
    } else if (
      currentCell.doors.includes('down') &&
      !isGateClosed(currentCell.id, 'down') &&
      Math.abs(player.lx - cx) <= doorHalfSpan &&
      player.ly >= CONFIG.ROOM_OUTER_H - doorTriggerThreshold &&
      (dy > 0 || world.lastPromptDir === 'down')
    ) {
      hitDoor = 'down';
    } else if (
      currentCell.doors.includes('left') &&
      !isGateClosed(currentCell.id, 'left') &&
      Math.abs(player.ly - cy) <= doorHalfSpan &&
      player.lx <= doorTriggerThreshold &&
      (dx < 0 || world.lastPromptDir === 'left')
    ) {
      hitDoor = 'left';
    } else if (
      currentCell.doors.includes('right') &&
      !isGateClosed(currentCell.id, 'right') &&
      Math.abs(player.ly - cy) <= doorHalfSpan &&
      player.lx >= CONFIG.ROOM_OUTER_W - doorTriggerThreshold &&
      (dx > 0 || world.lastPromptDir === 'right')
    ) {
      hitDoor = 'right';
    }
  }

  if (hitDoor && hitDoor !== world.lastPromptDir) {
    world.lastPromptDir = hitDoor;
    const adj = getAdjacentCell(currentCell.screenLabel, currentCell.gx, currentCell.gy, hitDoor);
    if (adj) {
      const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

      let willOpenNew = true;
      let targetWinId = null;
      let rect = null;

      if (world.cellMap.has(nextId)) {
        willOpenNew = false;
        targetWinId = world.cellMap.get(nextId).winId;
        rect = world.cellMap.get(nextId).rect;
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
  } else if (!hitDoor && world.lastPromptDir !== null) {
    world.lastPromptDir = null;
    channel.send(MSG.DOOR_PROMPT, { activeCellId: player.cellId, clear: true });
  }

  // 5. 몬스터 접근 텐션 계산
  let monsterTension = 0;
  if (world.currentStage === 5) {
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

  const activeDoorTransition = (world.lastDoorTransition && (Date.now() - world.lastDoorTransition.timestamp < 750))
    ? world.lastDoorTransition
    : null;

  const { playerScore, monsterScore } = (world.currentStage === 2) ? getFlagScores() : world.cachedFlagScores;
  const flagOwnersObj = (world.currentStage === 2) ? getFlagOwnersSnapshot() : null;
  const prismDirsObj = (world.currentStage === 3) ? getPrismDirsSnapshot() : null;
  const closedDoorsByCell = (world.currentStage === 4) ? getClosedDoorsMapObj() : null;
  const activeSwordTransit = (world.currentStage === 4 && flyingSword.lastTransit && (Date.now() - flyingSword.lastTransit.timestamp < 2200))
    ? flyingSword.lastTransit
    : null;

  // 6. 30Hz 브로드캐스트 패킷 전송
  channel.send(MSG.TICK, {
    stage: world.currentStage,
    isStageTransition: false,
    activeCellId: player.cellId,
    lx: player.lx,
    ly: player.ly,
    vx: player.vx,
    vy: player.vy,
    facing: player.facing,
    isStunned: player.stunTimer > 0,
    isInvulnerable: player.invulnerableTimer > 0,
    hasKey: world.hasKey,
    hasMapItem: world.hasMapItem,
    hasBootsItem: world.hasBootsItem,
    exitCellId: world.exitCellId,
    keyCellId: world.keyCellId,
    goldenCellId: world.goldenCellId,
    goldenItemType: world.goldenItemType,
    goldenItemCollected: world.goldenItemCollected,
    exitDiscovered: world.exitDiscovered,
    keyDiscovered: world.keyDiscovered,
    goldenDiscovered: world.goldenDiscovered,
    allCells: world.hasMapItem ? world.allReachableCells : null,
    flagOwners: flagOwnersObj,
    isNearFlag,
    playerScore,
    monsterScore,
    stage2TimeLeft: Math.ceil(world.stage2TimeLeft / CONFIG.TICK_HZ),
    isOvertime: world.isOvertime,
    laserSourceCellId: world.laserSourceCellId,
    laserTargetCellId: world.laserTargetCellId,
    laserTargetDiscovered: world.laserTargetDiscovered,
    prismDirs: prismDirsObj,
    laserSegments: (world.currentStage === 3) ? world.laserSegments : null,
    laserConnected: world.laserConnected,
    laserChargeProgress: (world.currentStage === 3 && world.laserConnected) ? Math.min(1, world.laserChargeTimer / 42) : 0,
    isNearPrism,
    closedDoorsByCell,
    nearestGateDir,
    isNearTrappedSword,
    flyingSword: (world.currentStage === 4) ? {
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
    hasLegendarySword: world.hasLegendarySword,
    swordAwakenProgress: (world.currentStage === 4 && world.hasLegendarySword && world.stage4SequencePhase === 'absorbing_light')
      ? Math.min(1, world.swordAwakenTimer / 42)
      : 0,
    boss: (world.currentStage === 5) ? {
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
        hitBoss: Boolean(boss.slashEffect.hitBoss),
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
    tickCount: world.tickCount++,
    debugTime: Date.now()
  });
}, TICK_MS);
