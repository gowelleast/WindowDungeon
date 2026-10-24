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

// Document Picture-in-Picture 상태
let pipWindow = null;
let isPipExpanded = false; // 기본값: 축소(아이콘/뱃지) 모드로 시작하여 M 입력 시 즉시 확장
let mKeyPressed = false;

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
  isPipExpanded = false;
  
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

    // 모든 방에서 발생하는 키 입력을 통해 M / ㅡ 키 토글 감지
    channel.on(MSG.INPUT, (data) => {
      const hasM = data.keys && data.keys.some(k => k.toLowerCase() === 'm' || k === 'ㅡ' || k.toLowerCase() === 'keym');
      if (hasM && !mKeyPressed) {
        mKeyPressed = true;
        togglePipMode();
      } else if (!hasM) {
        mKeyPressed = false;
      }
    }),
  ];

  // 런처 화면 내에서 직접 M / ㅡ 키 입력 시에도 토글
  const onLauncherKey = (e) => {
    const isM = e.code === 'KeyM' || e.key.toLowerCase() === 'm' || e.key === 'ㅡ';
    if (isM && !e.repeat) {
      e.preventDefault();
      togglePipMode();
    }
  };
  window.addEventListener('keydown', onLauncherKey);
  unsubscribers.push(() => window.removeEventListener('keydown', onLauncherKey));

  // PiP 수동 버튼 바인딩
  const btnPip = document.getElementById('btn-pip');
  if (btnPip) {
    const onPipClick = () => togglePipWindow();
    btnPip.addEventListener('click', onPipClick);
    unsubscribers.push(() => btnPip.removeEventListener('click', onPipClick));
  }

  return () => {
    unsubscribers.forEach((off) => off());
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      pipWindow = null;
    }
  };
}

/** 외부(런처 시작 클릭 핸들러 등)에서 PiP 창을 기본으로 열기 위한 함수 */
export async function openPipMinimap() {
  if (!('documentPictureInPicture' in window)) return;
  if (pipWindow && !pipWindow.closed) return;
  await togglePipWindow(true);
}

/** Document Picture-in-Picture 윈도우 생성/해제 토글 */
async function togglePipWindow(forceOpen = false) {
  if (!('documentPictureInPicture' in window)) {
    if (!forceOpen) {
      alert('현재 브라우저에서는 Document Picture-in-Picture API를 지원하지 않습니다.\n최신 Chromium 브라우저(Chrome/Edge 111 이상)에서 사용 가능합니다.');
    }
    return;
  }

  // 이미 열려 있으면 닫기 (forceOpen이 아닐 때만)
  if (pipWindow && !pipWindow.closed) {
    if (!forceOpen) pipWindow.close();
    return;
  }

  try {
    // 초기 생성 시 방해되지 않는 컴팩트한 축소 뱃지 크기 (250x68)로 시작
    isPipExpanded = false;
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 250,
      height: 68,
    });

    const btnPip = document.getElementById('btn-pip');
    if (btnPip) {
      btnPip.classList.add('active');
      btnPip.innerHTML = '📌 PiP 활성화됨 (M)';
    }

    // 부모 창의 스타일시트 복사
    copyStylesheetsToPip(pipWindow);

    // PiP 윈도우 DOM 렌더링
    pipWindow.document.body.className = 'pip-body';
    renderPipDOM();

    // 윈도우 종료 시 원래 런처 위치로 캔버스 복원
    pipWindow.addEventListener('pagehide', () => {
      restoreCanvasToLauncher();
      pipWindow = null;
      isPipExpanded = false;
      if (btnPip) {
        btnPip.classList.remove('active');
        btnPip.innerHTML = '📌 Always-on-Top (PiP)';
      }
    });

    // PiP 윈도우 포커스 상태에서의 M / ㅡ 키 감지
    pipWindow.addEventListener('keydown', (e) => {
      const isM = e.code === 'KeyM' || e.key.toLowerCase() === 'm' || e.key === 'ㅡ';
      if (isM && !e.repeat) {
        e.preventDefault();
        togglePipMode();
      }
    });

  } catch (err) {
    console.warn('[Minimap] Document PiP 열기 실패/취소:', err);
  }
}

