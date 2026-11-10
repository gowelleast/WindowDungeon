export const CONFIG = {
  ROOM_OUTER_W: 480,
  ROOM_OUTER_H: 337,
  ROOM_SLOT_W: 480,
  ROOM_SLOT_H: 400,
  CHROME_OVERHEAD_X: 0,
  CHROME_OVERHEAD_Y: 63,
  TICK_HZ: 30, // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8, // 동시 개방 방 최대치 (메모리 보호)
  SINGLE_SCREEN_ONLY: false, // 연결된 모든 모니터를 하나의 던전 맵으로 확장 연결
  PLAYER_SPEED: 6, // 플레이어 기본 이동 속도 (px/tick)
  ENABLE_WALL_BOUNCE: true, // 벽 충돌 시 탄성 반동 적용 여부
  WALL_BOUNCE_STRENGTH: 2, // 충돌 순간 넉백 세기 (충돌 속도 대비 배수)
  WALL_BOUNCE_DECAY: 0.6, // 넉백 속도의 tick당 감쇠율 (0~1, 작을수록 빨리 멈춤)
};

/**
 * 화면 해상도에 맞춰 브라우저 주소창/상태표시줄(오버헤드 63px)을 포함하여
 * 화면에 여백 없이 꽉 차도록 방의 외부 슬롯(slotW, slotH) 및 내부 컨텐츠 크기(roomW, roomH)를 동적으로 계산합니다.
 */
export function computeDynamicRoomSize(
  availWidth,
  availHeight,
  minWidth = 380,
  overheadY = CONFIG.CHROME_OVERHEAD_Y,
  overheadX = CONFIG.CHROME_OVERHEAD_X
) {
  let cols;
  if (availWidth >= 2400) {
    cols = 5;
  } else if (availWidth >= 1800) {
    cols = 4;
  } else if (availWidth >= 1150) {
    cols = 3;
  } else {
    cols = 2;
  }

  const slotW = Math.floor(availWidth / cols);
  const roomW = Math.max(300, slotW - overheadX);

  let rows;
  if (availHeight >= 1300) {
    rows = 4;
  } else if (availHeight >= 960) {
    rows = 3;
  } else if (availHeight >= 550) {
    rows = 2;
  } else {
    rows = 1;
  }

  const slotH = Math.floor(availHeight / rows);
  const roomH = Math.max(200, slotH - overheadY);

  return { roomW, roomH, slotW, slotH, cols, rows };
}
