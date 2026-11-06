import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import {
  world,
  prepareStageGridAndSurvivingRoom,
  resetPlayerForStage,
  placeMonsterAtFarCell,
  broadcastStageTransitionComplete,
  getFlagScores
} from '../world.js';

export const stage2Controller = {
  stage: 2,

  init(channel, startCell) {
    const { reachableCells, allCells, cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 2);

    world.flagOwners.clear();
    for (const c of allCells) {
      world.flagOwners.set(c.id, 'neutral');
    }

    // 플레이어를 E 방 중앙 깃발 바로 아래쪽에 배치
    resetPlayerForStage(startCell.id, cx, Math.min(CONFIG.ROOM_OUTER_H - 42, cy + 38));

    // 몬스터를 거리 2 이상 떨어진 방에 배치하고 해당 방을 몬스터 초기 영토로 설정
    if (reachableCells.length > 0) {
      placeMonsterAtFarCell(reachableCells, 12);
      world.flagOwners.set(world.monster.cellId, 'monster');
    }
    world.flagOwnersDirty = true;

    const stage2DurationSec = Math.min(20, Math.max(10, allCells.length + 5));
    world.stage2TimeLeft = stage2DurationSec * CONFIG.TICK_HZ;
    world.isOvertime = false;

    console.log(
      `[Master] Stage 2 시작! (제한시간: ${stage2DurationSec}s, 전체 방: ${allCells.length}개) 시작 방:`,
      startCell.id,
      '몬스터 시작 방:',
      world.monster.cellId
    );

    broadcastStageTransitionComplete(channel, startCell, 1, 2);
  },

  onRoomDiscovered() {},

  onDoorConfirm(nextId) {
    if (!world.flagOwners.has(nextId)) {
      world.flagOwners.set(nextId, 'neutral');
      world.flagOwnersDirty = true;
    }
  },

  update(channel, { cx, cy, startStageTransition }) {
    const { player } = world;
    const distToFlag = Math.hypot(player.lx - cx, player.ly - cy);
    const isNearFlag = distToFlag < player.radius + 36;

    // 깃발 근처에서 [Space] 키 입력 시 내 땅('player')으로 점령!
    if (isNearFlag && world.keys.has(' ') && world.flagOwners.get(player.cellId) !== 'player') {
      world.flagOwners.set(player.cellId, 'player');
      world.flagOwnersDirty = true;
      console.log(`[Master] 플레이어 방 점령! (${player.cellId})`);
      channel.send(MSG.FLAG_CAPTURED, {
        cellId: player.cellId,
        owner: 'player',
        activeCellId: player.cellId
      });
    }

    if (world.stage2TimeLeft > 0) {
      world.stage2TimeLeft--;
    }

    const { playerScore, monsterScore } = getFlagScores();
    if (world.stage2TimeLeft <= 0) {
      if (playerScore > monsterScore) {
        startStageTransition(3);
        return { shouldReturn: true, isNearFlag };
      } else {
        world.isOvertime = true;
      }
    }

    return { shouldReturn: false, isNearFlag };
  }
};

