import { CONFIG, computeDynamicRoomSize } from './config.js';
import { MSG } from './protocol.js';
import { cellToScreenRect } from './grid.js';

let launcherCanvas, launcherCtx;
let screens = [];
let cellMap = new Map();
let player = null;
let pingRtt = 0;
let msgRate = 0;
let intervalId = null;
let minimapRafId = null;

// Document Picture-in-Picture 전역 상태
let activePipWindow = null;
let isRemotePipOpen = false;
let pipCanvas = null;
let pipCtx = null;
let currentChannel = null;

function initHiDPIMinimapCanvas(canvas, logicalW, logicalH, win = window) {
  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  canvas.__logicalW = logicalW;
  canvas.__logicalH = logicalH;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function scheduleMinimapRender() {
  const hasActiveCanvas = Boolean(
    (launcherCtx && launcherCanvas) ||
    (pipCtx && pipCanvas && activePipWindow && !activePipWindow.closed)
  );
  if (!hasActiveCanvas || minimapRafId !== null) return;
  minimapRafId = requestAnimationFrame(() => {
    minimapRafId = null;
    renderAllMinimaps();
  });
}

/** 미니맵을 초기화하고, 정리(dispose) 함수를 반환합니다. */
export function initMinimap(channel) {
  currentChannel = channel;
  launcherCanvas = document.getElementById('minimap-canvas');
  if (launcherCanvas) {
    launcherCtx = initHiDPIMinimapCanvas(launcherCanvas, 600, 400, window);
  }

  // 이전 상태 초기화
  cellMap.clear();
  player = null;
  msgRate = 0;
  pingRtt = 0;
  isRemotePipOpen = false;

  if (activePipWindow && !activePipWindow.closed) {
    try { activePipWindow.close(); } catch (e) {}
    activePipWindow = null;
  }

  if (intervalId) clearInterval(intervalId);

  // 초당 1회 지표 업데이트 및 PING 발송 (런처 창이거나 PiP가 열린 창에서만 수행)
  intervalId = setInterval(() => {
    if (!launcherCanvas && (!activePipWindow || activePipWindow.closed)) return;
    msgRate = channel.msgPerSec;
    pingRtt = Math.round(channel.lastRtt);
    updateMetrics();
    if (launcherCanvas) {
      channel.ping();
    }
  }, 1000);

  const unsubscribers = [
    channel.on(MSG.SCREENS_UPDATE, (data) => {
      screens = data.screens;
      if (data.roomW) CONFIG.ROOM_OUTER_W = data.roomW;
      if (data.roomH) CONFIG.ROOM_OUTER_H = data.roomH;
      if (data.slotW) CONFIG.ROOM_SLOT_W = data.slotW;
      if (data.slotH) CONFIG.ROOM_SLOT_H = data.slotH;
      scheduleMinimapRender();
    }),

    channel.on(MSG.ASSIGN, (data) => {
      cellMap.set(data.id, data);
      scheduleMinimapRender();
    }),

    channel.on(MSG.TICK, (data) => {
      player = data;
      scheduleMinimapRender();
    }),

    // 다른 창에서 PiP 닫기 요청 시
    channel.on(MSG.PIP_CLOSE, () => {
      if (activePipWindow && !activePipWindow.closed) {
        try { activePipWindow.close(); } catch (e) {}
      }
      activePipWindow = null;
      isRemotePipOpen = false;
      updateMetrics();
    }),

    // 다른 창에서 PiP 상태 알림 시
    channel.on(MSG.PIP_STATE, (data) => {
      isRemotePipOpen = !!data.isOpen;
      updateMetrics();
    }),

    // 새로운 방 팝업이 열릴 때 현재 창이 PiP를 보유하고 있다면 열림 상태를 알려줌
    channel.on(MSG.HELLO, () => {
      if (activePipWindow && !activePipWindow.closed) {
        channel.send(MSG.PIP_STATE, { isOpen: true });
      }
    }),
  ];

  // 런처 화면 내에서 직접 M / ㅡ 키 입력 시에도 토글 (런처 창에만 적용)
  if (launcherCanvas) {
    const onLauncherKey = (e) => {
      const isM = e.code === 'KeyM' || e.key.toLowerCase() === 'm' || e.key === 'ㅡ';
      if (isM && !e.repeat) {
        e.preventDefault();
        togglePipMinimap(window, channel);
      }
    };
    window.addEventListener('keydown', onLauncherKey);
    unsubscribers.push(() => window.removeEventListener('keydown', onLauncherKey));
  }

  // 런처 화면 PiP 수동 버튼 바인딩
  const btnPip = document.getElementById('btn-pip');
  if (btnPip) {
    const onPipClick = () => togglePipMinimap(window, channel);
    btnPip.addEventListener('click', onPipClick);
    unsubscribers.push(() => btnPip.removeEventListener('click', onPipClick));
  }

  return () => {
    unsubscribers.forEach((off) => off());
    if (minimapRafId !== null) {
      cancelAnimationFrame(minimapRafId);
      minimapRafId = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (activePipWindow && !activePipWindow.closed) {
      try { channel.send(MSG.PIP_STATE, { isOpen: false }); } catch (e) {}
      try { activePipWindow.close(); } catch (e) {}
      activePipWindow = null;
    }
  };
}

/** PiP 창의 열림 여부 확인 */
export function isPipWindowOpen(targetWindow = window) {
  if (activePipWindow && !activePipWindow.closed) return true;
  if (targetWindow.documentPictureInPicture && targetWindow.documentPictureInPicture.window) return true;
  return isRemotePipOpen;
}

let isToggling = false;

/** PiP 미니맵 토글 (M 키 입력 시 활성 창에서 직접 호출) */
export async function togglePipMinimap(targetWindow = window, channel = null) {
  if (isToggling) return;
  isToggling = true;

  try {
    const ch = channel || currentChannel;

    // 이미 열려 있으면 닫기
    if (isPipWindowOpen(targetWindow)) {
      closePipMinimap(targetWindow, ch);
    } else {
      // 닫혀 있으면 큼직하고 시원한 350x260 창으로 오픈
      await openPipMinimap(targetWindow, ch);
    }
  } finally {
    setTimeout(() => {
      isToggling = false;
    }, 300);
  }
}

/** Document Picture-in-Picture 미니맵 창 열기 (시원하고 넓은 350x260 해상도) */
export async function openPipMinimap(targetWindow = window, channel = null) {
  const ch = channel || currentChannel;

  if (!('documentPictureInPicture' in targetWindow)) {
    console.warn('[Minimap] 이 브라우저는 Document Picture-in-Picture API를 지원하지 않습니다.');
    return;
  }

  // 이미 열려 있으면 재오픈 불필요
  if (isPipWindowOpen(targetWindow)) return;

  try {
    // 350 x 260 크기로 시원하게 오픈
    const pipWin = await targetWindow.documentPictureInPicture.requestWindow({
      width: 350,
      height: 260,
    });

    activePipWindow = pipWin;
    isRemotePipOpen = true;
    if (ch) ch.send(MSG.PIP_STATE, { isOpen: true });

    // 부모 창의 스타일 전달
    copyStylesheetsToPip(targetWindow, pipWin);

    pipWin.document.documentElement.className = 'pip-html';
    pipWin.document.body.className = 'pip-body';
    pipWin.document.body.innerHTML = `
      <div class="pip-wrapper">
        <div class="pip-topbar">
          <span class="pip-topbar-title">
            🗺️ 미니맵
          </span>
          <button id="btn-pip-close-x" class="btn-pip pip-close-btn">
            ✕ 닫기 (M)
          </button>
        </div>
        <div id="pip-canvas-area" class="pip-canvas-area">
          <canvas id="pip-map-canvas" width="350" height="205"></canvas>
        </div>
        <div id="pip-bottom-metrics" class="pip-bottom-metrics">
          <span>방: ${cellMap.size}개 | RTT: ${pingRtt}ms</span>
          <span>Msg: ${msgRate}/s</span>
        </div>
      </div>
    `;

    pipCanvas = pipWin.document.getElementById('pip-map-canvas');
    if (pipCanvas) {
      const areaEl = pipWin.document.getElementById('pip-canvas-area');
      const initW = (areaEl && areaEl.clientWidth > 50) ? areaEl.clientWidth : 350;
      const initH = (areaEl && areaEl.clientHeight > 50) ? areaEl.clientHeight : 205;
      pipCtx = initHiDPIMinimapCanvas(pipCanvas, initW, initH, pipWin);
    }

    pipWin.addEventListener('resize', () => {
      scheduleMinimapRender();
    });

    // 닫기 버튼 이벤트
    const btnClose = pipWin.document.getElementById('btn-pip-close-x');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        closePipMinimap(targetWindow, ch);
        try { targetWindow.focus(); } catch (e) {}
      });
    }

    // PiP 창이 포커스를 잡고 있더라도 방향키, WASD, 스페이스바 입력을 게임으로 완벽 중계
    const pipKeys = new Set();
    const handlePipKey = (e, isDown) => {
      const isM = e.code === 'KeyM' || e.key.toLowerCase() === 'm' || e.key === 'ㅡ';
      if (isM || e.key === 'Escape') {
        if (isDown) {
          e.preventDefault();
          closePipMinimap(targetWindow, ch);
          try { targetWindow.focus(); } catch (err) {}
        }
        return;
      }

      const codeToMoveKey = {
        KeyW: 'w',
        KeyA: 'a',
        KeyS: 's',
        KeyD: 'd'
      };
      const korToMoveKey = {
        'ㅈ': 'w',
        'ㅉ': 'w',
        'ㅁ': 'a',
        'ㄴ': 's',
        'ㅇ': 'd'
      };
      const mappedMoveKey = codeToMoveKey[e.code] || korToMoveKey[e.key];

      if (mappedMoveKey || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        const keyName = mappedMoveKey || ((e.key.length === 1) ? e.key.toLowerCase() : e.key);
        if (isDown) {
          pipKeys.add(keyName);
        } else {
          pipKeys.delete(keyName);
        }
        if (ch) {
          ch.send(MSG.INPUT, { keys: Array.from(pipKeys) });
        }
        try {
          targetWindow.dispatchEvent(new KeyboardEvent(e.type, {
            key: e.key,
            code: e.code,
            bubbles: true,
            cancelable: true
          }));
        } catch (err) {}
      }
    };

    pipWin.addEventListener('keydown', (e) => handlePipKey(e, true));
    pipWin.addEventListener('keyup', (e) => handlePipKey(e, false));
    pipWin.addEventListener('blur', () => {
      if (pipKeys.size > 0) {
        pipKeys.clear();
        if (ch) ch.send(MSG.INPUT, { keys: [] });
      }
    });

    // 창 닫힐 때 정리
    pipWin.addEventListener('pagehide', () => {
      activePipWindow = null;
      pipCanvas = null;
      pipCtx = null;
      isRemotePipOpen = false;
      if (ch) ch.send(MSG.PIP_STATE, { isOpen: false });
      updateMetrics();
      try { targetWindow.focus(); } catch (e) {}
    });

    renderAllMinimaps();
    updateMetrics();

    // PiP 창 오픈 직후 방 창으로 포커스 복원 (캐릭터 즉시 이동 가능)
    setTimeout(() => {
      try {
        targetWindow.focus();
      } catch (e) {}
    }, 60);

  } catch (err) {
    console.warn('[Minimap] Document PiP 열기 실패/취소:', err);
  }
}

