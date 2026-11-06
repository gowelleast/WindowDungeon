import { CONFIG, computeDynamicRoomSize } from './config.js';
import { MSG } from './protocol.js';
import { cellToScreenRect, parseCellId } from './grid.js';

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

/** 미니맵을 초기화하고, 정리(dispose) 함수를 반환합니다 (런처 화면용). */
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

    channel.on(MSG.CLOSE_ROOM, (data) => {
      if (data && data.cellId) {
        cellMap.delete(data.cellId);
        updateMetrics();
        scheduleMinimapRender();
      }
    }),

    channel.on(MSG.STAGE_TRANSITION, (data) => {
      if (data && data.phase === 'complete' && data.activeCellId) {
        for (const key of Array.from(cellMap.keys())) {
          if (key !== data.activeCellId) {
            cellMap.delete(key);
          }
        }
        updateMetrics();
        scheduleMinimapRender();
      }
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
  const padBottom = 26; // 하단 범례(Legend) 영역 확보
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

  // 2. 모니터 하우징 및 모니터별 동적 방 크기 설정 사전 캐싱
  const screenLookup = new Map();
  for (const s of screens) {
    const screenSizing = computeDynamicRoomSize(s.availWidth, s.availHeight);
    screenLookup.set(s.label, {
      screen: s,
      cellCfg: {
        ...CONFIG,
        ROOM_OUTER_W: screenSizing.roomW,
        ROOM_OUTER_H: screenSizing.roomH,
        ROOM_SLOT_W: screenSizing.slotW,
        ROOM_SLOT_H: screenSizing.slotH
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
    const rect = cellToScreenRect(entry.screen, gx, gy, entry.cellCfg);
    const slotW = rect.slotWidth || rect.width;
    const slotH = rect.slotHeight || rect.height;
    return {
      rect,
      dx: offsetX + (rect.left - minX) * scale,
      dy: offsetY + (rect.top - minY) * scale,
      dw: slotW * scale,
      dh: slotH * scale,
      ratioX: slotW / (CONFIG.ROOM_OUTER_W || rect.width),
      ratioY: slotH / (CONFIG.ROOM_OUTER_H || rect.height)
    };
  };

  const currentStage = (player && player.stage) || 1;
  const hasMapItem = Boolean(player && player.hasMapItem);

  // 2.5. 고대 지도(🗺️) 소지 시 또는 Stage 2 몬스터 점령 방: 아직 안 가본 미개척 방들도 미니맵에 표시!
  if (player) {
    if (hasMapItem && Array.isArray(player.allCells)) {
      for (const ghost of player.allCells) {
        if (cellMap.has(ghost.id)) continue;
        const box = getCellCanvasBox(ghost.screenLabel, ghost.gx, ghost.gy);
        if (!box) continue;
        const { dx, dy, dw, dh } = box;

        const flagOwner = (currentStage === 2 && player.flagOwners) ? player.flagOwners[ghost.id] : null;
        const isExitGhost = (currentStage === 1 && player.exitCellId === ghost.id);
        const isKeyGhost = (currentStage === 1 && !player.hasKey && player.keyCellId === ghost.id);
        const isGoldenGhost = (currentStage === 1 && !player.goldenItemCollected && player.goldenCellId === ghost.id);
        const isCoreGhost = (currentStage === 3 && player.laserTargetCellId === ghost.id);
        const isSwordGhost = (currentStage === 4 && !player.hasLegendarySword && player.flyingSword && player.flyingSword.cellId === ghost.id);
        const isBossGhost = (currentStage === 5 && player.boss && player.boss.state !== 'barrage' && player.boss.cellId === ghost.id);

        targetCtx.save();
        if (flagOwner === 'monster' || isBossGhost) {
          targetCtx.fillStyle = 'rgba(239, 68, 68, 0.18)';
          targetCtx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        } else if (isExitGhost) {
          targetCtx.fillStyle = player.hasKey ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.18)';
          targetCtx.strokeStyle = player.hasKey ? '#facc15' : '#f87171';
        } else if (isKeyGhost || isGoldenGhost || isSwordGhost) {
          targetCtx.fillStyle = 'rgba(250, 204, 21, 0.2)';
          targetCtx.strokeStyle = '#facc15';
        } else if (isCoreGhost) {
          targetCtx.fillStyle = 'rgba(192, 132, 252, 0.2)';
          targetCtx.strokeStyle = '#c084fc';
        } else {
          targetCtx.fillStyle = 'rgba(148, 163, 184, 0.08)';
          targetCtx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
        }
        targetCtx.fillRect(dx, dy, dw, dh);
        targetCtx.lineWidth = (isExitGhost || isKeyGhost || isGoldenGhost || isCoreGhost || isSwordGhost || isBossGhost) ? 1.4 : 1;
        targetCtx.setLineDash([3, 3]);
        targetCtx.strokeRect(dx, dy, dw, dh);
        targetCtx.setLineDash([]);

        // 고대 지도로 밝혀진 미개척 방의 출입문(Doors) 표시
        if (ghost.doors) {
          const closedList = (currentStage === 4 && player.closedDoorsByCell && player.closedDoorsByCell[ghost.id]) || [];
          const notchW = dw * 0.22;
          const notchThick = 2;
          ghost.doors.forEach(dir => {
            targetCtx.fillStyle = closedList.includes(dir) ? '#ef4444' : 'rgba(56, 189, 248, 0.6)';
            if (dir === 'up') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy, notchW, notchThick);
            if (dir === 'down') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy + dh - notchThick, notchW, notchThick);
            if (dir === 'left') targetCtx.fillRect(dx, dy + dh / 2 - notchW / 2, notchThick, notchW);
            if (dir === 'right') targetCtx.fillRect(dx + dw - notchThick, dy + dh / 2 - notchW / 2, notchThick, notchW);
          });
        }

        // 고대 지도로 밝혀진 미개척 방의 주요 오브젝트 마킹 (투명도 1.0으로 선명하게 표시!)
        if (currentStage === 1) {
          targetCtx.textAlign = 'center';
          if (isExitGhost) {
            targetCtx.fillStyle = player.hasKey ? '#fde047' : '#f87171';
            targetCtx.font = 'bold 13px sans-serif';
            targetCtx.fillText(player.hasKey ? '🚪' : '🔒', dx + dw / 2, dy + dh / 2 + 5);
          } else if (isKeyGhost) {
            targetCtx.fillStyle = '#fde047';
            targetCtx.font = 'bold 12px sans-serif';
            targetCtx.fillText('🔑', dx + dw / 2, dy + dh / 2 + 4);
          } else if (isGoldenGhost) {
            targetCtx.fillStyle = '#fef08a';
            targetCtx.font = 'bold 12px sans-serif';
            targetCtx.fillText('✨', dx + dw / 2, dy + dh / 2 + 4);
          }
          targetCtx.textAlign = 'left';
        } else if (currentStage === 2 && flagOwner === 'monster') {
          targetCtx.fillStyle = '#fca5a5';
          targetCtx.font = 'bold 10px sans-serif';
          targetCtx.textAlign = 'center';
          targetCtx.fillText('🔴', dx + dw / 2, dy + dh / 2 + 3.5);
          targetCtx.textAlign = 'left';
        } else if (currentStage === 3 && isCoreGhost) {
          targetCtx.fillStyle = '#fde047';
          targetCtx.font = 'bold 12px sans-serif';
          targetCtx.textAlign = 'center';
          targetCtx.fillText('🗡️', dx + dw / 2, dy + dh / 2 + 4);
          targetCtx.textAlign = 'left';
        } else if (currentStage === 4 && isSwordGhost) {
          targetCtx.fillStyle = '#fde047';
          targetCtx.font = 'bold 12px sans-serif';
          targetCtx.textAlign = 'center';
          targetCtx.fillText('🗡️', dx + dw / 2, dy + dh / 2 + 4);
          targetCtx.textAlign = 'left';
        } else if (currentStage === 5 && isBossGhost) {
          targetCtx.font = 'bold 12px sans-serif';
          targetCtx.textAlign = 'center';
          targetCtx.fillText('👑', dx + dw / 2, dy + dh / 2 + 4);
          targetCtx.textAlign = 'left';
        }
        targetCtx.restore();
      }
    } else if (currentStage === 2 && player.flagOwners) {
      // 지도 아이템이 없더라도 Stage 2에서 몬스터가 점령한 미개척 방은 붉은 점선 영역으로 표시
      for (const [fCellId, owner] of Object.entries(player.flagOwners)) {
        if (owner !== 'monster' || cellMap.has(fCellId)) continue;
        const parsed = parseCellId(fCellId);
        if (!parsed) continue;
        const box = getCellCanvasBox(parsed.screenLabel, parsed.gx, parsed.gy);
        if (!box) continue;
        const { dx, dy, dw, dh } = box;

        targetCtx.save();
        targetCtx.fillStyle = 'rgba(239, 68, 68, 0.16)';
        targetCtx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([3, 3]);
        targetCtx.fillRect(dx, dy, dw, dh);
        targetCtx.strokeRect(dx, dy, dw, dh);
        targetCtx.setLineDash([]);
        targetCtx.fillStyle = '#fca5a5';
        targetCtx.font = 'bold 10px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('🔴', dx + dw / 2, dy + dh / 2 + 3.5);
        targetCtx.restore();
      }
    } else if (currentStage === 4 && !player.hasLegendarySword && player.flyingSword && player.flyingSword.cellId && !cellMap.has(player.flyingSword.cellId)) {
      // 지도 아이템이 없더라도 Stage 4에서 떠돌이 성검이 날아간 미개척 방은 황금 점선으로 표시
      const parsed = parseCellId(player.flyingSword.cellId);
      if (parsed) {
        const box = getCellCanvasBox(parsed.screenLabel, parsed.gx, parsed.gy);
        if (box) {
          const { dx, dy, dw, dh } = box;
          targetCtx.save();
          targetCtx.fillStyle = 'rgba(250, 204, 21, 0.18)';
          targetCtx.strokeStyle = '#facc15';
          targetCtx.lineWidth = 1.4;
          targetCtx.setLineDash([3, 3]);
          targetCtx.fillRect(dx, dy, dw, dh);
          targetCtx.strokeRect(dx, dy, dw, dh);
          targetCtx.setLineDash([]);
          targetCtx.fillStyle = '#fde047';
          targetCtx.font = 'bold 12px sans-serif';
          targetCtx.textAlign = 'center';
          targetCtx.fillText('🗡️', dx + dw / 2, dy + dh / 2 + 4);
          targetCtx.restore();
        }
      }
    }
  }

  // 3. 개척된 방(Cell) 및 출입문(Doors) 그리기
  for (const cell of cellMap.values()) {
    const box = getCellCanvasBox(cell.screenLabel, cell.gx, cell.gy);
    if (!box) continue;
    const { dx, dy, dw, dh } = box;

    if (currentStage === 2) {
      const owner = (player && player.flagOwners && player.flagOwners[cell.id]) || 'neutral';
      if (owner === 'player') {
        targetCtx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        targetCtx.strokeStyle = '#38bdf8';
      } else if (owner === 'monster') {
        targetCtx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        targetCtx.strokeStyle = '#ef4444';
      } else {
        targetCtx.fillStyle = 'rgba(148, 163, 184, 0.14)';
        targetCtx.strokeStyle = '#94a3b8';
      }
    } else if (currentStage === 1 && player && player.goldenCellId === cell.id) {
      targetCtx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      targetCtx.strokeStyle = '#eab308';
    } else {
      targetCtx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      targetCtx.strokeStyle = '#10b981';
    }

    targetCtx.fillRect(dx, dy, dw, dh);
    targetCtx.lineWidth = 1.2;
    targetCtx.strokeRect(dx, dy, dw, dh);

    if (cell.doors) {
      const closedList = (currentStage === 4 && player && player.closedDoorsByCell && player.closedDoorsByCell[cell.id]) || [];
      const notchW = dw * 0.22;
      const notchThick = 2.4;
      cell.doors.forEach(dir => {
        targetCtx.fillStyle = closedList.includes(dir) ? '#ef4444' : '#38bdf8';
        if (dir === 'up') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy, notchW, notchThick);
        if (dir === 'down') targetCtx.fillRect(dx + dw / 2 - notchW / 2, dy + dh - notchThick, notchW, notchThick);
        if (dir === 'left') targetCtx.fillRect(dx, dy + dh / 2 - notchW / 2, notchThick, notchW);
        if (dir === 'right') targetCtx.fillRect(dx + dw - notchThick, dy + dh / 2 - notchW / 2, notchThick, notchW);
      });
    }

    if (currentStage === 1) {
      // 🚪 발견된 탈출문 아이콘 마킹
      if (player && (player.exitDiscovered || hasMapItem) && player.exitCellId === cell.id) {
        targetCtx.fillStyle = player.hasKey ? '#eab308' : '#ef4444';
        targetCtx.font = 'bold 13px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText(player.hasKey ? '🚪' : '🔒', dx + dw / 2, dy + dh / 2 + 5);
        targetCtx.textAlign = 'left';
      }

      // 🔑 발견된 황금 열쇠 아이콘 마킹
      if (player && (player.keyDiscovered || hasMapItem) && !player.hasKey && player.keyCellId === cell.id) {
        targetCtx.fillStyle = '#facc15';
        targetCtx.font = 'bold 12px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('🔑', dx + dw / 2, dy + dh / 2 + 4);
        targetCtx.textAlign = 'left';
      }

      // ✨ 황금방 아이콘 마킹 (아직 획득 전일 때)
      if (player && (player.goldenDiscovered || hasMapItem) && !player.goldenItemCollected && player.goldenCellId === cell.id) {
        targetCtx.fillStyle = '#fef08a';
        targetCtx.font = 'bold 12px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('✨', dx + dw / 2, dy + dh / 2 + 4);
        targetCtx.textAlign = 'left';
      }
    } else if (currentStage === 2) {
      const owner = (player && player.flagOwners && player.flagOwners[cell.id]) || 'neutral';
      const flagEmoji = owner === 'player' ? '💠' : owner === 'monster' ? '🔴' : '🪨';
      targetCtx.fillStyle = '#ffffff';
      targetCtx.font = 'bold 11px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.fillText(flagEmoji, dx + dw / 2, dy + dh / 2 + 4);
      targetCtx.textAlign = 'left';
    } else if (currentStage === 3 && player) {
      const seg = Array.isArray(player.laserSegments)
        ? player.laserSegments.find(st => st.cellId === cell.id)
        : null;

      // 미니맵에서도 현재 방을 관통하는 레이저 광선 표시
      if (seg) {
        const cx = dx + dw / 2;
        const cy = dy + dh / 2;
        const getEdge = (dir) => {
          if (dir === 'up') return { x: cx, y: dy };
          if (dir === 'down') return { x: cx, y: dy + dh };
          if (dir === 'left') return { x: dx, y: cy };
          return { x: dx + dw, y: cy };
        };
        targetCtx.save();
        targetCtx.strokeStyle = player.laserConnected ? '#facc15' : '#38bdf8';
        targetCtx.lineWidth = 2;
        if (seg.inDir) {
          const pIn = getEdge(seg.inDir);
          targetCtx.beginPath();
          targetCtx.moveTo(pIn.x, pIn.y);
          targetCtx.lineTo(cx, cy);
          targetCtx.stroke();
        }
        if (seg.outDir && seg.outDir !== seg.inDir) {
          const pOut = getEdge(seg.outDir);
          targetCtx.beginPath();
          targetCtx.moveTo(cx, cy);
          targetCtx.lineTo(pOut.x, pOut.y);
          targetCtx.stroke();
        }
        targetCtx.restore();
      }

      const isSource = player.laserSourceCellId === cell.id;
      const isTarget = player.laserTargetCellId === cell.id;
      const icon = isTarget
        ? (player.laserConnected ? '✨' : '🗡️')
        : isSource
        ? '⚡'
        : '💎';
      targetCtx.fillStyle = '#ffffff';
      targetCtx.font = 'bold 11px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.fillText(icon, dx + dw / 2, dy + dh / 2 + 4);
      targetCtx.textAlign = 'left';
    } else if (currentStage === 4 && player) {
      if (!player.hasLegendarySword && player.flyingSword && player.flyingSword.cellId === cell.id) {
        const isStunned = player.flyingSword.state === 'groggy' || player.flyingSword.state === 'trapped';
        targetCtx.fillStyle = '#fde047';
        targetCtx.font = 'bold 12px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText(isStunned ? '💫' : '🗡️', dx + dw / 2, dy + dh / 2 + 4);
        targetCtx.textAlign = 'left';
      }
    } else if (currentStage === 5 && player) {
      const b = player.boss;
      if (b && b.state === 'barrage' && b.barrageCellId === cell.id) {
        targetCtx.save();
        targetCtx.fillStyle = 'rgba(244, 63, 94, 0.28)';
        targetCtx.strokeStyle = '#f43f5e';
        targetCtx.lineWidth = 2;
        targetCtx.fillRect(dx, dy, dw, dh);
        targetCtx.strokeRect(dx, dy, dw, dh);
        targetCtx.font = 'bold 11px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('🔥', dx + dw / 2, dy + dh / 2 + 4);
        targetCtx.restore();
      } else if (b && b.state !== 'barrage' && b.cellId === cell.id && (hasMapItem || player.activeCellId === cell.id)) {
        targetCtx.font = 'bold 12px sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText('👑', dx + dw / 2, dy + dh / 2 + 4);
        targetCtx.textAlign = 'left';
      }
    }
  }

  // 4. 👾 백그라운드 순찰 몬스터 레이더 핀포인트 (기본은 비표시, '고대 지도 🗺️' 획득 시에만 실시간 노출!)
  if (player && hasMapItem && player.monster && player.monster.cellId) {
    const m = player.monster;
    const parsedMonster = parseCellId(m.cellId);
    if (parsedMonster) {
      const box = getCellCanvasBox(parsedMonster.screenLabel, parsedMonster.gx, parsedMonster.gy);
      if (box) {
        const mx = box.rect.left + m.lx * box.ratioX;
        const my = box.rect.top + m.ly * box.ratioY;

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

  // 6. 하단 범례 (Legend)
  targetCtx.save();
  targetCtx.font = '10px "JetBrains Mono", monospace';
  targetCtx.fillStyle = '#94a3b8';
  if (currentStage === 5 && player) {
    const bHp = (player.boss && player.boss.hp) ?? 3;
    targetCtx.fillText(`STAGE 5  |  👑 보스(❤️x${bHp})  |  🔥 탄막 회피  |  ⚔️ [Space] 공격`, 10, canvasH - 8);
  } else if (currentStage === 4 && player) {
    targetCtx.fillText('STAGE 4  |  🗡️ 성검  |  🔒 문 앞 [Space] 문 여닫기', 10, canvasH - 8);
  } else if (currentStage === 3) {
    targetCtx.fillText('STAGE 3  |  ⚡ 발사대  |  💎 오팔(Space 회전)  |  🗡️ 성검', 10, canvasH - 8);
  } else if (currentStage === 2 && player) {
    const pScore = player.playerScore ?? 0;
    const mScore = player.monsterScore ?? 0;
    const tLeft = player.isOvertime ? 'OVERTIME' : `${player.stage2TimeLeft ?? 0}s`;
    targetCtx.fillText(`STAGE 2  |  💠 내 룬스톤: ${pScore}  |  🔴 적 룬스톤: ${mScore}  |  ⏱️ ${tLeft}`, 10, canvasH - 8);
  } else {
    targetCtx.fillText('STAGE 1  |  🟢 나  |  🚪 탈출문  |  🔑 열쇠  |  ✨ 황금방  |  👾 몬스터', 10, canvasH - 8);
  }
  targetCtx.restore();
}
