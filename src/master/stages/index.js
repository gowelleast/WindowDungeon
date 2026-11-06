import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import { world } from '../world.js';
import { stage1Controller, generateDungeonEntities } from './stage1.js';
import { stage2Controller } from './stage2.js';
import { stage3Controller, computeLaserPath } from './stage3.js';
import { stage4Controller } from './stage4.js';
import { stage5Controller } from './stage5.js';

export { generateDungeonEntities, computeLaserPath };

export const STAGE_CONTROLLERS = {
  1: stage1Controller,
  2: stage2Controller,
  3: stage3Controller,
  4: stage4Controller,
  5: stage5Controller
};

export function getActiveStageController() {
  return STAGE_CONTROLLERS[world.currentStage] || stage1Controller;
}

/**
 * 스테이지 클리어 시 (Stage 1 -> 2 -> 3 -> 4 -> 5):
 * - 현재 플레이어가 있는 방(E)만 남기고 잠시 페이드아웃
 * - 지금까지 개척했던 이전 방들을 개척 순서대로 하나씩 쭈르륵 닫음
 * - 모두 닫힌 뒤 E 방에서부터 다음 스테이지 컨트롤러(STAGE_CONTROLLERS[toStage].init) 실행
 */
export function startStageTransition(channel, toStage) {
  if (world.isStageTransition) return;
  const fromStage = world.currentStage;
  world.isStageTransition = true;

  const survivingCell = world.cellMap.get(world.player.cellId);
  if (!survivingCell) {
    world.isStageTransition = false;
    return;
  }

  // 플레이어 이동 정지 및 키 입력 초기화
  world.keys.clear();
  world.wasSpacePressed = false;
  world.lastPromptDir = null;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.kx = 0;
  world.player.ky = 0;
  world.player.lx = CONFIG.ROOM_OUTER_W / 2;
  world.player.ly = CONFIG.ROOM_OUTER_H / 2;

  const roomsToClose = Array.from(world.cellMap.values()).filter(c => c.id !== survivingCell.id);
  for (const r of roomsToClose) {
    world.closingWinIds.add(r.winId);
  }

  console.log(
    `[Master] Stage ${fromStage} -> Stage ${toStage} 전환 시작! 남는 방: ${survivingCell.id} (${survivingCell.winId}), 순차 닫기 대상(${roomsToClose.length}개):`,
    roomsToClose.map(r => r.id)
  );

  channel.send(MSG.STAGE_TRANSITION, {
    phase: 'start',
    fromStage,
    toStage,
    activeCellId: survivingCell.id,
    activeWinId: survivingCell.winId,
    totalClosing: roomsToClose.length
  });

  const nextController = STAGE_CONTROLLERS[toStage];

  if (roomsToClose.length === 0) {
    setTimeout(() => {
      if (nextController && typeof nextController.init === 'function') {
        nextController.init(channel, survivingCell);
      }
    }, 420);
    return;
  }

  setTimeout(() => {
    let idx = 0;
    const cascadeTimer = setInterval(() => {
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
          if (nextController && typeof nextController.init === 'function') {
            nextController.init(channel, survivingCell);
          }
        }, 420);
      }
    }, 160);
  }, 350);
}