/** PiP 미니맵 닫기 */
export function closePipMinimap(targetWindow = window, channel = null) {
  const ch = channel || currentChannel;

  if (activePipWindow && !activePipWindow.closed) {
    try { activePipWindow.close(); } catch (e) {}
  }
  activePipWindow = null;

  if (targetWindow.documentPictureInPicture && targetWindow.documentPictureInPicture.window) {
    try { targetWindow.documentPictureInPicture.window.close(); } catch (e) {}
  }

  isRemotePipOpen = false;
  if (ch) {
    ch.send(MSG.PIP_CLOSE);
    ch.send(MSG.PIP_STATE, { isOpen: false });
  }

  pipCanvas = null;
  pipCtx = null;
  updateMetrics();
  try { targetWindow.focus(); } catch (e) {}
}

/** 부모 창의 스타일시트를 PiP 윈도우에 전달 */
function copyStylesheetsToPip(fromWindow, targetPipWindow) {
  [...fromWindow.document.styleSheets].forEach((styleSheet) => {
    try {
      const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
      const style = targetPipWindow.document.createElement('style');
      style.textContent = cssRules;
      targetPipWindow.document.head.appendChild(style);
    } catch (e) {
      const link = targetPipWindow.document.createElement('link');
      link.rel = 'stylesheet';
      link.type = styleSheet.type || 'text/css';
      link.href = styleSheet.href;
      targetPipWindow.document.head.appendChild(link);
    }
  });
}

