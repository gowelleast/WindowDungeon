import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import { cellId as getCellId, parseCellId } from '../../grid.js';
import {
  world,
  OPPOSITE_DIR,
  getAdjacentCell,
  prepareStageGridAndSurvivingRoom,
  resetPlayerForStage,
  placeMonsterAtFarCell,
  broadcastStageTransitionComplete
} from '../world.js';

/**
 * Stage 3 전용: 현재 열려 있는 브라우저 창(cellMap)들을 따라
 * 레이저 발사대(⚡)에서 프리즘(💎)을 거쳐 성검 코어(🗡️)까지 이어지는 실시간 광선 궤적을 계산합니다.
 */
export function computeLaserPath() {
  world.laserSegments = [];
  world.laserConnected = false;

  if (world.currentStage !== 3 || !world.laserSourceCellId || !world.cellMap.has(world.laserSourceCellId)) {
    return;
  }

  const visitedInBeam = new Set();
  let currId = world.laserSourceCellId;
  let inDir = null;
  let steps = 0;

  while (currId && steps < 32) {
    steps++;
    visitedInBeam.add(currId);

    if (currId === world.laserTargetCellId) {
      world.laserSegments.push({
        cellId: currId,
        inDir,
        outDir: null,
        blockedByClosedRoom: false,
        isCoreHit: true
      });
      world.laserConnected = true;
      break;
    }

    const outDir = world.prismDirs.get(currId) || null;
    if (!outDir) {
      world.laserSegments.push({
        cellId: currId,
        inDir,
        outDir: null,
        blockedByClosedRoom: false,
        isCoreHit: false
      });
      break;
    }

    if (inDir && outDir === inDir) {
      world.laserSegments.push({
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
      world.laserSegments.push({
        cellId: currId,
        inDir,
        outDir,
        blockedByClosedRoom: false,
        isCoreHit: false
      });
      break;
    }

    const nextId = getCellId(adj.screen.label, adj.gx, adj.gy);

    if (!world.cellMap.has(nextId)) {
      world.laserSegments.push({
        cellId: currId,
        inDir,
        outDir,
        blockedByClosedRoom: true,
        isCoreHit: false
      });
      break;
    }

    world.laserSegments.push({
      cellId: currId,
      inDir,
      outDir,
      blockedByClosedRoom: false,
      isCoreHit: false
    });

    const nextInDir = OPPOSITE_DIR[outDir];
    if (visitedInBeam.has(nextId)) {
      break;
    }

    currId = nextId;
    inDir = nextInDir;
  }
}

export const stage3Controller = {
  stage: 3,

  init(channel, startCell) {
    const { reachableCells, allCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 3);
    world.laserConnected = false;
    world.laserChargeTimer = 0;
    world.laserTargetDiscovered = world.hasMapItem;
    world.laserSourceCellId = startCell.id;

    const dist2Candidates = reachableCells.filter(c => c.dist === 2);
    const distFarCandidates = reachableCells.filter(c => c.dist >= 2);
    const targetPool = dist2Candidates.length > 0
      ? dist2Candidates
      : (distFarCandidates.length > 0 ? distFarCandidates : reachableCells);

    if (targetPool.length > 0) {
      const chosenTarget = targetPool[Math.floor(Math.random() * targetPool.length)];
      world.laserTargetCellId = chosenTarget.id;
    } else {
      world.laserTargetCellId = startCell.id;
    }

    const cwOrder = ['up', 'right', 'down', 'left'];
    world.prismDirs.clear();
    for (const c of allCells) {
      if (c.id === world.laserTargetCellId) continue;
      const validDoors = cwOrder.filter(d => c.doors.includes(d));
      if (validDoors.length > 0) {
        const randomDir = validDoors[Math.floor(Math.random() * validDoors.length)];
        world.prismDirs.set(c.id, randomDir);
      }
    }
    world.prismDirsDirty = true;

    computeLaserPath();

    resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 38));
    placeMonsterAtFarCell(reachableCells, 45);

    console.log(
      `[Master] Stage 3 시작! 발사대(⚡): ${world.laserSourceCellId}, 성검 제단(🗡️): ${world.laserTargetCellId}, 몬스터: ${world.monster.cellId}`
    );

    broadcastStageTransitionComplete(channel, startCell, 2, 3);
  },

  onRoomDiscovered(cellId) {
    if (cellId === world.laserTargetCellId) {
      world.laserTargetDiscovered = true;
    }
    computeLaserPath();
  },

  onDoorConfirm(nextId) {
    if (nextId === world.laserTargetCellId) {
      world.laserTargetDiscovered = true;
    }
    const openedCell = world.cellMap.get(nextId);
    if (openedCell && nextId !== world.laserTargetCellId && !world.prismDirs.has(nextId)) {
      const cwOrder = ['up', 'right', 'down', 'left'];
      const validDoors = cwOrder.filter(d => openedCell.doors.includes(d));
      if (validDoors.length > 0) {
        world.prismDirs.set(nextId, validDoors[0]);
        world.prismDirsDirty = true;
      }
    }
    computeLaserPath();
  },

  update(channel, { cx, cy, currentCell, spaceJustPressed, startStageTransition }) {
    const { player } = world;
    if (player.cellId === world.laserTargetCellId) {
      world.laserTargetDiscovered = true;
    }

    const distToNode = Math.hypot(player.lx - cx, player.ly - cy);
    const isNearPrism = (player.cellId !== world.laserTargetCellId) && (distToNode < player.radius + 38);

    // 발사대(⚡) 또는 반사 프리즘(💎) 근처에서 [Space] 키 입력 시 출사 방향 시계방향 회전!
    if (isNearPrism && spaceJustPressed && !world.laserConnected && currentCell) {
      const cwOrder = ['up', 'right', 'down', 'left'];
      const validDoors = cwOrder.filter(d => currentCell.doors.includes(d));
      if (validDoors.length > 0) {
        const activeSeg = world.laserSegments.find(s => s.cellId === player.cellId);
        const incomingDir = activeSeg ? activeSeg.inDir : null;
        const candidates = (incomingDir && validDoors.length > 1)
          ? validDoors.filter(d => d !== incomingDir)
          : validDoors;

        const currentDir = world.prismDirs.get(player.cellId) || candidates[0];
        const currIdx = candidates.indexOf(currentDir);
        const nextDir = candidates[(currIdx + 1) % candidates.length];

        world.prismDirs.set(player.cellId, nextDir);
        world.prismDirsDirty = true;
        computeLaserPath();

        console.log(`[Master] 프리즘 회전 (${player.cellId}): ${currentDir} -> ${nextDir} (코어 연결: ${world.laserConnected})`);
        channel.send(MSG.LASER_ROTATED, {
          cellId: player.cellId,
          dir: nextDir,
          connected: world.laserConnected,
          activeCellId: player.cellId
        });

        if (world.laserConnected) {
          world.laserChargeTimer = 1;
        }
      }
    }

    const LASER_CHARGE_TICKS = 42;
    if (world.laserConnected) {
      if (world.laserChargeTimer === 0) {
        channel.send(MSG.LASER_ROTATED, {
          cellId: world.laserTargetCellId,
          dir: null,
          connected: true,
          activeCellId: player.cellId
        });
      }
      world.laserChargeTimer++;
      player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
      if (world.laserChargeTimer >= LASER_CHARGE_TICKS) {
        startStageTransition(4);
        return { shouldReturn: true, isNearPrism };
      }
    } else {
      world.laserChargeTimer = 0;
    }

    return { shouldReturn: false, isNearPrism };
  }
};

