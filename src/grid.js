// gx, gy는 정수 그리드 좌표. screen은 ScreenDetailed 객체 안의 screen 데이터.
export function cellToScreenRect(screen, gx, gy, cfg) {
  return {
    left: screen.availLeft + gx * cfg.ROOM_OUTER_W,
    top: screen.availTop + gy * cfg.ROOM_OUTER_H,
    width: cfg.ROOM_OUTER_W,
    height: cfg.ROOM_OUTER_H,
  };
}

export function isCellValid(screen, gx, gy, cfg) {
  const r = cellToScreenRect(screen, gx, gy, cfg);
  return (
    r.left >= screen.availLeft &&
    r.top >= screen.availTop &&
    r.left + r.width <= screen.availLeft + screen.availWidth &&
    r.top + r.height <= screen.availTop + screen.availHeight
  );
}

export function cellId(screenLabel, gx, gy) {
  return `${screenLabel}:${gx},${gy}`;
}

export function neighbors(screenLabel, gx, gy) {
  return {
    up: { gx, gy: gy - 1 },
    down: { gx, gy: gy + 1 },
    left: { gx: gx - 1, gy },
    right: { gx: gx + 1, gy },
  };
}