/** 모든 활성 캔버스(런처 캔버스 + PiP 캔버스)에 동시 렌더링 */
function renderAllMinimaps() {
  const now = Date.now();

  // 1. 런처 대시보드 캔버스
  if (launcherCtx && launcherCanvas) {
    drawMinimapTo(launcherCtx, launcherCanvas, now);
  }

  // 2. PiP 플로팅 창 캔버스
  if (pipCtx && pipCanvas && activePipWindow && !activePipWindow.closed) {
    drawMinimapTo(pipCtx, pipCanvas, now);
  }
}

function updateMetrics() {
  const connectedRooms = cellMap.size;

  // 런처 화면 지표 갱신
  const el = document.getElementById('sync-metrics');
  if (el) {
    el.innerHTML = `<span>📡 <strong>개척된 방:</strong> ${connectedRooms}개</span> &nbsp;|&nbsp; <span>⚡ <strong>RTT:</strong> ${pingRtt}ms</span> &nbsp;|&nbsp; <span>📊 <strong>Msg/sec:</strong> ${msgRate}</span>`;
  }

  const btnPip = document.getElementById('btn-pip');
  if (btnPip) {
    const open = isPipWindowOpen();
    btnPip.classList.toggle('active', open);
    btnPip.innerHTML = open ? '📌 PiP 닫기 (M)' : '📌 Always-on-Top (PiP)';
  }

  // PiP 윈도우 지표 갱신
  if (activePipWindow && !activePipWindow.closed) {
    const pipBottomMetrics = activePipWindow.document.getElementById('pip-bottom-metrics');
    if (pipBottomMetrics) {
      pipBottomMetrics.innerHTML = `<span>방: ${connectedRooms}개 | RTT: ${pingRtt}ms</span><span>Msg: ${msgRate}/s</span>`;
    }
  }
}

