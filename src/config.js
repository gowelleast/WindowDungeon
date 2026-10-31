export const CONFIG = {
  ROOM_OUTER_W: 480,
  ROOM_OUTER_H: 337,
  ROOM_SLOT_W: 480,
  ROOM_SLOT_H: 400,
  CHROME_OVERHEAD_X: 0,
  CHROME_OVERHEAD_Y: 63, // Chrome macOS 팝업 실측 오버헤드 (타이틀바 28px + 주소표시줄 35px)
  TICK_HZ: 30, // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8, // 동시 개방 방 최대치 (메모리 보호)
  SINGLE_SCREEN_ONLY: true, // 메인 창이 위치한 단일 모니터만 맵으로 사용할지 여부
  PLAYER_SPEED: 6, // 플레이어 기본 이동 속도 (px/tick)
  ENABLE_WALL_BOUNCE: true, // 벽 충돌 시 탄성 반동 적용 여부
  WALL_BOUNCE_STRENGTH: 2, // 충돌 순간 넉백 세기 (충돌 속도 대비 배수)
  WALL_BOUNCE_DECAY: 0.6, // 넉백 속도의 tick당 감쇠율 (0~1, 작을수록 빨리 멈춤)
  MONSTER_SPEED: 2.5, // 몬스터 추적 속도 (px/tick)
  MONSTER_WANDER_SPEED: 1.5, // 몬스터 평상시 순찰 속도 (px/tick)
};

/**
 * 화면 해상도에 맞춰 브라우저 주소창/상태표시줄(오버헤드 63px)을 포함하여 
 * 화면에 완벽하게 꽉 차도록 방의 외부 슬롯(slotW, slotH) 및 내부 컨텐츠 크기(roomW, roomH)를 계산합니다.
 * @param {number} availWidth 화면 가로 가용 해상도
 * @param {number} availHeight 화면 세로 가용 해상도
 * @param {number} minWidth 방의 최소 허용 너비 (기본 380px)
 */
export function computeDynamicRoomSize(availWidth, availHeight, minWidth = 380, overheadY = CONFIG.CHROME_OVERHEAD_Y, overheadX = CONFIG.CHROME_OVERHEAD_X) {
  // 가로: 화면 가용 해상도에 맞춘 균등 열(cols) 분할
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

  // 세로: 화면 가용 해상도에 맞춘 균등 행(rows) 분할
  // 맥북(약 750~950px 가용 높이)에서는 2행을 보장하여 아래 빈 공간 없이 꽉 채움!
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

  // 전체 가용 높이를 rows로 정확히 N등분한 물리 슬롯 높이! (외곽 전체가 차지할 높이)
  const slotH = Math.floor(availHeight / rows);
  // window.open의 height 파라미터(내부 컨텐츠) = 슬롯 높이 - 타이틀바/주소창 오버헤드
  const roomH = Math.max(200, slotH - overheadY);

  return { roomW, roomH, slotW, slotH, cols, rows };
}
