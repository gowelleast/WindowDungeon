/**
 * Window Dungeon — 캔버스 렌더링 모듈 진입점 (Barrel Export)
 * - 역할 및 스테이지별로 분리된 하위 렌더러 모듈을 하나로 묶어 제공합니다.
 */
export { setupHiDPICanvas } from './render/utils.js';

export {
  drawRoom,
  drawDungeonLighting,
  triggerDoorTransitionEffect,
  hasActiveDoorTransition,
  drawDoorTransitionEffects
} from './render/room.js';

export {
  drawKey,
  drawExitPortal,
  drawMonster,
  drawPlayer,
  drawGoldenRoomItem
} from './render/entities.js';

export { drawTerritoryFlag } from './render/stages/stage2.js';
export { drawStage3LaserAndNode } from './render/stages/stage3.js';
export { drawStage4ForgeAndSword } from './render/stages/stage4.js';
export { drawStage5BossAndArena } from './render/stages/stage5.js';

export {
  drawStageTransitionOverlay,
  drawHUD,
  drawPrompt
} from './render/hud.js';
