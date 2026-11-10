import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import { cellId as getCellId, parseCellId } from '../../grid.js';
import {
  world,
  OPPOSITE_DIR,
  getDoorPosition,
  getCellRoomDim,
  getAdjacentCell,
  getGateKey,
  isGateClosed,
  prepareStageGridAndSurvivingRoom,
  resetPlayerForStage,
  placeMonsterAtFarCell,
  broadcastStageTransitionComplete
} from '../world.js';

/**
 * Stage 4 성검 포획 시 연출 시퀀스:
 * 1) 성검 획득 직후 현재 방은 밝은 상태로 유지한 채 다른 방들을 개척 순서대로 먼저 하나씩 닫음 ('closing_rooms')
 * 2) 다른 방들이 모두 꺼진 직후, 현재 방의 모든 빛이 성검으로 모이며 어두워지는 연출 진행 ('absorbing_light')
 */
function startStage4RoomCloseCascade(channel, survivingCellId) {
  const roomsToClose = Array.from(world.cellMap.values()).filter(c => c.id !== survivingCellId);
  for (const r of roomsToClose) {
    world.closingWinIds.add(r.winId);
  }

  setTimeout(() => {
    if (world.currentStage !== 4 || !world.hasLegendarySword) return;
    let idx = 0;
    const cascadeTimer = setInterval(() => {
      if (world.currentStage !== 4 || !world.hasLegendarySword) {
        clearInterval(cascadeTimer);
        return;
      }
      if (idx < roomsToClose.length) {
        const room = roomsToClose[idx++];
        world.cellMap.delete(room.id);
        channel.send(MSG.CLOSE_ROOM, {
          targetWinId: room.winId,
          cellId: room.id,
          closedCount: idx,
          totalClosing: roomsToClose.length
        });
      } else {
        clearInterval(cascadeTimer);
        setTimeout(() => {
          if (world.currentStage === 4 && world.hasLegendarySword) {
            world.stage4SequencePhase = 'absorbing_light';
            world.swordAwakenTimer = 1;
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
 * Stage 4 전용: 창과 창 사이를 빠르게 날아다니는 자아 성검(🗡️) AI 업데이트
 */
function updateFlyingSwordAI(channel) {
  const { flyingSword, player } = world;
  if (world.currentStage !== 4 || world.hasLegendarySword || !flyingSword.cellId || world.isVictory || world.isStageTransition) return;

  const parsed = parseCellId(flyingSword.cellId);
  if (!parsed) return;
  const { screenLabel, gx, gy } = parsed;
  const { W: sRoomW, H: sRoomH } = getCellRoomDim(flyingSword.cellId);
  const cx = sRoomW / 2;
  const cy = sRoomH / 2;
  const allDirs = ['up', 'down', 'left', 'right'];

  const roomDoors = allDirs.filter(d => getAdjacentCell(screenLabel, gx, gy, d) !== null);
  const openDoors = roomDoors.filter(d => !isGateClosed(flyingSword.cellId, d));
  const SWORD_FLY_SPEED = 7.2;
  const GROGGY_DURATION = 84;

  // 1. 닫힌 문에 부딪혀 스턴/그로기('groggy' / 'trapped') 상태일 때
  if (flyingSword.state === 'groggy' || flyingSword.state === 'trapped') {
    flyingSword.lx += flyingSword.vx;
    flyingSword.ly += flyingSword.vy;
    flyingSword.vx *= 0.82;
    flyingSword.vy *= 0.82;
    flyingSword.angle += 0.24;

    const margin = 36;
    flyingSword.lx = Math.max(margin, Math.min(sRoomW - margin, flyingSword.lx));
    flyingSword.ly = Math.max(margin, Math.min(sRoomH - margin, flyingSword.ly));

    flyingSword.state = (openDoors.length === 0) ? 'trapped' : 'groggy';
    flyingSword.groggyTimer--;

    if (flyingSword.groggyTimer <= 0) {
      let currentOpenDoors = roomDoors.filter(d => !isGateClosed(flyingSword.cellId, d));
      if (currentOpenDoors.length === 0 && roomDoors.length > 0) {
        const breakDir = (flyingSword.lastBouncedDir && roomDoors.includes(flyingSword.lastBouncedDir))
          ? flyingSword.lastBouncedDir
          : roomDoors[Math.floor(Math.random() * roomDoors.length)];
        const gateKey = getGateKey(flyingSword.cellId, breakDir);
        if (gateKey) {
          world.closedGates.delete(gateKey);
          world.closedGatesDirty = true;
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
      const isOpenWindow = adjId ? world.cellMap.has(adjId) : false;

      if (isOpenWindow && world.cellMap.size >= 2) {
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
      const dPos = getDoorPosition(flyingSword.targetDir, 18, flyingSword.cellId);
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

  const doorPos = getDoorPosition(flyingSword.targetDir, 20, flyingSword.cellId);
  const sdx = doorPos.x - flyingSword.lx;
  const sdy = doorPos.y - flyingSword.ly;
  const sdist = Math.hypot(sdx, sdy);
  if (sdist > 0.5) {
    flyingSword.angle = Math.atan2(sdy, sdx);
  }

  if (sdist <= SWORD_FLY_SPEED + 2) {
    if (isGateClosed(flyingSword.cellId, flyingSword.targetDir)) {
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
      const adj = getAdjacentCell(screenLabel, gx, gy, flyingSword.targetDir);
      if (adj) {
        const prevCellId = flyingSword.cellId;
        const nextCellId = getCellId(adj.screen.label, adj.gx, adj.gy);
        const enteredFrom = OPPOSITE_DIR[flyingSword.targetDir];
        const entryPos = getDoorPosition(enteredFrom, 22, nextCellId);

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

export const stage4Controller = {
  stage: 4,

  init(channel, startCell) {
    const { reachableCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 4);
    world.hasLegendarySword = false;
    world.swordAwakenTimer = 0;
    world.stage4SequencePhase = 'none';
    world.closedGates.clear();
    world.closedGatesDirty = true;

    const { flyingSword } = world;
    flyingSword.cellId = startCell.id;
    flyingSword.lx = cx;
    flyingSword.ly = cy - 12;
    flyingSword.vx = 0;
    flyingSword.vy = 0;
    flyingSword.angle = -Math.PI / 2;
    flyingSword.state = 'awakening';
    flyingSword.passedCenter = true;
    flyingSword.targetDir = null;
    flyingSword.awakeningTimer = 16;
    flyingSword.groggyTimer = 0;
    flyingSword.lastEnteredFrom = null;
    flyingSword.lastBouncedDir = null;
    flyingSword.lastTransit = null;

    resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 44));
    placeMonsterAtFarCell(reachableCells, 40);

    console.log(`[Master] Stage 4 시작! 도망치는 성검(🗡️) 시작 위치: ${flyingSword.cellId}`);

    broadcastStageTransitionComplete(channel, startCell, 3, 4);
  },

  onRoomDiscovered() {},
  onDoorConfirm() {},

  update(channel, { cx, cy, currentCell, spaceJustPressed, startStageTransition }) {
    const { player, flyingSword } = world;
    let nearestGateDir = null;
    let isNearTrappedSword = false;

    updateFlyingSwordAI(channel);

    if (!world.hasLegendarySword && currentCell) {
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

      if (
        flyingSword.cellId === player.cellId &&
        (flyingSword.state === 'groggy' || flyingSword.state === 'trapped')
      ) {
        const distToSword = Math.hypot(player.lx - flyingSword.lx, player.ly - flyingSword.ly);
        isNearTrappedSword = distToSword < player.radius + 46;

        if (distToSword < player.radius + 22 || (isNearTrappedSword && spaceJustPressed)) {
          world.hasLegendarySword = true;
          world.swordAwakenTimer = 0;
          world.stage4SequencePhase = 'closing_rooms';
          world.monster.cellId = null;
          world.keys.clear();
          player.vx = 0;
          player.vy = 0;
          player.kx = 0;
          player.ky = 0;
          if (world.lastPromptDir !== null) {
            world.lastPromptDir = null;
            channel.send(MSG.DOOR_PROMPT, { activeCellId: player.cellId, clear: true });
          }
          console.log(`[Master] 그로기 상태의 전설의 성검 포획 완료! (${player.cellId}) -> 다른 방 순차 닫기 후 빛 흡수 연출`);
          channel.send(MSG.SWORD_DRAWN, {
            cellId: player.cellId,
            activeCellId: player.cellId,
            phase: 'captured'
          });
          startStage4RoomCloseCascade(channel, player.cellId);
        }
      }

      if (!world.hasLegendarySword && !isNearTrappedSword && nearestGateDir && spaceJustPressed) {
        const gateKey = getGateKey(player.cellId, nearestGateDir);
        if (gateKey) {
          let isClosed = false;
          if (world.closedGates.has(gateKey)) {
            world.closedGates.delete(gateKey);
            isClosed = false;
          } else {
            world.closedGates.add(gateKey);
            isClosed = true;
          }
          world.closedGatesDirty = true;

          world.doorTransferCooldown = Math.max(world.doorTransferCooldown, 10);
          if (world.lastPromptDir !== null) {
            world.lastPromptDir = null;
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

    const SWORD_AWAKEN_TICKS = 42;
    if (world.hasLegendarySword) {
      player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
      if (world.stage4SequencePhase === 'absorbing_light') {
        world.swordAwakenTimer++;
        if (world.swordAwakenTimer >= SWORD_AWAKEN_TICKS) {
          world.stage4SequencePhase = 'none';
          startStageTransition(5);
          return { shouldReturn: true, nearestGateDir, isNearTrappedSword };
        }
      }
    }

    return { shouldReturn: false, nearestGateDir, isNearTrappedSword };
  }
};