/** 캔버스 컨텍스트에 전술 미니맵 렌더링 */
function drawMinimapTo(targetCtx, targetCanvas, now) {
  if (!targetCtx || screens.length === 0) return;

  if (targetCanvas === pipCanvas && activePipWindow && !activePipWindow.closed) {
    const cw = targetCanvas.clientWidth;
    const ch = targetCanvas.clientHeight;
    if (cw > 50 && ch > 50 && (Math.abs(cw - (targetCanvas.__logicalW || 0)) > 1 || Math.abs(ch - (targetCanvas.__logicalH || 0)) > 1)) {
      initHiDPIMinimapCanvas(targetCanvas, cw, ch, activePipWindow);
    }
  }

  const canvasW = targetCanvas.__logicalW || targetCanvas.width;
  const canvasH = targetCanvas.__logicalH || targetCanvas.height;

  // 1. 전체 화면 Bounding Box 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of screens) {
    if (s.availLeft < minX) minX = s.availLeft;
    if (s.availTop < minY) minY = s.availTop;
    if (s.availLeft + s.availWidth > maxX) maxX = s.availLeft + s.availWidth;
    if (s.availTop + s.availHeight > maxY) maxY = s.availTop + s.availHeight;
  }

  const totalW = maxX - minX;
  const totalH = maxY - minY;

  const padX = 18;
  const padTop = 12;
  const padBottom = 26;
  const availCanvasW = canvasW - padX * 2;
  const availCanvasH = canvasH - padTop - padBottom;

  const scale = Math.min(
    availCanvasW / totalW,
    availCanvasH / totalH
  );

  const offsetX = (canvasW - totalW * scale) / 2;
  const offsetY = padTop + (availCanvasH - totalH * scale) / 2;

  // 화면 배경 (다크 네이비 레이더 맵)
  targetCtx.fillStyle = '#080a0f';
  targetCtx.fillRect(0, 0, canvasW, canvasH);

  // 미세 레이더 격자 눈금선
  targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  for (let x = 0; x < canvasW; x += 25) {
    targetCtx.moveTo(x, 0); targetCtx.lineTo(x, canvasH);
  }
  for (let y = 0; y < canvasH; y += 25) {
    targetCtx.moveTo(0, y); targetCtx.lineTo(canvasW, y);
  }
  targetCtx.stroke();

  // 2. 모니터 하우징 및 방 슬롯 크기 설정 사전 캐싱 (가로는 각 모니터에 딱 맞게, 세로는 기준 높이에 통일)
  const screenLookup = new Map();
  for (const s of screens) {
    const dynamic = computeDynamicRoomSize(
      s.availWidth,
      s.availHeight,
      380,
      CONFIG.CHROME_OVERHEAD_Y,
      CONFIG.CHROME_OVERHEAD_X
    );
    const unifiedSlotH = CONFIG.ROOM_SLOT_H || dynamic.slotH;
    const unifiedRoomH = CONFIG.ROOM_OUTER_H || dynamic.roomH;
    const rows = Math.max(1, Math.floor((s.availHeight + 2) / unifiedSlotH));
    const sizing = {
      roomW: dynamic.roomW,
      roomH: unifiedRoomH,
      slotW: dynamic.slotW,
      slotH: unifiedSlotH,
      cols: dynamic.cols,
      rows
    };
    screenLookup.set(s.label, {
      screen: s,
      sizing,
      cellCfg: {
        ...CONFIG,
        ROOM_OUTER_W: sizing.roomW,
        ROOM_OUTER_H: sizing.roomH,
        ROOM_SLOT_W: sizing.slotW,
        ROOM_SLOT_H: sizing.slotH
      }
    });

    const dx = offsetX + (s.availLeft - minX) * scale;
    const dy = offsetY + (s.availTop - minY) * scale;
    const dw = s.availWidth * scale;
    const dh = s.availHeight * scale;

    targetCtx.fillStyle = '#11151f';
    targetCtx.fillRect(dx, dy, dw, dh);

    targetCtx.strokeStyle = s.isPrimary ? '#38bdf8' : '#334155';
    targetCtx.lineWidth = 1.5;
    targetCtx.strokeRect(dx, dy, dw, dh);

    const corner = 5;
    targetCtx.strokeStyle = s.isPrimary ? '#7dd3fc' : '#64748b';
    targetCtx.lineWidth = 2;
    targetCtx.beginPath(); targetCtx.moveTo(dx, dy + corner); targetCtx.lineTo(dx, dy); targetCtx.lineTo(dx + corner, dy); targetCtx.stroke();
    targetCtx.beginPath(); targetCtx.moveTo(dx + dw - corner, dy); targetCtx.lineTo(dx + dw, dy); targetCtx.lineTo(dx + dw, dy + corner); targetCtx.stroke();

    targetCtx.fillStyle = s.isPrimary ? '#bae6fd' : '#94a3b8';
    targetCtx.font = 'bold 10px "Outfit", sans-serif';
    targetCtx.fillText(`${s.label}${s.isPrimary ? ' ★' : ''}`, dx + 6, dy + 14);
  }

  const getCellCanvasBox = (screenLabel, gx, gy) => {
    const entry = screenLookup.get(screenLabel);
    if (!entry) return null;
    const { screen, sizing, cellCfg } = entry;
    const rect = cellToScreenRect(screen, gx, gy, cellCfg);
    const visualSlotW = screen.availWidth / sizing.cols;
    const visualSlotH = sizing.slotH;
    const visualLeft = screen.availLeft + gx * visualSlotW;
    const visualTop = screen.availTop + gy * visualSlotH;
    return {
      rect: {
        ...rect,
        left: visualLeft,
        top: visualTop
      },
      dx: offsetX + (visualLeft - minX) * scale,
      dy: offsetY + (visualTop - minY) * scale,
      dw: visualSlotW * scale,
      dh: visualSlotH * scale,
      ratioX: visualSlotW / (rect.width || CONFIG.ROOM_OUTER_W),
      ratioY: visualSlotH / (rect.height || CONFIG.ROOM_OUTER_H)
    };
  };

  // 3. 개척된 방(Cell) 및 출입문(Doors) 그리기
  for (const cell of cellMap.values()) {
    const box = getCellCanvasBox(cell.screenLabel, cell.gx, cell.gy);
    if (!box) continue;
    const { dx, dy, dw, dh } = box;

    // 방 내부 타일 바닥
    targetCtx.fillStyle = cell.hasFlag ? 'rgba(245, 158, 11, 0.16)' : 'rgba(16, 185, 129, 0.12)';
    targetCtx.fillRect(dx, dy, dw, dh);

    // 방 테두리
    targetCtx.strokeStyle = cell.hasFlag ? '#facc15' : '#10b981';
    targetCtx.lineWidth = cell.hasFlag ? 1.5 : 1.2;
    targetCtx.strokeRect(dx, dy, dw, dh);

    // 문 출입구 표시 (도어 노치)
    if (cell.doors) {
      targetCtx.fillStyle = '#38bdf8';
      const notchW = dw * 0.22;
      const notchThick = 2;
      cell.doors.forEach(dir => {
        if (dir === 'up') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy, notchW, notchThick);
        if (dir === 'down') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy + dh - notchThick, notchW, notchThick);
        if (dir === 'left') targetCtx.fillRect(dx, dy + dh / 2 - notchW / 2, notchThick, notchW);
        if (dir === 'right') targetCtx.fillRect(dx + dw - notchThick, dy + dh / 2 - notchW / 2, notchThick, notchW);
      });
    }

    // 깃발 방 표시
    if (cell.hasFlag) {
      targetCtx.fillStyle = '#f59e0b';
      targetCtx.font = 'bold 12px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.fillText('🚩', dx + dw / 2, dy + dh / 2 + 4);
      targetCtx.textAlign = 'left';
    }
  }

  // 4. 플레이어 실시간 레이더 핑(Ping) 그리기
  if (player && cellMap.has(player.activeCellId)) {
    const cell = cellMap.get(player.activeCellId);
    const box = getCellCanvasBox(cell.screenLabel, cell.gx, cell.gy);
    if (box) {
      const px = box.rect.left + player.lx * box.ratioX;
      const py = box.rect.top + player.ly * box.ratioY;

      const pdx = offsetX + (px - minX) * scale;
      const pdy = offsetY + (py - minY) * scale;

      const pulseProgress = (now % 1200) / 1200;
      const pulseR = 4 + pulseProgress * 14;
      const pulseAlpha = 1 - pulseProgress;

      targetCtx.save();
      targetCtx.strokeStyle = `rgba(52, 211, 153, ${pulseAlpha})`;
      targetCtx.lineWidth = 1.5;
      targetCtx.beginPath();
      targetCtx.arc(pdx, pdy, pulseR, 0, Math.PI * 2);
      targetCtx.stroke();

      targetCtx.fillStyle = '#34d399';
      targetCtx.shadowColor = '#10b981';
      targetCtx.shadowBlur = 8;
      targetCtx.beginPath();
      targetCtx.arc(pdx, pdy, 3.5, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();
    }
  }

  // 5. 하단 범례 (Legend)
  targetCtx.save();
  targetCtx.font = '10px "JetBrains Mono", monospace';
  targetCtx.fillStyle = '#94a3b8';
  targetCtx.fillText('🟢 나  |  🚩 목표 지점  |  [M] 미니맵 토글', 10, canvasH - 8);
  targetCtx.restore();
}