/** PiP 내부 DOM 구조 렌더링 */
function renderPipDOM() {
  if (!pipWindow || pipWindow.closed) return;

  pipWindow.document.body.innerHTML = `
    <div class="pip-wrapper">
      <!-- 1. 축소 모드: 방해되지 않는 작은 플로팅 배지 -->
      <div id="pip-collapsed-view" class="pip-collapsed-view" style="${isPipExpanded ? 'display:none;' : 'display:flex;'}">
        <span class="pip-icon-large">🗺️</span>
        <span id="pip-badge-text" class="pip-collapsed-label">미니맵 <span class="pip-kbd">M</span></span>
      </div>

      <!-- 2. 확장 모드: 실시간 전술 레이더 캔버스 -->
      <div id="pip-expanded-view" class="pip-expanded-view" style="${isPipExpanded ? 'display:flex;' : 'display:none;'}">
        <div id="pip-topbar" class="pip-topbar">
          <span class="pip-topbar-title">🗺️ 공간 미니맵</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <button id="btn-pip-size-toggle" class="btn-pip" style="padding: 1px 6px; font-size: 10px;">${isPipExpanded ? '⤡ 축소' : '⤢ 확대'}</button>
            <span class="pip-kbd">M</span>
          </div>
        </div>
        <div id="pip-canvas-area" class="pip-canvas-area"></div>
        <div id="pip-bottom-metrics" class="pip-bottom-metrics">
          <span>방: ${cellMap.size}개 | RTT: ${pingRtt}ms</span>
          <span>Msg: ${msgRate}/s</span>
        </div>
      </div>
    </div>
  `;

  // 축소 뷰 클릭 시 펼침 및 크기 확장
  const collapsedEl = pipWindow.document.getElementById('pip-collapsed-view');
  if (collapsedEl) {
    collapsedEl.addEventListener('click', () => {
      togglePipMode(true);
      try { pipWindow.resizeTo(280, 200); } catch(e) {}
    });
  }

  // 상단 바 클릭 시 접기
  const topbarEl = pipWindow.document.getElementById('pip-topbar');
  if (topbarEl) {
    topbarEl.addEventListener('click', (e) => {
      if (e.target.id !== 'btn-pip-size-toggle') {
        togglePipMode(false);
      }
    });
  }

  // PiP 창 내부 크기 조절 버튼 클릭 (유저 제스처가 유효하므로 resizeTo 정상 작동)
  const btnSizeToggle = pipWindow.document.getElementById('btn-pip-size-toggle');
  if (btnSizeToggle) {
    btnSizeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        if (isPipExpanded) {
          pipWindow.resizeTo(250, 68);
          togglePipMode(false);
        } else {
          pipWindow.resizeTo(280, 200);
          togglePipMode(true);
        }
      } catch (err) {}
    });
  }

  syncCanvasLocation();
}

/** PiP 창의 표시 모드(레이더 캔버스 ↔ 미니 뱃지) 토글 */
function togglePipMode(forceState = null) {
  if (!pipWindow || pipWindow.closed) return;

  isPipExpanded = (forceState !== null) ? forceState : !isPipExpanded;

  // 브라우저가 지원하는 경우 창 크기 변경 시도
  try {
    if (isPipExpanded) {
      pipWindow.resizeTo(280, 200);
    } else {
      pipWindow.resizeTo(250, 68);
    }
  } catch (e) {}

  const collapsedEl = pipWindow.document.getElementById('pip-collapsed-view');
  const expandedEl = pipWindow.document.getElementById('pip-expanded-view');
  const btnSizeToggle = pipWindow.document.getElementById('btn-pip-size-toggle');

  if (collapsedEl && expandedEl) {
    collapsedEl.style.display = isPipExpanded ? 'none' : 'flex';
    expandedEl.style.display = isPipExpanded ? 'flex' : 'none';
  }
  if (btnSizeToggle) {
    btnSizeToggle.textContent = isPipExpanded ? '⤡ 축소' : '⤢ 확대';
  }

  syncCanvasLocation();
}

/** 캔버스를 현재 상태에 맞게 PiP 창 또는 런처로 이동 */
function syncCanvasLocation() {
  if (!canvas) {
    canvas = document.getElementById('minimap-canvas');
    if (canvas && !ctx) ctx = canvas.getContext('2d');
  }
  if (!canvas) return;

  if (pipWindow && !pipWindow.closed) {
    if (isPipExpanded) {
      const area = pipWindow.document.getElementById('pip-canvas-area');
      if (area && !area.contains(canvas)) {
        area.appendChild(canvas);
      }
    } else {
      restoreCanvasToLauncher();
    }
  } else {
    restoreCanvasToLauncher();
  }

  requestAnimationFrame(drawMinimap);
}

/** 캔버스를 원래 런처 대시보드 위치로 복원 */
function restoreCanvasToLauncher() {
  const container = document.getElementById('minimap-container');
  if (container && canvas && !container.contains(canvas)) {
    container.appendChild(canvas);
  }
}

/** 부모 창의 스타일시트를 PiP 윈도우에 전달 */
function copyStylesheetsToPip(targetPipWindow) {
  [...document.styleSheets].forEach((styleSheet) => {
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

function updateMetrics() {
  const connectedRooms = cellMap.size;

  // 1. 런처 화면 지표 갱신
  const el = document.getElementById('sync-metrics');
  if (el) {
    el.innerHTML = `<span>📡 <strong>개척된 방:</strong> ${connectedRooms}개</span> &nbsp;|&nbsp; <span>⚡ <strong>RTT:</strong> ${pingRtt}ms</span> &nbsp;|&nbsp; <span>📊 <strong>Msg/sec:</strong> ${msgRate}</span>`;
  }

  // 2. PiP 윈도우 활성화 시 지표 갱신
  if (pipWindow && !pipWindow.closed) {
    const pipBadgeText = pipWindow.document.getElementById('pip-badge-text');
    if (pipBadgeText) {
      pipBadgeText.innerHTML = `미니맵 (${connectedRooms}개) <span class="pip-kbd">M</span>`;
    }
    const pipBottomMetrics = pipWindow.document.getElementById('pip-bottom-metrics');
    if (pipBottomMetrics) {
      pipBottomMetrics.innerHTML = `<span>방: ${connectedRooms}개 | RTT: ${pingRtt}ms</span><span>Msg: ${msgRate}/s</span>`;
    }
  }
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
