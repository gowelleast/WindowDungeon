export const CONFIG = {
  ROOM_OUTER_W: 480,
  ROOM_OUTER_H: 400,
  CHROME_OVERHEAD_X: 0,
  CHROME_OVERHEAD_Y: 63,
  TICK_HZ: 30, // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8, // 동시 개방 방 최대치 (메모리 보호)
  SINGLE_SCREEN_ONLY: true, // 메인 창이 위치한 단일 모니터만 맵으로 사용할지 여부
  PLAYER_SPEED: 6, // 플레이어 기본 이동 속도 (px/tick)
  ENABLE_WALL_BOUNCE: true, // 벽 충돌 시 탄성 반동 적용 여부
  WALL_BOUNCE_STRENGTH: 2, // 충돌 순간 넉백 세기 (충돌 속도 대비 배수)
  WALL_BOUNCE_DECAY: 0.6, // 넉백 속도의 tick당 감쇠율 (0~1, 작을수록 빨리 멈춤)
};

/**
 * 화면 해상도에 맞춰 여백 없이 꽉 차도록 방 크기(width, height)를 동적으로 계산합니다.
 * @param {number} availWidth 화면 가로 해상도
 * @param {number} availHeight 화면 세로 해상도
 * @param {number} minWidth 방의 최소 허용 너비 (기본 400px)
 */
export function computeDynamicRoomSize(availWidth, availHeight, minWidth = 400) {
  let cols = Math.round(availWidth / 480);
  if (cols <= 0 || availWidth / cols < minWidth) {
    cols = Math.max(1, Math.floor(availWidth / minWidth));
  }
  const roomW = Math.floor(availWidth / cols);

  let rows = Math.round(availHeight / 400);
  rows = Math.max(1, rows);
  const roomH = Math.max(300, Math.floor(availHeight / rows));

  return { roomW, roomH, cols, rows };
}
