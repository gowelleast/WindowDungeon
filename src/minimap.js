import { CONFIG } from './config.js';
import { MSG } from './protocol.js';

let canvas, ctx;
let screens = [];
let cellMap = new Map();
let player = null;
let lastPingTime = Date.now();
let pingRtt = 0;
let msgCount = 0;
let msgRate = 0;
let intervalId = null;

export function initMinimap(channel) {
  canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  // 이전 상태 초기화
  cellMap.clear();
  player = null;
  msgRate = 0;
  pingRtt = 0;
  
  if (intervalId) clearInterval(intervalId);

  // 초당 1회 지표 업데이트 및 PING 발송
  intervalId = setInterval(() => {
    msgRate = channel.msgPerSec;
    pingRtt = Math.round(channel.lastRtt);
    updateMetrics();
    channel.ping();
  }, 1000);

  channel.on(MSG.SCREENS_UPDATE, (data) => {
    screens = data.screens;
    requestAnimationFrame(drawMinimap);
  });

  channel.on(MSG.ASSIGN, (data) => {
    cellMap.set(data.id, data);
    requestAnimationFrame(drawMinimap);
  });

  channel.on(MSG.TICK, (data) => {
    player = data;
    requestAnimationFrame(drawMinimap);
  });
}

function updateMetrics() {
  const el = document.getElementById('sync-metrics');
  if (!el) return;
  
  // 현재 접속된 고유 방 갯수 계산 (Master Worker + Launcher + 팝업들)
  const connectedRooms = cellMap.size;
  
  el.innerHTML = `[통계] 개척된 방: ${connectedRooms}개 | RTT: ${pingRtt}ms | Msg/sec: ${msgRate}`;
}

function drawMinimap() {
  if (!ctx || screens.length === 0) return;

  // 1. 전체 화면을 덮는 Bounding Box 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of screens) {
    if (s.availLeft < minX) minX = s.availLeft;
    if (s.availTop < minY) minY = s.availTop;
    if (s.availLeft + s.availWidth > maxX) maxX = s.availLeft + s.availWidth;
    if (s.availTop + s.availHeight > maxY) maxY = s.availTop + s.availHeight;
  }

  const totalW = maxX - minX;
  const totalH = maxY - minY;
  
  // 캔버스 크기에 맞게 스케일 계산 (여백 20px)
  const padding = 20;
  const scale = Math.min(
    (canvas.width - padding * 2) / totalW,
    (canvas.height - padding * 2) / totalH
  );

  const offsetX = (canvas.width - totalW * scale) / 2;
  const offsetY = (canvas.height - totalH * scale) / 2;

  // 화면 지우기
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. 모니터(Screen) 그리기
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  for (const s of screens) {
    const dx = offsetX + (s.availLeft - minX) * scale;
    const dy = offsetY + (s.availTop - minY) * scale;
    const dw = s.availWidth * scale;
    const dh = s.availHeight * scale;

    ctx.fillStyle = '#222';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeRect(dx, dy, dw, dh);

    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${s.label}${s.isPrimary ? ' (Primary)' : ''}`, dx + 10, dy + 20);
    ctx.fillText(`${s.availWidth}x${s.availHeight}`, dx + 10, dy + 35);
  }

  // 3. 개척된 방(Cell) 그리기
  for (const cell of cellMap.values()) {
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (!s) continue;
    
    // 방의 절대 좌표 계산 (grid.js와 완전히 일치시킴: top-left 기준)
    const cellW = CONFIG.ROOM_OUTER_W;
    const cellH = CONFIG.ROOM_OUTER_H;
    const absX = s.availLeft + cell.gx * cellW;
    const absY = s.availTop + cell.gy * cellH;

    const dx = offsetX + (absX - minX) * scale;
    const dy = offsetY + (absY - minY) * scale;
    const dw = cellW * scale;
    const dh = cellH * scale;

    ctx.fillStyle = 'rgba(74, 222, 128, 0.2)'; // 연한 초록색
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx, dy, dw, dh);
  }

  // 4. 플레이어 그리기
  if (player && cellMap.has(player.activeCellId)) {
    const cell = cellMap.get(player.activeCellId);
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (s) {
      const cellW = CONFIG.ROOM_OUTER_W;
      const cellH = CONFIG.ROOM_OUTER_H;
      const absX = s.availLeft + cell.gx * cellW;
      const absY = s.availTop + cell.gy * cellH;

      // 플레이어 절대 좌표 (방 내부 좌표 lx, ly를 더함)
      const px = absX + player.lx;
      const py = absY + player.ly;

      const pdx = offsetX + (px - minX) * scale;
      const pdy = offsetY + (py - minY) * scale;

      ctx.fillStyle = '#ff5252'; // 플레이어는 눈에 띄는 빨간색
      ctx.beginPath();
      ctx.arc(pdx, pdy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
