import { CONFIG } from '../config.js';

export const WALL = 20;
export const DOOR_W = 80;
export const OPPOSITE_DOOR = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * High-DPI (Retina) 캔버스 초기화 및 논리 해상도 바인딩
 */
export function setupHiDPICanvas(canvas, logicalW, logicalH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.__logicalW = logicalW;
  canvas.__logicalH = logicalH;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// 동적 캔버스 크기 대응 헬퍼
export function getDim(ctx) {
  const canvas = ctx && ctx.canvas;
  const W = (canvas && canvas.__logicalW) || (canvas ? canvas.width : CONFIG.ROOM_OUTER_W);
  const H = (canvas && canvas.__logicalH) || (canvas ? canvas.height : CONFIG.ROOM_OUTER_H);
  return { W, H, CX: W / 2, CY: H / 2 };
}

export function getTorches(W, H) {
  return [
    { x: 100, y: WALL },
    { x: W - 100, y: WALL },
    { x: 100, y: H - WALL },
    { x: W - 100, y: H - WALL }
  ];
}

export function getDirVector(dir) {
  if (dir === 'up') return { dx: 0, dy: -1 };
  if (dir === 'down') return { dx: 0, dy: 1 };
  if (dir === 'left') return { dx: -1, dy: 0 };
  return { dx: 1, dy: 0 };
}

export function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

// HUD 및 UI 텍스트 폭 캐시 (매 프레임 measureText 반복 호출 방지)
const textWidthCache = new Map();
export function measureTextCached(ctx, font, text) {
  const key = `${font}|${text}`;
  const cached = textWidthCache.get(key);
  if (cached !== undefined) return cached;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  if (textWidthCache.size > 256) {
    textWidthCache.clear();
  }
  textWidthCache.set(key, width);
  return width;
}

// 공통 플로팅 [SPACE] 액션 프롬프트 배지 렌더링 헬퍼
export function drawFloatingActionBadge(ctx, text, centerX, topY, opts = {}) {
  const btnW = opts.width ?? 122;
  const btnH = opts.height ?? 26;
  const radius = opts.radius ?? 7;
  const btnX = centerX - btnW / 2;
  const btnY = topY;

  ctx.save();
  ctx.fillStyle = opts.bgColor || 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = opts.strokeColor || '#38bdf8';
  ctx.lineWidth = opts.lineWidth ?? 1.8;
  ctx.shadowColor = opts.shadowColor || '#0284c7';
  ctx.shadowBlur = opts.shadowBlur ?? 10;
  roundRect(ctx, btnX, btnY, btnW, btnH, radius);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = opts.font || 'bold 11.5px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.textColor || '#e0f2fe';
  ctx.fillText(text, centerX, btnY + btnH / 2 + 0.5);
  ctx.restore();
}

export function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

