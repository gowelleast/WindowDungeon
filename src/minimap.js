import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { cellToScreenRect } from './grid.js';

let launcherCanvas, launcherCtx;
let screens = [];
let cellMap = new Map();
let player = null;
let pingRtt = 0;
let msgRate = 0;
let intervalId = null;

// Document Picture-in-Picture 전역 상태
let activePipWindow = null;
let isRemotePipOpen = false;
let pipCanvas = null;
let pipCtx = null;
let currentChannel = null;

/** 미니맵을 초기화하고, 정리(dispose) 함수를 반환합니다 (런처 화면용). */
export function initMinimap(channel) {
  currentChannel = channel;
  launcherCanvas = document.getElementById('minimap-canvas');
  if (launcherCanvas) {
    launcherCtx = launcherCanvas.getContext('2d');
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
      renderAllMinimaps();
    }),

    channel.on(MSG.ASSIGN, (data) => {
      cellMap.set(data.id, data);
      renderAllMinimaps();
    }),

    channel.on(MSG.TICK, (data) => {
      player = data;
      renderAllMinimaps();
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
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (activePipWindow && !activePipWindow.closed) {
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

    pipWin.document.body.className = 'pip-body';
    pipWin.document.body.innerHTML = `
      <div class="pip-wrapper" style="width:100%; height:100%; display:flex; flex-direction:column; background:#080a0f;">
        <div class="pip-topbar" style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#11151f; border-bottom:1px solid rgba(255,255,255,0.08);">
          <span class="pip-topbar-title" style="font-size:12px; font-weight:700; color:#38bdf8; display:flex; align-items:center; gap:5px;">
            🗺️ 미니맵
          </span>
          <button id="btn-pip-close-x" class="btn-pip" style="padding:2px 8px; font-size:11px; background:#1e293b; color:#94a3b8; border:1px solid rgba(255,255,255,0.15); border-radius:4px; cursor:pointer;">
            ✕ 닫기 (M)
          </button>
        </div>
        <div id="pip-canvas-area" style="flex:1; width:100%; position:relative; overflow:hidden; background:#080a0f;">
          <canvas id="pip-map-canvas" width="350" height="205" style="width:100%; height:100%; display:block;"></canvas>
        </div>
        <div id="pip-bottom-metrics" class="pip-bottom-metrics" style="padding:3px 10px; font-family:'JetBrains Mono',monospace; font-size:10px; color:#34d399; background:rgba(0,0,0,0.4); border-top:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;">
          <span>방: ${cellMap.size}개 | RTT: ${pingRtt}ms</span>
          <span>Msg: ${msgRate}/s</span>
        </div>
      </div>
    `;

    pipCanvas = pipWin.document.getElementById('pip-map-canvas');
    if (pipCanvas) {
      pipCtx = pipCanvas.getContext('2d');
    }

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

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        const keyName = (e.key.length === 1) ? e.key.toLowerCase() : e.key;
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
  
  const padding = 20;
  const scale = Math.min(
    (targetCanvas.width - padding * 2) / totalW,
    (targetCanvas.height - padding * 2) / totalH
  );

  const offsetX = (targetCanvas.width - totalW * scale) / 2;
  const offsetY = (targetCanvas.height - totalH * scale) / 2;

  // 화면 배경 (다크 네이비 레이더 맵)
  targetCtx.fillStyle = '#080a0f';
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  // 미세 레이더 격자 눈금선
  targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  targetCtx.lineWidth = 1;
  for (let x = 0; x < targetCanvas.width; x += 25) {
    targetCtx.beginPath(); targetCtx.moveTo(x, 0); targetCtx.lineTo(x, targetCanvas.height); targetCtx.stroke();
  }
  for (let y = 0; y < targetCanvas.height; y += 25) {
    targetCtx.beginPath(); targetCtx.moveTo(0, y); targetCtx.lineTo(targetCanvas.width, y); targetCtx.stroke();
  }

  // 2. 모니터 하우징
  for (const s of screens) {
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

  // 3. 개척된 방(Cell) 및 출입문(Doors) 그리기
  for (const cell of cellMap.values()) {
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (!s) continue;
    
    const rect = cellToScreenRect(s, cell.gx, cell.gy, CONFIG);
    const dx = offsetX + (rect.left - minX) * scale;
    const dy = offsetY + (rect.top - minY) * scale;
    const dw = (rect.slotWidth || rect.width) * scale;
    const dh = (rect.slotHeight || rect.height) * scale;

    targetCtx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    targetCtx.fillRect(dx, dy, dw, dh);

    targetCtx.strokeStyle = '#10b981';
    targetCtx.lineWidth = 1.2;
    targetCtx.strokeRect(dx, dy, dw, dh);

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

    // 🚪 발견된 탈출문 아이콘 마킹
    if (player && player.exitDiscovered && player.exitCellId === cell.id) {
      targetCtx.fillStyle = player.hasKey ? '#eab308' : '#ef4444';
      targetCtx.font = 'bold 13px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.fillText(player.hasKey ? '🚪' : '🔒', dx + dw / 2, dy + dh / 2 + 5);
      targetCtx.textAlign = 'left';
    }

    // 🔑 발견된 황금 열쇠 아이콘 마킹
    if (player && player.keyDiscovered && !player.hasKey && player.keyCellId === cell.id) {
      targetCtx.fillStyle = '#facc15';
      targetCtx.font = 'bold 12px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.fillText('🔑', dx + dw / 2, dy + dh / 2 + 4);
      targetCtx.textAlign = 'left';
    }
  }

  // 4. 👾 백그라운드 순찰 몬스터 레이더 핀포인트 (label:gx,gy 정확히 파싱)
  if (player && player.monster && player.monster.cellId) {
    const m = player.monster;
    const lastColon = m.cellId.lastIndexOf(':');
    if (lastColon !== -1) {
      const mLabel = m.cellId.substring(0, lastColon);
      const coords = m.cellId.substring(lastColon + 1).split(',');
      const mGx = parseInt(coords[0], 10) || 0;
      const mGy = parseInt(coords[1], 10) || 0;
      const s = screens.find(sc => sc.label === mLabel);

      if (s) {
        const rect = cellToScreenRect(s, mGx, mGy, CONFIG);
        const mx = rect.left + m.lx;
        const my = rect.top + m.ly;

        const mdx = offsetX + (mx - minX) * scale;
        const mdy = offsetY + (my - minY) * scale;

        targetCtx.save();
        // 몬스터 붉은 레이더 펄스
        const mPulse = (now % 800) / 800;
        targetCtx.strokeStyle = `rgba(239, 68, 68, ${1 - mPulse})`;
        targetCtx.lineWidth = 1.5;
        targetCtx.beginPath();
        targetCtx.arc(mdx, mdy, 3 + mPulse * 12, 0, Math.PI * 2);
        targetCtx.stroke();

        // 몬스터 아이콘 점
        targetCtx.fillStyle = '#ef4444';
        targetCtx.shadowColor = '#dc2626';
        targetCtx.shadowBlur = 8;
        targetCtx.beginPath();
        targetCtx.arc(mdx, mdy, 4, 0, Math.PI * 2);
        targetCtx.fill();

        targetCtx.font = '9px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('👾', mdx, mdy - 6);
        targetCtx.restore();
      }
    }
  }

  // 5. 🟢 플레이어 실시간 레이더 핑(Ping)
  if (player && cellMap.has(player.activeCellId)) {
    const cell = cellMap.get(player.activeCellId);
    const s = screens.find(sc => sc.label === cell.screenLabel);
    if (s) {
      const rect = cellToScreenRect(s, cell.gx, cell.gy, CONFIG);
      const px = rect.left + player.lx;
      const py = rect.top + player.ly;

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

  // 6. 하단 범례 (Legend)
  targetCtx.save();
  targetCtx.font = '10px "JetBrains Mono", monospace';
  targetCtx.fillStyle = '#94a3b8';
  targetCtx.fillText('🟢 나  |  🚪 탈출문  |  🔑 열쇠  |  👾 몬스터', 10, targetCanvas.height - 8);
  targetCtx.restore();
}
