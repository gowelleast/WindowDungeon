import { CONFIG, computeDynamicRoomSize } from './config.js';

export function getSlotSize(cfg = CONFIG) {
  const slotW = cfg.ROOM_SLOT_W || cfg.ROOM_OUTER_W;
  const slotH = cfg.ROOM_SLOT_H || (cfg.ROOM_OUTER_H + (cfg.CHROME_OVERHEAD_Y || 0));
  return { slotW, slotH };
}

/**
 * 각 모니터(screen)의 가로 폭(availWidth)에는 빈 여백 없이 꽉 차도록 열(cols, slotW, roomW)을 맞추고,
 * 세로 높이(slotH, roomH)는 기준 화면 높이에 통일하여 모니터 간 행(row)과 문 높이가 일직선으로 이어지게 합니다.
 */
export function getScreenSizing(screen, cfg = CONFIG) {
  const overheadY = (cfg && cfg.CHROME_OVERHEAD_Y !== undefined) ? cfg.CHROME_OVERHEAD_Y : CONFIG.CHROME_OVERHEAD_Y;
  const overheadX = (cfg && cfg.CHROME_OVERHEAD_X !== undefined) ? cfg.CHROME_OVERHEAD_X : CONFIG.CHROME_OVERHEAD_X;

  if (screen && screen.availWidth > 0 && screen.availHeight > 0) {
    const dynamic = computeDynamicRoomSize(screen.availWidth, screen.availHeight, 380, overheadY, overheadX);
    const slotH = (cfg && cfg.ROOM_SLOT_H) ? cfg.ROOM_SLOT_H : dynamic.slotH;
    const roomH = (cfg && cfg.ROOM_OUTER_H) ? cfg.ROOM_OUTER_H : Math.max(200, slotH - overheadY);
    const rows = Math.max(1, Math.floor((screen.availHeight + 2) / slotH));
    return {
      roomW: dynamic.roomW,
      roomH,
      slotW: dynamic.slotW,
      slotH,
      cols: dynamic.cols,
      rows,
    };
  }
  const { slotW, slotH } = getSlotSize(cfg);
  return {
    roomW: cfg.ROOM_OUTER_W,
    roomH: cfg.ROOM_OUTER_H,
    slotW,
    slotH,
    cols: 3,
    rows: 2,
  };
}

// gx, gy는 정수 그리드 좌표. screen은 ScreenDetailed 객체 안의 screen 데이터.
export function cellToScreenRect(screen, gx, gy, cfg = CONFIG) {
  const { roomW, roomH, slotW, slotH } = getScreenSizing(screen, cfg);
  return {
    left: screen.availLeft + gx * slotW,
    top: screen.availTop + gy * slotH,
    width: roomW,
    height: roomH,
    slotWidth: slotW,
    slotHeight: slotH,
  };
}

export function isCellValid(screen, gx, gy, cfg = CONFIG) {
  const { slotW, slotH, cols, rows } = getScreenSizing(screen, cfg);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
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

export function parseCellId(id) {
  if (!id || typeof id !== 'string') return null;
  const lastColon = id.lastIndexOf(':');
  if (lastColon === -1) return null;
  const screenLabel = id.substring(0, lastColon);
  const [gxStr, gyStr] = id.substring(lastColon + 1).split(',');
  return {
    screenLabel,
    gx: parseInt(gxStr, 10) || 0,
    gy: parseInt(gyStr, 10) || 0,
  };
}

export function neighbors(screenLabel, gx, gy) {
  return {
    up: { gx, gy: gy - 1 },
    down: { gx, gy: gy + 1 },
    left: { gx: gx - 1, gy },
    right: { gx: gx + 1, gy },
  };
}
