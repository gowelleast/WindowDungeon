import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import { world, computeReachableGrid, getCellRoomDim } from '../world.js';

export function generateDungeonEntities(startScreenLabel, startGx, startGy) {
  const { reachableCells, allCells } = computeReachableGrid(startScreenLabel, startGx, startGy);
  world.allReachableCells = allCells;

  if (reachableCells.length > 0) {
    const closeCandidates = reachableCells.filter(c => c.dist >= 1 && c.dist <= 2);
    const pool = (closeCandidates.length >= 2) ? [...closeCandidates] : [...reachableCells];

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // 1. 잠긴 탈출문 (거리 1~2 방 중 랜덤)
    world.exitCellId = pool[0].id;

    // 2. 황금 열쇠 (탈출문과 다른 거리 1~2 방에 우선 배치)
    if (pool.length > 1) {
      world.keyCellId = pool[1].id;
    } else {
      world.keyCellId = pool[0].id;
    }

    // 3. 황금방(Golden Room)
    const goldenCandidatesClose = reachableCells.filter(
      c => c.id !== world.exitCellId && c.id !== world.keyCellId && c.dist >= 1 && c.dist <= 2
    );
    const goldenCandidatesAll = reachableCells.filter(
      c => c.id !== world.exitCellId && c.id !== world.keyCellId
    );
    const goldenPool = goldenCandidatesClose.length > 0 ? goldenCandidatesClose : goldenCandidatesAll;
    if (goldenPool.length > 0) {
      world.goldenCellId = goldenPool[Math.floor(Math.random() * goldenPool.length)].id;
    } else {
      world.goldenCellId = null;
    }
    world.goldenItemType = Math.random() < 0.5 ? 'map' : 'boots';
    world.goldenItemCollected = false;

    // 4. 몬스터 배치 (거리 2 이상의 먼 방 우선)
    const farCandidates = reachableCells.filter(c => c.dist >= 2);
    let monsterTarget = null;
    if (farCandidates.length > 0) {
      monsterTarget = farCandidates[Math.floor(Math.random() * farCandidates.length)];
    } else {
      const sortedByDist = [...reachableCells].sort((a, b) => b.dist - a.dist);
      monsterTarget = sortedByDist[0];
    }

    const { monster } = world;
    const { W: mW, H: mH } = getCellRoomDim(monsterTarget.id);
    monster.cellId = monsterTarget.id;
    monster.lx = mW / 2;
    monster.ly = mH / 2;
    monster.state = 'wandering';
    monster.wanderCooldown = 90;
    monster.targetDir = null;
    monster.passedCenter = true;
    monster.lastEnteredFrom = null;

    console.log(
      '[Master] Stage 1 Placement -> Exit:', world.exitCellId,
      'Key:', world.keyCellId,
      'GoldenRoom:', world.goldenCellId, `(${world.goldenItemType})`,
      'Monster:', monster.cellId, `(dist: ${monsterTarget.dist})`
    );
  }
}

export const stage1Controller = {
  stage: 1,

  onRoomDiscovered(cellId) {
    if (cellId === world.exitCellId) world.exitDiscovered = true;
    if (cellId === world.keyCellId) world.keyDiscovered = true;
    if (cellId === world.goldenCellId) world.goldenDiscovered = true;
  },

  onDoorConfirm(nextId) {
    this.onRoomDiscovered(nextId);
  },

  update(channel, { cx, cy, startStageTransition }) {
    const { player } = world;

    // 1-A. 황금 열쇠 획득 판정
    if (!world.hasKey && player.cellId === world.keyCellId) {
      const distToKey = Math.hypot(player.lx - cx, player.ly - cy);
      if (distToKey < player.radius + 22) {
        world.hasKey = true;
        world.keyDiscovered = true;
        console.log('[Master] 황금 열쇠 획득!');
        channel.send(MSG.KEY_COLLECTED, { activeCellId: player.cellId });
      }
    }

    // 1-B. 황금방(Golden Room) 패시브 아이템 획득 판정
    if (player.cellId === world.goldenCellId) {
      world.goldenDiscovered = true;
      if (!world.goldenItemCollected) {
        const distToItem = Math.hypot(player.lx - cx, player.ly - cy);
        if (distToItem < player.radius + 24) {
          world.goldenItemCollected = true;
          if (world.goldenItemType === 'map') {
            world.hasMapItem = true;
            world.exitDiscovered = true;
            world.keyDiscovered = true;
            world.goldenDiscovered = true;
          } else if (world.goldenItemType === 'boots') {
            world.hasBootsItem = true;
            player.speed = Math.round((CONFIG.PLAYER_SPEED || 6) * 1.3 * 10) / 10;
          }
          console.log(`[Master] 황금방 아이템 획득! (${world.goldenItemType})`);
          channel.send(MSG.ITEM_COLLECTED, {
            activeCellId: player.cellId,
            itemType: world.goldenItemType,
            hasMapItem: world.hasMapItem,
            hasBootsItem: world.hasBootsItem
          });
        }
      }
    }

    // 1-C. 잠긴 탈출문 도달 판정 -> 열쇠 소지 시 Stage 2 전환 시작!
    if (player.cellId === world.exitCellId) {
      world.exitDiscovered = true;
      const distToExit = Math.hypot(player.lx - cx, player.ly - cy);

      if (distToExit < player.radius + 24) {
        if (world.hasKey) {
          startStageTransition(2);
          return { shouldReturn: true };
        } else {
          const now = Date.now();
          if (now - world.lastLockedDoorNotify > 1500) {
            world.lastLockedDoorNotify = now;
            channel.send(MSG.DOOR_LOCKED, { activeCellId: player.cellId });
          }
        }
      }
    }

    return { shouldReturn: false };
  }
};

