// gx, gy는 정수 그리드 좌표. screen은 ScreenDetailed 객체 안의 screen 데이터.
export function cellToScreenRect(screen, gx, gy, cfg) {
  const slotW = cfg.ROOM_SLOT_W || cfg.ROOM_OUTER_W;
  const slotH = cfg.ROOM_SLOT_H || (cfg.ROOM_OUTER_H + (cfg.CHROME_OVERHEAD_Y || 0));
  return {
    left: screen.availLeft + gx * slotW,
    top: screen.availTop + gy * slotH,
    width: cfg.ROOM_OUTER_W,
    height: cfg.ROOM_OUTER_H,
    slotWidth: slotW,
    slotHeight: slotH,
  };
}

export function isCellValid(screen, gx, gy, cfg) {
  const slotW = cfg.ROOM_SLOT_W || cfg.ROOM_OUTER_W;
  const slotH = cfg.ROOM_SLOT_H || (cfg.ROOM_OUTER_H + (cfg.CHROME_OVERHEAD_Y || 0));
  const left = screen.availLeft + gx * slotW;
  const top = screen.availTop + gy * slotH;
  return (
    left >= screen.availLeft &&
    top >= screen.availTop &&
    left + slotW <= screen.availLeft + screen.availWidth + 2 &&
    top + slotH <= screen.availTop + screen.availHeight + 2
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
