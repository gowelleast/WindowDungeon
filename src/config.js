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
