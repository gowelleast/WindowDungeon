import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { cellToScreenRect } from './grid.js';

let canvas, ctx;
let screens = [];
let cellMap = new Map();
let player = null;
let pingRtt = 0;
let msgRate = 0;
let intervalId = null;

/** 미니맵을 초기화하고, 정리(dispose) 함수를 반환합니다. */
export function initMinimap(channel) {
  canvas = document.getElementById('minimap-canvas');
  if (!canvas) return () => {};
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

  const unsubscribers = [
    channel.on(MSG.SCREENS_UPDATE, (data) => {
      screens = data.screens;
      requestAnimationFrame(drawMinimap);
    }),

    channel.on(MSG.ASSIGN, (data) => {
      cellMap.set(data.id, data);
      requestAnimationFrame(drawMinimap);
    }),

    channel.on(MSG.TICK, (data) => {
      player = data;
      requestAnimationFrame(drawMinimap);
    }),
  ];

  return () => {
    unsubscribers.forEach((off) => off());
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function updateMetrics() {
  const el = document.getElementById('sync-metrics');
  if (!el) return;
  
  const connectedRooms = cellMap.size;
  el.innerHTML = `<span>📡 <strong>개척된 방:</strong> ${connectedRooms}개</span> &nbsp;|&nbsp; <span>⚡ <strong>RTT:</strong> ${pingRtt}ms</span> &nbsp;|&nbsp; <span>📊 <strong>Msg/sec:</strong> ${msgRate}</span>`;
}

function drawMinimap() {
  if (!ctx || screens.length === 0) return;
  const now = Date.now();

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
  
  // 캔버스 크기에 맞게 스케일 계산 (여백 24px)
  const padding = 24;
  const scale = Math.min(
    (canvas.width - padding * 2) / totalW,
    (canvas.height - padding * 2) / totalH
  );

  const offsetX = (canvas.width - totalW * scale) / 2;
  const offsetY = (canvas.height - totalH * scale) / 2;

  // 화면 배경 (다크 네이비 레이더 맵)
  ctx.fillStyle = '#080a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 미세 레이더 격자 눈금선
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // 2. 모니터(Screen) 하우징 그리기
  for (const s of screens) {
    const dx = offsetX + (s.availLeft - minX) * scale;
    const dy = offsetY + (s.availTop - minY) * scale;
    const dw = s.availWidth * scale;
    const dh = s.availHeight * scale;

    // 모니터 내부 배경
    ctx.fillStyle = '#11151f';
    ctx.fillRect(dx, dy, dw, dh);

    // 모니터 외곽선
    ctx.strokeStyle = s.isPrimary ? '#38bdf8' : '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, dy, dw, dh);

    // 모니터 코너 브래킷 악센트
    const corner = 6;
    ctx.strokeStyle = s.isPrimary ? '#7dd3fc' : '#64748b';
    ctx.lineWidth = 2;
    // 좌상단
    ctx.beginPath(); ctx.moveTo(dx, dy + corner); ctx.lineTo(dx, dy); ctx.lineTo(dx + corner, dy); ctx.stroke();
    // 우상단
    ctx.beginPath(); ctx.moveTo(dx + dw - corner, dy); ctx.lineTo(dx + dw, dy); ctx.lineTo(dx + dw, dy + corner); ctx.stroke();

    // 텍스트 라벨
    ctx.fillStyle = s.isPrimary ? '#bae6fd' : '#94a3b8';
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillText(`${s.label}${s.isPrimary ? ' ★' : ''}`, dx + 8, dy + 16);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${s.availWidth} × ${s.availHeight}`, dx + 8, dy + 28);
  }

  // 3. 개척된 방(Cell) 및 출입문(Doors) 그리기
  for (const cell of cellMap.values()) {
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (!s) continue;
    
    const rect = cellToScreenRect(s, cell.gx, cell.gy, CONFIG);
    const dx = offsetX + (rect.left - minX) * scale;
    const dy = offsetY + (rect.top - minY) * scale;
    const dw = rect.width * scale;
    const dh = rect.height * scale;

    // 방 내부 타일 바닥
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fillRect(dx, dy, dw, dh);

    // 방 테두리
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(dx, dy, dw, dh);

    // 문 출입구 표시 (도어 노치)
    if (cell.doors) {
      ctx.fillStyle = '#38bdf8';
      const notchW = dw * 0.2;
      const notchThick = 2;
      cell.doors.forEach(dir => {
        if (dir === 'up') ctx.fillRect(dx + dw / 2 - notchW / 2, dy, notchW, notchThick);
        if (dir === 'down') ctx.fillRect(dx + dw / 2 - notchW / 2, dy + dh - notchThick, notchW, notchThick);
        if (dir === 'left') ctx.fillRect(dx, dy + dh / 2 - notchW / 2, notchThick, notchW);
        if (dir === 'right') ctx.fillRect(dx + dw - notchThick, dy + dh / 2 - notchW / 2, notchThick, notchW);
      });
    }

    // 깃발 방 표시
    if (cell.hasFlag) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩', dx + dw / 2, dy + dh / 2 + 4);
      ctx.textAlign = 'left';
    }
  }

  // 4. 플레이어 실시간 레이더 핑(Ping) 그리기
  if (player && cellMap.has(player.activeCellId)) {
    const cell = cellMap.get(player.activeCellId);
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (s) {
      const rect = cellToScreenRect(s, cell.gx, cell.gy, CONFIG);
      const px = rect.left + player.lx;
      const py = rect.top + player.ly;

      const pdx = offsetX + (px - minX) * scale;
      const pdy = offsetY + (py - minY) * scale;

      // 레이더 펄스 파동 (Expanding Radar Ring)
      const pulseProgress = (now % 1200) / 1200; // 0 ~ 1
      const pulseR = 4 + pulseProgress * 14;
      const pulseAlpha = 1 - pulseProgress;

      ctx.save();
      ctx.strokeStyle = `rgba(52, 211, 153, ${pulseAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pdx, pdy, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // 플레이어 중심 점 (밝은 에메랄드)
      ctx.fillStyle = '#34d399';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pdx, pdy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
