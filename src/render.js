import { CONFIG } from './config.js';

const WALL = 20;
const DOOR_W = 80;

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
function getDim(ctx) {
  const canvas = ctx && ctx.canvas;
  const W = (canvas && canvas.__logicalW) || (canvas ? canvas.width : CONFIG.ROOM_OUTER_W);
  const H = (canvas && canvas.__logicalH) || (canvas ? canvas.height : CONFIG.ROOM_OUTER_H);
  return { W, H, CX: W / 2, CY: H / 2 };
}

function getTorches(W, H) {
  return [
    { x: 100, y: WALL },
    { x: W - 100, y: WALL },
    { x: 100, y: H - WALL },
    { x: W - 100, y: H - WALL }
  ];
}

// 바닥 석재 타일 캐시용 패턴 (스테이지 테마별 오프스크린 캔버스 생성)
const floorPatternCache = new Map();
function getFloorPattern(ctx, theme = 'default') {
  if (floorPatternCache.has(theme)) return floorPatternCache.get(theme);
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 40;
  pCanvas.height = 40;
  const pCtx = pCanvas.getContext('2d');

  if (theme === 'stage4-bright') {
    // Stage 4 (성검 부활 직후): 모든 스테이지 중 가장 밝고 성스러운 황금빛/백색 성소 타일
    pCtx.fillStyle = '#333b4d';
    pCtx.fillRect(0, 0, 40, 40);

    pCtx.strokeStyle = '#232938';
    pCtx.lineWidth = 1.6;
    pCtx.strokeRect(0, 0, 40, 40);

    pCtx.fillStyle = 'rgba(254, 240, 138, 0.16)';
    pCtx.fillRect(2, 2, 36, 1.5);
    pCtx.fillRect(2, 2, 1.5, 36);

    pCtx.fillStyle = 'rgba(15, 23, 42, 0.32)';
    pCtx.fillRect(2, 37, 36, 1);
    pCtx.fillRect(37, 2, 1, 36);

    pCtx.fillStyle = 'rgba(254, 249, 195, 0.08)';
    pCtx.fillRect(7, 9, 15, 13);
    pCtx.fillRect(24, 22, 11, 9);
  } else if (theme === 'stage3-dark') {
    // Stage 3 (빛과 어둠의 대비): 칠흑같이 깊고 어두운 흑요석 타일
    pCtx.fillStyle = '#0b0d12';
    pCtx.fillRect(0, 0, 40, 40);

    pCtx.strokeStyle = '#050609';
    pCtx.lineWidth = 2;
    pCtx.strokeRect(0, 0, 40, 40);

    pCtx.fillStyle = 'rgba(148, 163, 184, 0.025)';
    pCtx.fillRect(2, 2, 36, 1);
    pCtx.fillRect(2, 2, 1, 36);

    pCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    pCtx.fillRect(2, 37, 36, 1);
    pCtx.fillRect(37, 2, 1, 36);
  } else if (theme === 'stage2-tactical') {
    // Stage 2 (영역 점령전): Stage 1과 미묘하게 다른 청회색 전술 석판 타일 & 미세 대각선 결
    pCtx.fillStyle = '#161b24';
    pCtx.fillRect(0, 0, 40, 40);

    pCtx.strokeStyle = '#0b0e14';
    pCtx.lineWidth = 2;
    pCtx.strokeRect(0, 0, 40, 40);

    pCtx.fillStyle = 'rgba(148, 163, 184, 0.055)';
    pCtx.fillRect(2, 2, 36, 1);
    pCtx.fillRect(2, 2, 1, 36);

    pCtx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    pCtx.lineWidth = 1;
    pCtx.beginPath();
    pCtx.moveTo(6, 34);
    pCtx.lineTo(34, 6);
    pCtx.stroke();

    pCtx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    pCtx.fillRect(9, 9, 12, 12);
    pCtx.fillRect(23, 23, 9, 9);
  } else {
    // Stage 1 & Stage 5 (클래식 던전 타일)
    pCtx.fillStyle = '#14171d';
    pCtx.fillRect(0, 0, 40, 40);

    pCtx.strokeStyle = '#090b0e';
    pCtx.lineWidth = 2;
    pCtx.strokeRect(0, 0, 40, 40);

    pCtx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    pCtx.fillRect(2, 2, 36, 1);
    pCtx.fillRect(2, 2, 1, 36);

    pCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    pCtx.fillRect(2, 37, 36, 1);
    pCtx.fillRect(37, 2, 1, 36);

    pCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    pCtx.fillRect(8, 10, 14, 12);
    pCtx.fillRect(24, 22, 10, 8);
  }

  const pat = ctx.createPattern(pCanvas, 'repeat');
  floorPatternCache.set(theme, pat);
  return pat;
}

// 정적 방 배경(바닥 타일 + 비네팅 + 석벽) 스테이지 테마별 오프스크린 캐시
const cachedRoomMap = new Map();

function getStaticRoomCanvas(W, H, theme = 'default') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const key = `${W}x${H}@${dpr}:${theme}`;
  if (cachedRoomMap.has(key)) {
    return cachedRoomMap.get(key);
  }

  const offCanvas = document.createElement('canvas');
  offCanvas.width = Math.round(W * dpr);
  offCanvas.height = Math.round(H * dpr);
  offCanvas.__logicalW = W;
  offCanvas.__logicalH = H;

  const offCtx = offCanvas.getContext('2d');
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const CX = W / 2;
  const CY = H / 2;

  // 1. 바닥 타일 렌더링
  offCtx.fillStyle = getFloorPattern(offCtx, theme);
  offCtx.fillRect(0, 0, W, H);

  // 1.5. Stage 2 전용: 바닥 석판에 은은하게 새겨진 전술 구역 라인 & 코너 브래킷 디테일
  if (theme === 'stage2-tactical') {
    offCtx.save();
    const pad = WALL + 16;
    offCtx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    offCtx.lineWidth = 1;
    offCtx.setLineDash([8, 6]);
    offCtx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    offCtx.setLineDash([]);

    // 중앙 십자 컴퍼스 가이드라인
    offCtx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    offCtx.beginPath();
    offCtx.moveTo(CX, pad + 6);
    offCtx.lineTo(CX, H - pad - 6);
    offCtx.moveTo(pad + 6, CY);
    offCtx.lineTo(W - pad - 6, CY);
    offCtx.stroke();

    // 네 모서리 각인 마크
    const cLen = 12;
    offCtx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    offCtx.lineWidth = 1.5;
    const bCorners = [
      [pad - 3, pad - 3, 1, 1],
      [W - pad + 3, pad - 3, -1, 1],
      [pad - 3, H - pad + 3, 1, -1],
      [W - pad + 3, H - pad + 3, -1, -1]
    ];
    for (const [bx, by, sx, sy] of bCorners) {
      offCtx.beginPath();
      offCtx.moveTo(bx + sx * cLen, by);
      offCtx.lineTo(bx, by);
      offCtx.lineTo(bx, by + sy * cLen);
      offCtx.stroke();
    }
    offCtx.restore();
  }

  // 2. 바닥 비네팅 (Stage 4 밝은 성소 테마일 때는 어두운 비네팅 대신 따스한 황금빛 성소 광채 적용!)
  if (theme === 'stage4-bright') {
    const sanctGrad = offCtx.createRadialGradient(CX, CY, 16, CX, CY, Math.max(W, H) * 0.72);
    sanctGrad.addColorStop(0, 'rgba(254, 249, 195, 0.28)');
    sanctGrad.addColorStop(0.55, 'rgba(253, 224, 71, 0.12)');
    sanctGrad.addColorStop(1, 'rgba(15, 23, 42, 0.18)');
    offCtx.fillStyle = sanctGrad;
    offCtx.fillRect(0, 0, W, H);
  } else if (theme === 'stage3-dark') {
    const darkVignette = offCtx.createRadialGradient(CX, CY, 40, CX, CY, Math.max(W, H) / 1.35);
    darkVignette.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
    darkVignette.addColorStop(1, 'rgba(2, 4, 8, 0.86)');
    offCtx.fillStyle = darkVignette;
    offCtx.fillRect(0, 0, W, H);
  } else {
    const floorVignette = offCtx.createRadialGradient(CX, CY, 60, CX, CY, Math.max(W, H) / 1.5);
    floorVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    floorVignette.addColorStop(1, 'rgba(4, 6, 9, 0.7)');
    offCtx.fillStyle = floorVignette;
    offCtx.fillRect(0, 0, W, H);
  }

  // 3. 3D 입체 석벽
  drawWalls(offCtx, theme);

  cachedRoomMap.set(key, offCanvas);
  return offCanvas;
}

/**
 * 방(Floor, Walls, Doors, Torches) 렌더링
 */
export function drawRoom(ctx, roomData, activePrompt = null, options = {}) {
  const { W, H, CX, CY } = getDim(ctx);
  const now = Date.now();
  const stage = options.stage || 1;

  // 스테이지별 정적 방 테마 결정
  let theme = 'default';
  if (stage === 2) {
    theme = 'stage2-tactical';
  } else if (stage === 3) {
    theme = 'stage3-dark';
  } else if (stage === 4) {
    theme = (options.hasLegendarySword && (options.swordAwakenProgress || 0) > 0) ? 'default' : 'stage4-bright';
  }

  // 1~3. 정적 바닥 및 석벽 레이어 (오프스크린 캐시 Blit)
  const staticRoom = getStaticRoomCanvas(W, H, theme);
  ctx.drawImage(staticRoom, 0, 0, W, H);

  // Stage 4에서 다른 방들이 닫힌 뒤 성검으로 빛이 모이는 순간(hasLegendarySword && swordAwakenProgress > 0 && swordAwakenProgress < 1):
  // 밝았던 성소 배경이 성검 속으로 빨려 들어가며 어두운 던전으로 전환되는 크로스페이드 연출!
  if (stage === 4 && options.hasLegendarySword && (options.swordAwakenProgress || 0) > 0 && (options.swordAwakenProgress || 0) < 1) {
    const remainBright = Math.max(0, 1 - (options.swordAwakenProgress || 0) * 1.15);
    if (remainBright > 0.01) {
      ctx.save();
      ctx.globalAlpha = remainBright;
      const brightRoom = getStaticRoomCanvas(W, H, 'stage4-bright');
      ctx.drawImage(brightRoom, 0, 0, W, H);
      ctx.restore();
    }
  }

  // 3.5. 특수 방 바닥 아우라 연출 (Stage 1 황금방 or Stage 2 점령 영토)
  if (options.isGoldenRoom) {
    ctx.save();
    const goldGrad = ctx.createRadialGradient(CX, CY, 16, CX, CY, Math.min(W, H) * 0.46);
    goldGrad.addColorStop(0, 'rgba(250, 204, 21, 0.22)');
    goldGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.09)');
    goldGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);
    ctx.restore();
  } else if (options.flagOwner === 'player') {
    ctx.save();
    const pGrad = ctx.createRadialGradient(CX, CY, 16, CX, CY, Math.min(W, H) * 0.48);
    pGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    pGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.09)');
    pGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);
    ctx.restore();
  } else if (options.flagOwner === 'monster') {
    ctx.save();
    const mGrad = ctx.createRadialGradient(CX, CY, 16, CX, CY, Math.min(W, H) * 0.48);
    mGrad.addColorStop(0, 'rgba(127, 29, 29, 0.34)');
    mGrad.addColorStop(0.6, 'rgba(69, 10, 10, 0.22)');
    mGrad.addColorStop(1, 'rgba(15, 23, 42, 0.28)');
    ctx.fillStyle = mGrad;
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

    ctx.strokeStyle = 'rgba(220, 38, 38, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);
    ctx.restore();
  } else if (options.hasLaserBeam) {
    // Stage 3: 칠흑 같은 어둠 속에서 레이저가 지나는 방이 눈부시게 밝아지는 조명 효과!
    ctx.save();
    const beamColor = options.isLaserConnected ? '250, 204, 21' : '56, 189, 248';
    const lGrad = ctx.createRadialGradient(CX, CY, 14, CX, CY, Math.min(W, H) * 0.55);
    lGrad.addColorStop(0, `rgba(${beamColor}, 0.34)`);
    lGrad.addColorStop(0.55, `rgba(${beamColor}, 0.14)`);
    lGrad.addColorStop(1, `rgba(${beamColor}, 0)`);
    ctx.fillStyle = lGrad;
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

    ctx.strokeStyle = `rgba(${beamColor}, 0.55)`;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);
    ctx.restore();
  } else if (options.hasForgeAura) {
    ctx.save();
    const fGrad = ctx.createRadialGradient(CX, CY, 18, CX, CY, Math.min(W, H) * 0.46);
    fGrad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
    fGrad.addColorStop(0.6, 'rgba(234, 88, 12, 0.08)');
    fGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = fGrad;
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

    ctx.strokeStyle = 'rgba(251, 146, 60, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);
    ctx.restore();
  }

  // 4. 문(Doors) 렌더링
  if (roomData && roomData.doors) {
    roomData.doors.forEach(dir => {
      const isTarget = activePrompt && activePrompt.dir === dir && !activePrompt.clear;
      drawDoor(ctx, dir, isTarget, now);
    });
  }

  // 5. 벽면 횃불
  getTorches(W, H).forEach(pos => {
    drawTorch(ctx, pos.x, pos.y, now);
  });
}

function drawWalls(ctx, theme = 'default') {
  const { W, H } = getDim(ctx);
  const isBright = theme === 'stage4-bright';

  ctx.fillStyle = isBright ? '#384152' : '#212631';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);

  ctx.strokeStyle = isBright ? '#242b38' : '#13161c';
  ctx.lineWidth = 1.5;
  const blockSize = 40;
  ctx.beginPath();
  for (let x = WALL; x < W - WALL; x += blockSize) {
    ctx.moveTo(x, 0); ctx.lineTo(x, WALL);
    ctx.moveTo(x, H - WALL); ctx.lineTo(x, H);
  }
  for (let y = WALL; y < H - WALL; y += blockSize) {
    ctx.moveTo(0, y); ctx.lineTo(WALL, y);
    ctx.moveTo(W - WALL, y); ctx.lineTo(W, y);
  }
  ctx.stroke();

  ctx.strokeStyle = isBright ? '#eab308' : '#394150';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(WALL, WALL, W - WALL * 2, 6);
  ctx.fillRect(WALL, WALL, 6, H - WALL * 2);

  // 코너 석조 기둥 마감
  const corners = [
    [0, 0],
    [W - WALL, 0],
    [0, H - WALL],
    [W - WALL, H - WALL]
  ];
  ctx.fillStyle = '#2a3140';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx + 2, cy + 2, WALL - 4, WALL - 4);
    ctx.strokeRect(cx + 2, cy + 2, WALL - 4, WALL - 4);
  }
}

function drawDoor(ctx, dir, isTarget, now) {
  const { W, H, CX, CY } = getDim(ctx);
  ctx.save();

  let x = 0, y = 0, w = 0, h = 0;
  if (dir === 'up') {
    x = CX - DOOR_W / 2; y = 0; w = DOOR_W; h = WALL + 4;
  } else if (dir === 'down') {
    x = CX - DOOR_W / 2; y = H - WALL - 4; w = DOOR_W; h = WALL + 4;
  } else if (dir === 'left') {
    x = 0; y = CY - DOOR_W / 2; w = WALL + 4; h = DOOR_W;
  } else if (dir === 'right') {
    x = W - WALL - 4; y = CY - DOOR_W / 2; w = WALL + 4; h = DOOR_W;
  }

  ctx.fillStyle = '#05070c';
  ctx.fillRect(x, y, w, h);

  const pulse = Math.sin(now / 180) * 0.3 + 0.7;
  const colorRune = isTarget ? `rgba(56, 189, 248, ${pulse})` : 'rgba(56, 189, 248, 0.4)';
  const glowBlur = isTarget ? 15 : 6;

  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = glowBlur;
  ctx.strokeStyle = colorRune;
  ctx.lineWidth = isTarget ? 3.5 : 2;

  ctx.beginPath();
  if (dir === 'up') {
    ctx.moveTo(x, WALL); ctx.lineTo(x + w, WALL);
  } else if (dir === 'down') {
    ctx.moveTo(x, H - WALL); ctx.lineTo(x + w, H - WALL);
  } else if (dir === 'left') {
    ctx.moveTo(WALL, y); ctx.lineTo(WALL, y + h);
  } else if (dir === 'right') {
    ctx.moveTo(W - WALL, y); ctx.lineTo(W - WALL, y + h);
  }
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#475569';
  if (dir === 'up' || dir === 'down') {
    ctx.fillRect(x - 4, y, 4, h);
    ctx.fillRect(x + w, y, 4, h);
  } else {
    ctx.fillRect(x, y - 4, w, 4);
    ctx.fillRect(x, y + h, w, 4);
  }

  if (isTarget) {
    const energyGradient = (dir === 'up') ? ctx.createLinearGradient(CX, WALL, CX, WALL + 35) :
      (dir === 'down') ? ctx.createLinearGradient(CX, H - WALL, CX, H - WALL - 35) :
      (dir === 'left') ? ctx.createLinearGradient(WALL, CY, WALL + 35, CY) :
      ctx.createLinearGradient(W - WALL, CY, W - WALL - 35, CY);

    energyGradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    energyGradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = energyGradient;

    if (dir === 'up') ctx.fillRect(x, WALL, w, 35);
    else if (dir === 'down') ctx.fillRect(x, H - WALL - 35, w, 35);
    else if (dir === 'left') ctx.fillRect(WALL, y, 35, h);
    else if (dir === 'right') ctx.fillRect(W - WALL - 35, y, 35, h);
  }

  ctx.restore();
}

function drawTorch(ctx, tx, ty, now) {
  ctx.save();
  ctx.fillStyle = '#475569';
  ctx.fillRect(tx - 3, ty - 3, 6, 6);

  const flicker = Math.sin(now / 70 + tx) * 2;
  const flameH = 10 + Math.cos(now / 90) * 2.5;

  const torchLight = ctx.createRadialGradient(tx, ty, 3, tx, ty, 55);
  torchLight.addColorStop(0, 'rgba(251, 146, 60, 0.22)');
  torchLight.addColorStop(0.5, 'rgba(245, 158, 11, 0.08)');
  torchLight.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = torchLight;
  ctx.beginPath();
  ctx.arc(tx, ty, 55, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.ellipse(tx + flicker * 0.4, ty - 2, 3, flameH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.ellipse(tx + flicker, ty - 4, 4, flameH / 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 미세하게 피어오르는 불티(Ember) 파티클
  const emberPhase = ((now * 0.0018 + tx * 0.03) % 1);
  const emberX = tx + Math.sin(now / 120 + tx) * 4;
  const emberY = ty - 6 - emberPhase * 14;
  ctx.fillStyle = `rgba(254, 240, 138, ${(1 - emberPhase) * 0.7})`;
  ctx.beginPath();
  ctx.arc(emberX, emberY, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ----------------------------------------------------
// 🔑 1. 부유하는 황금 열쇠 렌더링 (Floating Golden Key)
// ----------------------------------------------------
export function drawKey(ctx, cx, cy) {
  const dim = getDim(ctx);
  const targetCx = cx !== undefined ? cx : dim.CX;
  const targetCy = cy !== undefined ? cy : dim.CY;
  const now = Date.now();
  ctx.save();

  const hoverY = Math.sin(now / 220) * 6;
  const keyY = targetCy + hoverY;

  // 바닥 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(targetCx, targetCy + 22, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 황금 발광 룬 링 (회전)
  const angle = (now / 700);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(targetCx, keyY, 26, angle, angle + Math.PI * 1.5);
  ctx.stroke();

  // 황금 열쇠 본체
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 15;

  // 열쇠 손잡이 링
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(targetCx - 6, keyY - 6, 9, 0, Math.PI * 2);
  ctx.stroke();

  // 열쇠 자루
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(targetCx, keyY - 4, 18, 4);

  // 열쇠 이빨
  ctx.fillRect(targetCx + 12, keyY, 3, 5);
  ctx.fillRect(targetCx + 16, keyY, 3, 7);

  // 반짝이는 스파크 파티클
  for (let i = 0; i < 3; i++) {
    const spAngle = (now / 500) + (i * Math.PI * 2 / 3);
    const spDist = 18 + Math.sin(now / 200 + i) * 4;
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(targetCx + Math.cos(spAngle) * spDist, keyY + Math.sin(spAngle) * spDist, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 상단 라벨
  ctx.font = 'bold 12px "Outfit", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 6;
  ctx.fillText('황금 열쇠', targetCx, keyY - 32);

  ctx.restore();
}

// ----------------------------------------------------
// 🚪 2. 고대 탈출문 렌더링 (Locked / Unlocked Ancient Portal)
// ----------------------------------------------------
export function drawExitPortal(ctx, hasKey, cx, cy) {
  const dim = getDim(ctx);
  const targetCx = cx !== undefined ? cx : dim.CX;
  const targetCy = cy !== undefined ? cy : dim.CY;
  const now = Date.now();
  ctx.save();

  // 1. 고대 포탈 기단 외곽 룬 링
  const pulse = Math.sin(now / 250) * 0.15 + 0.85;
  const ringColor = hasKey ? `rgba(250, 204, 21, ${pulse})` : `rgba(239, 68, 68, ${pulse * 0.7})`;

  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = hasKey ? '#f59e0b' : '#ef4444';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(targetCx, targetCy, 44, 0, Math.PI * 2);
  ctx.stroke();

  // 외곽 마법 눈금 (부드러운 회전 링)
  const outerSpin = now * 0.0003;
  ctx.save();
  ctx.translate(targetCx, targetCy);
  ctx.rotate(hasKey ? outerSpin : outerSpin * 0.5);
  ctx.strokeStyle = hasKey ? 'rgba(254, 240, 138, 0.45)' : 'rgba(248, 113, 113, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 2. 포탈 내부 (열림: 황금빛 회오리 볼텍스 / 닫힘: 붉은 고대 마법 봉인진)
  if (hasKey) {
    // 🌟 [열쇠 소지]: 끊임없이 부드럽고 우아하게 회전하는 고품질 회오리 볼텍스 (Calm Hypnotic Cosmic Vortex)

    // (1) 포탈 심연 배경 방사형 그라데이션
    const portalGrad = ctx.createRadialGradient(targetCx, targetCy, 2, targetCx, targetCy, 40);
    portalGrad.addColorStop(0, '#ffffff');
    portalGrad.addColorStop(0.2, '#fef08a');
    portalGrad.addColorStop(0.5, '#f59e0b');
    portalGrad.addColorStop(0.8, '#92400e');
    portalGrad.addColorStop(1, 'rgba(15, 23, 42, 0.4)');
    ctx.fillStyle = portalGrad;
    ctx.beginPath();
    ctx.arc(targetCx, targetCy, 39, 0, Math.PI * 2);
    ctx.fill();

    // (2) 6개의 고밀도 회오리 나선 팔 (부드럽고 차분한 회전 속도로 조정)
    const spinAngle = now * 0.0008;
    const numArms = 6;
    ctx.save();
    ctx.translate(targetCx, targetCy);

    // Layer A: 은은하고 몽환적인 백금/황금빛 회오리 선 (투명도를 높여 부드럽고 흐릿하게 렌더링)
    for (let i = 0; i < numArms; i++) {
      const armAngle = spinAngle + (i * Math.PI * 2 / numArms);
      ctx.beginPath();
      for (let step = 0; step <= 25; step++) {
        const t = step / 25; // 0 (외곽) -> 1 (중심)
        const r = 38 * (1 - t) + 2;
        // 중심으로 갈수록 곡률이 지수적으로 감기는 로그형 나선
        const a = armAngle + Math.pow(t, 1.25) * 3.4;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = (i % 2 === 0) ? 'rgba(255, 255, 255, 0.28)' : 'rgba(254, 240, 138, 0.2)';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(254, 240, 138, 0.35)';
      ctx.shadowBlur = 12;
      ctx.stroke();
    }

    // Layer B: 차등 회전하는 앰버 보조 소용돌이 리본 (안개처럼 은은하고 흐릿한 투명도)
    const secondarySpin = -now * 0.00045;
    for (let i = 0; i < 4; i++) {
      const armAngle = secondarySpin + (i * Math.PI * 2 / 4);
      ctx.beginPath();
      for (let step = 0; step <= 20; step++) {
        const t = step / 20;
        const r = 32 * (1 - t) + 4;
        const a = armAngle + Math.pow(t, 1.4) * 2.8;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(245, 158, 11, 0.2)';
      ctx.shadowBlur = 8;
      ctx.stroke();
    }

    // (3) 중심으로 우아하게 흘러 들어가는 별빛 파티클 (Gentle Inward Drift)
    const particleCount = 14;
    for (let p = 0; p < particleCount; p++) {
      const pPhase = (now * 0.00055 + p / particleCount) % 1; // 0 -> 1
      const pRadius = 37 * (1 - pPhase);
      const pAngle = spinAngle * 1.1 + p * (Math.PI * 2 / particleCount) + Math.pow(pPhase, 1.25) * 3.6;
      const px = Math.cos(pAngle) * pRadius;
      const py = Math.sin(pAngle) * pRadius;
      const pSize = 1.2 + (1 - pPhase) * 1.6;
      const pAlpha = pPhase < 0.1 ? pPhase * 10 : (pPhase > 0.85 ? (1 - pPhase) / 0.15 : 1);

      ctx.fillStyle = (p % 2 === 0) ? `rgba(255, 255, 255, ${pAlpha})` : `rgba(254, 240, 138, ${pAlpha})`;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // (4) 중앙 백열 싱귤래리티 코어 (안정적인 호흡형 맥동)
    const corePulse = Math.sin(now / 320) * 1.2 + 7;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#fef08a';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, corePulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  } else {
    // 🔒 [열쇠 미소지]: 고대 마법 봉인 결계 (Arcane Runic Seal Barrier)
    const lockedGrad = ctx.createRadialGradient(targetCx, targetCy, 4, targetCx, targetCy, 40);
    lockedGrad.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
    lockedGrad.addColorStop(0.5, 'rgba(153, 27, 27, 0.5)');
    lockedGrad.addColorStop(1, 'rgba(15, 23, 42, 0.3)');
    ctx.fillStyle = lockedGrad;
    ctx.beginPath();
    ctx.arc(targetCx, targetCy, 39, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(targetCx, targetCy);

    // 1. 역방향으로 천천히 회전하는 고대 8각 결계 룬진 (Runic Seal Matrix)
    const sealAngle = -now * 0.0007;
    ctx.rotate(sealAngle);

    // 결계 8각 십자선
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.35)';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 4; r++) {
      ctx.beginPath();
      ctx.moveTo(-36, 0);
      ctx.lineTo(36, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
    }

    // 4방위 결계 룬 노드 (Glowing Red Seal Nodes)
    for (let n = 0; n < 4; n++) {
      const nodeAngle = n * Math.PI / 2;
      const nx = Math.cos(nodeAngle) * 32;
      const ny = Math.sin(nodeAngle) * 32;
      ctx.fillStyle = '#f87171';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. 바깥으로 잔잔하게 퍼져나가는 결계 파동 (Seal Barrier Pulse Wave)
    const pulsePhase = (now * 0.001) % 1;
    const pulseR = 12 + pulsePhase * 24;
    ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - pulsePhase) * 0.55})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(targetCx, targetCy, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    // 3. 결계 주변을 맴도는 붉은 마법 불씨 (Crimson Embers)
    for (let e = 0; e < 5; e++) {
      const emberAngle = (now * 0.0012) + e * (Math.PI * 2 / 5);
      const emberDist = 24 + Math.sin(now / 260 + e * 2) * 6;
      ctx.fillStyle = 'rgba(254, 202, 202, 0.75)';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(targetCx + Math.cos(emberAngle) * emberDist, targetCy + Math.sin(emberAngle) * emberDist, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 부유하는 자물쇠 아이콘 (Floating Lock with Glow)
    const lockFloatY = Math.sin(now / 220) * 3;
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 12;
    ctx.fillText('🔒', targetCx, targetCy + lockFloatY);

    // 5. '열쇠 필요' 안내 문구 노출
    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = '#eab308';
    ctx.shadowBlur = 8;
    ctx.fillText('열쇠 필요', targetCx, targetCy + 54);
  }

  ctx.restore();
}

// ----------------------------------------------------
// 👾 3. 그림자 순찰 몬스터 렌더링 (Shadow Monster)
// ----------------------------------------------------
export function drawMonster(ctx, monster) {
  if (!monster) return;
  const { lx, ly, facing, state } = monster;
  const radius = monster.radius || 16;
  const now = Date.now();
  ctx.save();

  // 바닥 다크 오라 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.ellipse(lx, ly + radius - 2, radius * 1.3, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 1. 외곽 검붉은 암흑 아우라 파티클
  const isChasing = state === 'chasing';
  const pulse = Math.sin(now / 120) * 3;
  ctx.shadowColor = isChasing ? '#ef4444' : '#8b5cf6';
  ctx.shadowBlur = isChasing ? 18 : 10;

  // 본체 (불길한 어둠의 구체)
  ctx.fillStyle = isChasing ? '#450a0a' : '#1e1b4b';
  ctx.beginPath();
  ctx.arc(lx, ly, radius + pulse * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isChasing ? '#7f1d1d' : '#312e81';
  ctx.beginPath();
  ctx.arc(lx, ly, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();

  // 2. 번뜩이는 붉은 악마의 눈빛 (Glowing Eyes)
  let eyeOffsetX = 0, eyeOffsetY = 0;
  if (facing === 'up') eyeOffsetY = -3;
  else if (facing === 'down') eyeOffsetY = 3;
  else if (facing === 'left') eyeOffsetX = -3;
  else if (facing === 'right') eyeOffsetX = 3;

  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fca5a5';

  // 왼쪽 눈
  ctx.beginPath();
  ctx.ellipse(lx - 5 + eyeOffsetX, ly - 2 + eyeOffsetY, 3, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // 오른쪽 눈
  ctx.beginPath();
  ctx.ellipse(lx + 5 + eyeOffsetX, ly - 2 + eyeOffsetY, 3, 4, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // 3. 추적 모드 시 머리 위 ❗ 경고 마커
  if (isChasing) {
    const alertY = ly - radius - 16 + Math.sin(now / 90) * 2;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 10;
    ctx.fillText('❗', lx, alertY);
  }

  ctx.restore();
}

/**
 * 탐험가(플레이어) 렌더링:
 * 몬스터처럼 귀엽고 매력적인 꼬마 에메랄드 모험가 (Chibi Adventurer) 디자인
 * - 초롱초롱한 눈망울과 볼터치, 귀여운 모험가 후드/깃털, 앙증맞은 랜턴
 * - 이동 시 통통 튀는 바운스 애니메이션
 * - 피격 시 귀여운 >_< 표정 연출
 */
export function drawPlayer(ctx, playerState) {
  const { lx, ly, facing, isStunned, isInvulnerable } = playerState;
  const radius = playerState.radius || 15;
  const now = Date.now();
  const isMoving = (playerState.vx !== 0 || playerState.vy !== 0);

  ctx.save();

  // 1. 걸음 바운스 애니메이션 (이동 시 통통 튐)
  const bounce = isMoving ? Math.abs(Math.sin(now / 85)) * 3.5 : Math.sin(now / 350) * 0.8;
  const py = ly - bounce;

  // 2. 바닥 부드러운 타원형 그림자 (바운스에 맞춰 크기 자연스럽게 변화)
  const shadowScale = isMoving ? 1 - (bounce / 12) : 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(lx, ly + radius - 1, radius * 1.05 * shadowScale, radius * 0.42 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. 랜턴 전방 조명 빔
  drawLanternBeam(ctx, lx, py, facing);

  // 스턴 피격 또는 무적 시간 시 반투명 깜빡임 연출 (i-frames flicker)
  if (isStunned) {
    if (Math.floor(now / 60) % 2 === 0) ctx.globalAlpha = 0.45;
  } else if (isInvulnerable) {
    if (Math.floor(now / 80) % 2 === 0) ctx.globalAlpha = 0.4;
  }

  // 무적 보호막 회전 링 (Golden Shield Ring)
  if (isInvulnerable) {
    ctx.save();
    ctx.strokeStyle = '#fef08a';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -now / 25;
    ctx.beginPath();
    ctx.arc(lx, py, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. 등 뒤의 꼬마 모험가 망토 (Cape)
  const capeWiggle = isMoving ? Math.sin(now / 70) * 2 : 0;
  ctx.fillStyle = isStunned ? '#991b1b' : '#047857';
  ctx.beginPath();
  if (facing === 'up') {
    // 위를 볼 때는 등 뒤 망토가 넓게 보임
    ctx.ellipse(lx + capeWiggle * 0.5, py + 4, radius * 0.9, radius * 0.65, 0, 0, Math.PI * 2);
  } else if (facing === 'down') {
    // 아래를 볼 때는 뒤로 살짝 삐져나온 둥근 망토 끝
    ctx.ellipse(lx, py + radius - 3, radius * 0.65, radius * 0.35, 0, 0, Math.PI * 2);
  } else if (facing === 'left') {
    // 왼쪽 볼 때는 오른편으로 망토가 날림
    ctx.ellipse(lx + radius * 0.4 + capeWiggle, py + 2, radius * 0.6, radius * 0.5, 0.2, 0, Math.PI * 2);
  } else if (facing === 'right') {
    // 오른쪽 볼 때는 왼편으로 망토가 날림
    ctx.ellipse(lx - radius * 0.4 - capeWiggle, py + 2, radius * 0.6, radius * 0.5, -0.2, 0, Math.PI * 2);
  }
  ctx.fill();

  // 5. 모험가 본체 후드 (Chibi Emerald Hood)
  const hoodGrad = ctx.createRadialGradient(lx - 3, py - 4, 2, lx, py, radius + 2);
  if (isStunned) {
    hoodGrad.addColorStop(0, '#f87171');
    hoodGrad.addColorStop(0.7, '#dc2626');
    hoodGrad.addColorStop(1, '#991b1b');
    ctx.shadowColor = '#ef4444';
  } else {
    hoodGrad.addColorStop(0, '#34d399');
    hoodGrad.addColorStop(0.65, '#10b981');
    hoodGrad.addColorStop(1, '#059669');
    ctx.shadowColor = '#10b981';
  }
  ctx.shadowBlur = 10;
  ctx.fillStyle = hoodGrad;
  ctx.beginPath();
  ctx.arc(lx, py, radius, 0, Math.PI * 2);
  ctx.fill();

  // 6. 후드 테두리 및 깃 장식
  ctx.shadowBlur = 0;
  ctx.fillStyle = isStunned ? '#fca5a5' : '#6ee7b7';
  ctx.beginPath();
  ctx.arc(lx, py - 1, radius * 0.78, 0, Math.PI * 2);
  ctx.fill();

  // 7. 모험가 모자의 귀여운 깃털 장식 (Feather Plume)
  ctx.save();
  ctx.fillStyle = '#fef08a';
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(lx - radius * 0.5, py - radius * 0.7, 3, 7, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 8. 표정 및 눈망울 (Facing에 따른 시선 & 깜찍한 눈)
  let eyeOffsetX = 0, eyeOffsetY = 0;
  if (facing === 'down') eyeOffsetY = 2;
  else if (facing === 'up') eyeOffsetY = -2;
  else if (facing === 'left') eyeOffsetX = -3;
  else if (facing === 'right') eyeOffsetX = 3;

  if (isStunned) {
    // 😵 피격 시: 귀엽게 질끈 감긴 > < 표정
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    // 왼쪽 >
    ctx.beginPath();
    ctx.moveTo(lx - 7, py - 1); ctx.lineTo(lx - 3, py + 1); ctx.lineTo(lx - 7, py + 3);
    ctx.stroke();
    // 오른쪽 <
    ctx.beginPath();
    ctx.moveTo(lx + 7, py - 1); ctx.lineTo(lx + 3, py + 1); ctx.lineTo(lx + 7, py + 3);
    ctx.stroke();

    // 머리 위 뿅뿅 도는 노란 별 2개
    const starAngle = now / 150;
    const s1x = lx + Math.cos(starAngle) * (radius + 4);
    const s1y = py - 8 + Math.sin(starAngle) * 4;
    const s2x = lx + Math.cos(starAngle + Math.PI) * (radius + 4);
    const s2y = py - 8 + Math.sin(starAngle + Math.PI) * 4;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#facc15';
    ctx.fillText('✨', s1x - 4, s1y);
    ctx.fillText('✨', s2x - 4, s2y);

  } else if (facing === 'up') {
    // ⬆️ 뒷모습: 모자 뒤통수 매듭과 깃털 꼬리
    ctx.fillStyle = '#065f46';
    ctx.beginPath();
    ctx.arc(lx, py - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // ⬇️ ⬅️ ➡️ 앞/옆모습: 크고 초롱초롱한 치비 눈망울 + 핑크 볼터치
    
    // 발그레한 핑크 볼터치 (Blush)
    ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
    if (facing === 'down') {
      ctx.beginPath(); ctx.ellipse(lx - 7, py + 4, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 7, py + 4, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    } else if (facing === 'left') {
      ctx.beginPath(); ctx.ellipse(lx - 7, py + 4, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    } else if (facing === 'right') {
      ctx.beginPath(); ctx.ellipse(lx + 7, py + 4, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 눈동자 (큰 타원형 흑요석빛 눈)
    ctx.fillStyle = '#0f172a';
    if (facing === 'down') {
      // 정면: 양쪽 눈
      ctx.beginPath(); ctx.ellipse(lx - 4.5, py + 0.5, 2.5, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 4.5, py + 0.5, 2.5, 3.8, 0, 0, Math.PI * 2); ctx.fill();

      // 초롱초롱한 화이트 하이라이트 (스파클)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(lx - 5.2, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + 3.8, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx - 3.8, py + 2, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + 5.2, py + 2, 0.6, 0, Math.PI * 2); ctx.fill();

    } else if (facing === 'left') {
      // 왼쪽 측면: 왼쪽 눈 크게, 오른쪽 눈 살짝
      ctx.beginPath(); ctx.ellipse(lx - 6, py + 0.5, 2.5, 3.8, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx - 0.5, py + 0.5, 1.8, 3.2, -0.1, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(lx - 6.8, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx - 1.2, py - 1, 0.9, 0, Math.PI * 2); ctx.fill();

    } else if (facing === 'right') {
      // 오른쪽 측면: 오른쪽 눈 크게, 왼쪽 눈 살짝
      ctx.beginPath(); ctx.ellipse(lx + 6, py + 0.5, 2.5, 3.8, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 0.5, py + 0.5, 1.8, 3.2, 0.1, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(lx + 5.2, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx - 0.2, py - 1, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 9. 손에 든 작은 황금 랜턴 (Mini Adventurer Lantern) 또는 전설의 성검 (Legendary Sword)
  let lanternX = lx + (facing === 'left' ? -radius - 1 : radius + 1);
  let lanternY = py + 4;
  if (facing === 'up') lanternY = py - 4;

  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(lanternX, lanternY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(lanternX, lanternY, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 10. Stage 4 빛 흡수 완료 이후 전설의 성검(🗡️) 장착 시: 반대쪽 손에 찬란하게 빛나는 황금 아스트랄 성검 장착!
  if (playerState.hasLegendarySword && (playerState.stage !== 4 || (playerState.swordAwakenProgress || 0) >= 0.95)) {
    const swordSide = (facing === 'left') ? 1 : -1;
    const sx = lx + swordSide * (radius + 3);
    const sy = py + 1;
    const swing = isMoving ? Math.sin(now / 75) * 0.22 : Math.sin(now / 240) * 0.08;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(swordSide * (-0.35 + swing));

    // 성검 검신 (황금/청록 백열 광선검 오라)
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -20);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(0, -19);
    ctx.stroke();

    // 성검 코등이(Crossguard) & 자루
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-5, 2);
    ctx.lineTo(5, 2);
    ctx.stroke();

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, 7);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

function drawLanternBeam(ctx, lx, ly, facing) {
  let angle = 0;
  if (facing === 'right') angle = 0;
  else if (facing === 'down') angle = Math.PI / 2;
  else if (facing === 'left') angle = Math.PI;
  else if (facing === 'up') angle = -Math.PI / 2;

  const beamLength = 95;
  const fov = Math.PI / 3.2;

  const lightGrad = ctx.createRadialGradient(lx, ly, 10, lx, ly, beamLength);
  lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
  lightGrad.addColorStop(0.6, 'rgba(251, 191, 36, 0.12)');
  lightGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  ctx.fillStyle = lightGrad;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.arc(lx, ly, beamLength, angle - fov / 2, angle + fov / 2);
  ctx.closePath();
  ctx.fill();
}

/**
 * 방 전체 던전 조명 (스테이지별 분위기 및 다이나믹 비네팅)
 */
export function drawDungeonLighting(ctx, playerState = null, lightingOpts = {}) {
  const { W, H, CX, CY } = getDim(ctx);
  const stage = lightingOpts.stage || (playerState && playerState.stage) || 1;
  const hasLaserBeam = Boolean(lightingOpts.hasLaserBeam);
  const isLaserConnected = Boolean(lightingOpts.isLaserConnected);
  const hasLegendarySword = Boolean(lightingOpts.hasLegendarySword);
  const swordAwakenProgress = lightingOpts.swordAwakenProgress || 0;
  const swordPos = lightingOpts.swordPos || null;

  ctx.save();

  // Stage 4: 성검의 부활로 모든 스테이지 중 가장 밝은 맵과 배경으로 시작!
  // -> 성검을 잡는 순간(hasLegendarySword === true) 방의 모든 밝은 빛이 성검 위치로 빨려 들어가며 다시 어두워짐!
  if (stage === 4) {
    if (!hasLegendarySword || swordAwakenProgress <= 0) {
      // 성검 포획 전 및 다른 방들이 닫히는 동안(swordAwakenProgress === 0): 어둠이 거의 없고 방 전체에 은은한 성소 광채가 감돎
      const brightAura = ctx.createRadialGradient(CX, CY, 30, CX, CY, Math.max(W, H) * 0.78);
      brightAura.addColorStop(0, 'rgba(254, 249, 195, 0.10)');
      brightAura.addColorStop(0.7, 'rgba(254, 240, 138, 0.04)');
      brightAura.addColorStop(1, 'rgba(15, 23, 42, 0.14)');
      ctx.fillStyle = brightAura;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    } else {
      // 다른 방들이 모두 닫힌 뒤 성검을 잡은 방에서(0 -> 1): 맵과 배경의 밝음이 성검(tx, ty)으로 수축·흡수되며 어두워짐!
      const prog = Math.max(0, Math.min(1, swordAwakenProgress));
      const tx = swordPos ? swordPos.x : (playerState ? playerState.lx : CX);
      const ty = swordPos ? swordPos.y : (playerState ? playerState.ly : CY);
      const maxR = Math.hypot(W, H);
      const shrinkR = Math.max(22, maxR * (1 - prog * 0.88));
      const innerR = Math.max(6, shrinkR * 0.25);

      const absorbGrad = ctx.createRadialGradient(tx, ty, innerR, tx, ty, shrinkR);
      absorbGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
      absorbGrad.addColorStop(0.55, `rgba(4, 6, 9, ${prog * 0.45})`);
      absorbGrad.addColorStop(1, `rgba(4, 6, 9, ${0.14 + prog * 0.68})`);

      ctx.fillStyle = absorbGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
  }

  // Stage 3: 어두움과 빛(레이저)의 극명한 대비 표현!
  if (stage === 3) {
    if (hasLaserBeam) {
      // 레이저가 지나는 방은 어둠이 걷히고 광선 주변이 환하게 빛남
      const lx = playerState ? playerState.lx : CX;
      const ly = playerState ? playerState.ly : CY;
      const litGrad = ctx.createRadialGradient(lx, ly, 65, CX, CY, Math.max(W, H) * 0.78);
      litGrad.addColorStop(0, 'rgba(4, 6, 9, 0)');
      litGrad.addColorStop(0.65, isLaserConnected ? 'rgba(4, 6, 9, 0.14)' : 'rgba(4, 6, 9, 0.24)');
      litGrad.addColorStop(1, isLaserConnected ? 'rgba(4, 6, 9, 0.38)' : 'rgba(4, 6, 9, 0.55)');
      ctx.fillStyle = litGrad;
      ctx.fillRect(0, 0, W, H);
    } else if (playerState) {
      // 빛이 없는 방은 평소보다 훨씬 짙은 어둠으로 대비 극대화
      const { lx, ly } = playerState;
      const deepDark = ctx.createRadialGradient(lx, ly, 34, lx, ly, 195);
      deepDark.addColorStop(0, 'rgba(2, 4, 8, 0)');
      deepDark.addColorStop(0.58, 'rgba(2, 4, 8, 0.52)');
      deepDark.addColorStop(1, 'rgba(2, 4, 8, 0.88)');
      ctx.fillStyle = deepDark;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(2, 4, 8, 0.76)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    return;
  }

  // Stage 1, Stage 2, Stage 5 (보스전은 Stage 1과 동일한 어두움으로 긴장감 있게 진행)
  const edgeDarkness = stage === 2 ? 0.64 : 0.75;
  const midDarkness = stage === 2 ? 0.28 : 0.35;
  if (playerState) {
    const { lx, ly } = playerState;
    const ambientDarkness = ctx.createRadialGradient(lx, ly, 45, lx, ly, 240);
    ambientDarkness.addColorStop(0, 'rgba(4, 6, 9, 0)');
    ambientDarkness.addColorStop(0.65, `rgba(4, 6, 9, ${midDarkness})`);
    ambientDarkness.addColorStop(1, `rgba(4, 6, 9, ${edgeDarkness})`);

    ctx.fillStyle = ambientDarkness;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = stage === 2 ? 'rgba(4, 6, 9, 0.42)' : 'rgba(4, 6, 9, 0.48)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ----------------------------------------------------
// ✨ 4. 크로스 윈도우 문 통과 전환 이펙트 (Cross-Window Portal Transition)
// ----------------------------------------------------
const OPPOSITE_DOOR = { up: 'down', down: 'up', left: 'right', right: 'left' };
const activeDoorEffects = [];

function getDirVector(dir) {
  if (dir === 'up') return { dx: 0, dy: -1 };
  if (dir === 'down') return { dx: 0, dy: 1 };
  if (dir === 'left') return { dx: -1, dy: 0 };
  return { dx: 1, dy: 0 };
}

/**
 * 방 이동 시 출발 창('depart')과 도착 창('arrive') 양쪽 문에서
 * 창 경계를 가로질러 이어지는 에너지 입자 스트림 및 잔상 파동을 생성합니다.
 * @param {'depart' | 'arrive'} type 출발 방 또는 도착 방 여부
 * @param {'up' | 'down' | 'left' | 'right'} moveDir 플레이어의 이동 방향
 */
export function triggerDoorTransitionEffect(type, moveDir) {
  if (!moveDir) return;
  const now = performance.now();
  const duration = type === 'depart' ? 260 : 320;
  const count = type === 'depart' ? 8 : 10;
  const palette = ['#38bdf8', '#34d399', '#7dd3fc'];

  const particles = [];
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * (DOOR_W - 22);
    const depthOffset = type === 'depart'
      ? 10 + Math.random() * 28
      : Math.random() * 8;
    const speed = type === 'depart'
      ? 70 + Math.random() * 65
      : 80 + Math.random() * 75;
    const lateralDrift = (Math.random() - 0.5) * (type === 'depart' ? 12 : 24);
    const size = 1.4 + Math.random() * 1.2;
    const streakLen = 7 + Math.random() * 10;
    const color = palette[i % palette.length];

    particles.push({
      spread,
      depthOffset,
      speed,
      lateralDrift,
      size,
      streakLen,
      color
    });
  }

  // 연속 이동 시 이펙트가 중첩되지 않도록 최신 1개만 유지
  activeDoorEffects.length = 0;
  activeDoorEffects.push({
    type,
    moveDir,
    doorSide: type === 'depart' ? moveDir : OPPOSITE_DOOR[moveDir],
    startTime: now,
    duration,
    particles
  });
}

export function hasActiveDoorTransition() {
  const now = performance.now();
  for (let i = activeDoorEffects.length - 1; i >= 0; i--) {
    if (now - activeDoorEffects[i].startTime > activeDoorEffects[i].duration) {
      activeDoorEffects.splice(i, 1);
    }
  }
  return activeDoorEffects.length > 0;
}

export function drawDoorTransitionEffects(ctx) {
  if (!hasActiveDoorTransition()) return;

  const { W, H, CX, CY } = getDim(ctx);
  const now = performance.now();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (const fx of activeDoorEffects) {
    const elapsed = now - fx.startTime;
    const t = Math.max(0, Math.min(1, elapsed / fx.duration));
    const fade = 1 - t;

    const { dx, dy } = getDirVector(fx.moveDir);
    const side = fx.doorSide;

    // 문 중심의 창 경계 좌표 (x0, y0)
    let edgeX = CX, edgeY = CY;
    if (side === 'up') { edgeX = CX; edgeY = 0; }
    else if (side === 'down') { edgeX = CX; edgeY = H; }
    else if (side === 'left') { edgeX = 0; edgeY = CY; }
    else if (side === 'right') { edgeX = W; edgeY = CY; }

    // 1. 문턱의 은은한 방향성 빛 번짐 (shadowBlur 없이 가벼운 그라데이션 1회)
    const beamDepth = fx.type === 'depart' ? 36 * fade : 46 * Math.sin(t * Math.PI);
    const inwardX = fx.type === 'depart' ? -dx : dx;
    const inwardY = fx.type === 'depart' ? -dy : dy;

    if (beamDepth > 1) {
      const beamGrad = ctx.createLinearGradient(
        edgeX,
        edgeY,
        edgeX + inwardX * beamDepth,
        edgeY + inwardY * beamDepth
      );
      beamGrad.addColorStop(0, `rgba(56, 189, 248, ${0.28 * fade})`);
      beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = beamGrad;
      if (side === 'up' || side === 'down') {
        const topY = side === 'up' ? 0 : H - beamDepth;
        ctx.fillRect(CX - DOOR_W / 2, topY, DOOR_W, beamDepth);
      } else {
        const leftX = side === 'left' ? 0 : W - beamDepth;
        ctx.fillRect(leftX, CY - DOOR_W / 2, beamDepth, DOOR_W);
      }
    }

    // 2. 가볍고 깔끔한 빛 입자 궤적 (shadowBlur 제거로 프레임 드랍 방지)
    const pAlpha = fade * 0.7;
    if (pAlpha <= 0.03) continue;
    ctx.globalAlpha = pAlpha;

    for (const p of fx.particles) {
      const travel = fx.type === 'depart'
        ? t * (p.speed * 0.36)
        : easeOutCubic(t) * (p.speed * 0.42);

      const distFromEdge = fx.type === 'depart'
        ? p.depthOffset - travel
        : p.depthOffset + travel;

      if (fx.type === 'depart' && distFromEdge < -4) continue;

      const lateral = p.spread + p.lateralDrift * t;

      let px, py;
      if (side === 'up' || side === 'down') {
        px = edgeX + lateral;
        py = edgeY + inwardY * distFromEdge;
      } else {
        px = edgeX + inwardX * distFromEdge;
        py = edgeY + lateral;
      }

      const tailScale = fx.type === 'depart' ? (0.6 + t * 0.5) : (1.0 - t * 0.6);
      const tailX = px - dx * p.streakLen * tailScale;
      const tailY = py - dy * p.streakLen * tailScale;

      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

// ----------------------------------------------------
// ✨ 5. 황금방 보물 제단 & 패시브 아이템 렌더링 (Stage 1 Golden Room)
// ----------------------------------------------------
export function drawGoldenRoomItem(ctx, itemType = 'map', collected = false) {
  const { CX, CY } = getDim(ctx);
  const now = Date.now();
  ctx.save();

  // 1. 황금 마법 제단 링
  const pulse = Math.sin(now / 260) * 0.15 + 0.85;
  ctx.strokeStyle = collected
    ? 'rgba(234, 179, 8, 0.25)'
    : `rgba(250, 204, 21, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, 34, 0, Math.PI * 2);
  ctx.stroke();

  // 내측 육각/원형 제단 석판
  ctx.fillStyle = collected ? 'rgba(30, 41, 59, 0.7)' : 'rgba(113, 63, 18, 0.55)';
  ctx.beginPath();
  ctx.arc(CX, CY, 26, 0, Math.PI * 2);
  ctx.fill();

  if (collected) {
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(253, 224, 71, 0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('획득 완료', CX, CY);
    ctx.restore();
    return;
  }

  // 2. 부유하는 황금방 아이템 (지도 🗺️ or 신발 👢)
  const floatY = Math.sin(now / 210) * 5;
  const itemY = CY + floatY;

  // 회전하는 빛무리
  const spin = now * 0.0015;
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(CX, itemY, 22, spin, spin + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 아이템 아이콘
  const icon = itemType === 'boots' ? '👢' : '🗺️';
  const label = itemType === 'boots' ? '신발' : '지도';

  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 14;
  ctx.fillText(icon, CX, itemY);

  // 반짝이는 황금 별 파티클
  for (let i = 0; i < 4; i++) {
    const a = (now / 450) + (i * Math.PI / 2);
    const r = 24 + Math.sin(now / 180 + i) * 3;
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * r, itemY + Math.sin(a) * r, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 상단/하단 안내 라벨
  ctx.shadowBlur = 6;
  ctx.font = 'bold 11.5px "Outfit", sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.fillText('✨ 황금방', CX, CY - 46);

  ctx.font = '600 11px "Outfit", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.fillText(label, CX, CY + 48);

  ctx.restore();
}

// ----------------------------------------------------
// 🚩 6. 영역 점령전 거점 깃발 렌더링 (Stage 2 Territory Flag)
// ----------------------------------------------------
export function drawTerritoryFlag(ctx, owner = 'neutral', isNearFlag = false) {
  const { CX, CY } = getDim(ctx);
  const now = Date.now();
  ctx.save();

  const isPlayer = owner === 'player';
  const isMonster = owner === 'monster';

  const ringStroke = isPlayer
    ? '#38bdf8'
    : isMonster
    ? '#dc2626'
    : '#64748b';

  const ringFill = isPlayer
    ? 'rgba(56, 189, 248, 0.16)'
    : isMonster
    ? 'rgba(69, 10, 10, 0.34)'
    : 'rgba(148, 163, 184, 0.08)';

  // 1. 중앙 룬스톤 마법진 반경 원 (Runestone Capture Zone)
  ctx.fillStyle = ringFill;
  ctx.beginPath();
  ctx.arc(CX, CY, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = ringStroke;
  ctx.lineWidth = (isNearFlag && !isPlayer) ? 2.5 : 1.8;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -(now / 45);
  ctx.beginPath();
  ctx.arc(CX, CY, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. 고대 룬스톤 받침대 & 석판 기둥 (Ancient Runestone Monolith)
  ctx.fillStyle = isMonster ? '#1c1014' : '#1e293b';
  ctx.strokeStyle = isPlayer ? '#38bdf8' : isMonster ? '#7f1d1d' : '#475569';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(CX, CY + 16, 19, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 룬스톤 육각 아치형 비석 몸체
  ctx.fillStyle = isPlayer ? '#1e293b' : isMonster ? '#160b0e' : '#1b2230';
  ctx.strokeStyle = isPlayer ? '#7dd3fc' : isMonster ? '#991b1b' : '#64748b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(CX - 15, CY + 15);
  ctx.lineTo(CX - 13, CY - 13);
  ctx.lineTo(CX, CY - 24);
  ctx.lineTo(CX + 13, CY - 13);
  ctx.lineTo(CX + 15, CY + 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 룬스톤 표면에 새겨진 고대 룬 각인 (점령 시 레이저 빛으로 발광, 적 점령 시 검붉게 침식)
  ctx.strokeStyle = isPlayer
    ? '#fef08a'
    : isMonster
    ? '#b91c1c'
    : '#334155';
  ctx.lineWidth = 1.4;
  if (isPlayer) {
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  // 상단/좌우 룬 회로선
  ctx.moveTo(CX, CY - 20);
  ctx.lineTo(CX, CY - 14);
  ctx.moveTo(CX - 10, CY - 8);
  ctx.lineTo(CX - 6, CY - 3);
  ctx.lineTo(CX - 10, CY + 8);
  ctx.moveTo(CX + 10, CY - 8);
  ctx.lineTo(CX + 6, CY - 3);
  ctx.lineTo(CX + 10, CY + 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 3. 룬스톤 중앙에 박혀 있는 오팔 보석 (Embedded Opal Gem)
  const opalY = CY - 2;
  const pulse = 0.5 + 0.5 * Math.sin(now / 130);

  if (isPlayer) {
    // 내 점령 시: Stage 3 레이저 광선처럼 눈부신 청록·황금 레이저 빛으로 오팔이 강렬하게 발광!
    const haloR = 24 + pulse * 5;
    const haloGrad = ctx.createRadialGradient(CX, opalY, 2, CX, opalY, haloR);
    haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    haloGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.65)');
    haloGrad.addColorStop(0.75, 'rgba(250, 204, 21, 0.32)');
    haloGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(CX, opalY, haloR, 0, Math.PI * 2);
    ctx.fill();

    // 오팔에서 뻗어나오는 십자(+) 레이저 광선 줄기
    const rayLen = 19 + pulse * 6;
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(CX - rayLen, opalY);
    ctx.lineTo(CX + rayLen, opalY);
    ctx.moveTo(CX, opalY - rayLen);
    ctx.lineTo(CX, opalY + rayLen);
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (isMonster) {
    // 적 점령 시: 검붉고 어두운 심연 기운이 오팔 주변을 침식
    const darkGrad = ctx.createRadialGradient(CX, opalY, 2, CX, opalY, 22);
    darkGrad.addColorStop(0, 'rgba(220, 38, 38, 0.48)');
    darkGrad.addColorStop(0.6, 'rgba(69, 10, 10, 0.42)');
    darkGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = darkGrad;
    ctx.beginPath();
    ctx.arc(CX, opalY, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // 오팔 보석 본체 (다각형 커팅 오팔)
  const opalGrad = ctx.createRadialGradient(CX - 2, opalY - 3, 1, CX, opalY, 11);
  if (isPlayer) {
    opalGrad.addColorStop(0, '#ffffff');
    opalGrad.addColorStop(0.45, '#7dd3fc');
    opalGrad.addColorStop(0.8, '#38bdf8');
    opalGrad.addColorStop(1, '#fde047');
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 14;
  } else if (isMonster) {
    opalGrad.addColorStop(0, '#450a0a');
    opalGrad.addColorStop(0.55, '#7f1d1d');
    opalGrad.addColorStop(1, '#dc2626');
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 8;
  } else {
    opalGrad.addColorStop(0, '#64748b');
    opalGrad.addColorStop(0.6, '#334155');
    opalGrad.addColorStop(1, '#1e293b');
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = opalGrad;
  ctx.strokeStyle = isPlayer ? '#ffffff' : isMonster ? '#ef4444' : '#94a3b8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(CX, opalY - 11);
  ctx.lineTo(CX + 7.5, opalY - 5);
  ctx.lineTo(CX + 7.5, opalY + 5);
  ctx.lineTo(CX, opalY + 11);
  ctx.lineTo(CX - 7.5, opalY + 5);
  ctx.lineTo(CX - 7.5, opalY - 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 오팔 내부 광택 패싯(Facet) 하이라이트
  ctx.shadowBlur = 0;
  ctx.fillStyle = isPlayer
    ? 'rgba(255, 255, 255, 0.85)'
    : isMonster
    ? 'rgba(248, 113, 113, 0.28)'
    : 'rgba(226, 232, 240, 0.25)';
  ctx.beginPath();
  ctx.moveTo(CX, opalY - 7);
  ctx.lineTo(CX + 4, opalY - 2);
  ctx.lineTo(CX, opalY + 2);
  ctx.lineTo(CX - 4, opalY - 2);
  ctx.closePath();
  ctx.fill();

  // 4. 룬스톤 점령 상태 텍스트
  ctx.font = 'bold 11.5px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isPlayer) {
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('💠 내 룬스톤', CX, CY + 50);
  } else if (isMonster) {
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('🔴 적 룬스톤', CX, CY + 50);
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('🪨 중립 룬스톤', CX, CY + 50);
  }

  // 5. 플레이어가 룬스톤 반경 내에 있고 아직 내 소유가 아닐 때: [SPACE] 점령 액션 배지 표시
  if (isNearFlag && !isPlayer) {
    const floatOffset = Math.sin(now / 140) * 2.5;
    drawFloatingActionBadge(ctx, '⚡ [SPACE] 점령', CX, CY - 58 + floatOffset, {
      width: 122,
      height: 26,
      strokeColor: '#38bdf8',
      shadowColor: '#0284c7',
      textColor: '#e0f2fe'
    });
  }

  ctx.restore();
}

// ----------------------------------------------------
// ⚡ 6-B. 크로스 윈도우 레이저 & 프리즘/코어 렌더링 (Stage 3 Laser Puzzle)
// ----------------------------------------------------
export function drawStage3LaserAndNode(ctx, stage3State) {
  if (!stage3State) return;
  const { W, H, CX, CY } = getDim(ctx);
  const {
    isSourceRoom,
    isTargetRoom,
    prismDir,
    segment,
    laserConnected,
    laserChargeProgress = 0,
    isNearPrism
  } = stage3State;
  const now = Date.now();
  const charge = laserConnected ? Math.max(0.05, Math.min(1, laserChargeProgress)) : 0;

  const getEdgePoint = (dir) => {
    if (dir === 'up') return { x: CX, y: 0 };
    if (dir === 'down') return { x: CX, y: H };
    if (dir === 'left') return { x: 0, y: CY };
    return { x: W, y: CY };
  };

  const getDoorThresholdPoint = (dir) => {
    if (dir === 'up') return { x: CX, y: WALL + 2 };
    if (dir === 'down') return { x: CX, y: H - WALL - 2 };
    if (dir === 'left') return { x: WALL + 2, y: CY };
    return { x: W - WALL - 2, y: CY };
  };

  const getDirAngle = (dir) => {
    if (dir === 'right') return 0;
    if (dir === 'down') return Math.PI / 2;
    if (dir === 'left') return Math.PI;
    return -Math.PI / 2;
  };

  const drawLaserBeamLine = (x1, y1, x2, y2, overcharged) => {
    ctx.save();
    ctx.lineCap = 'round';

    const boostWidth = overcharged ? charge * 6 : 0;

    // 1. 외곽 네온 글로우
    ctx.strokeStyle = overcharged ? `rgba(250, 204, 21, ${0.38 + charge * 0.35})` : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = (overcharged ? 13 : 10) + boostWidth;
    ctx.shadowColor = overcharged ? '#eab308' : '#0284c7';
    ctx.shadowBlur = overcharged ? 18 + charge * 12 : 12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 2. 중간 코어 광선
    ctx.strokeStyle = overcharged ? '#fde047' : '#38bdf8';
    ctx.lineWidth = (overcharged ? 5.5 : 4.2) + boostWidth * 0.45;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 3. 중심 백열 필라멘트
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = overcharged ? 2.4 + charge * 1.6 : 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 4. 광선을 따라 흐르는 광자 펄스 입자 (코어 연결 시 훨씬 빠르고 강렬하게 코어 쪽으로 빨려 들어감)
    const pulseCount = overcharged ? 5 : 3;
    const speed = overcharged ? 0.0052 : 0.0026;
    for (let i = 0; i < pulseCount; i++) {
      const t = ((now * speed) + i / pulseCount) % 1;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      ctx.fillStyle = overcharged ? '#ffffff' : '#e0f2fe';
      ctx.shadowColor = overcharged ? '#facc15' : '#38bdf8';
      ctx.shadowBlur = overcharged ? 10 : 4;
      ctx.beginPath();
      ctx.arc(px, py, overcharged ? 3.8 + charge * 2 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  ctx.save();

  // 1. 입사/출사 레이저 빔 렌더링
  if (segment) {
    if (segment.inDir) {
      const inPt = getEdgePoint(segment.inDir);
      drawLaserBeamLine(inPt.x, inPt.y, CX, CY, laserConnected);
    }

    if (segment.outDir && segment.outDir !== segment.inDir) {
      const outPt = segment.blockedByClosedRoom
        ? getDoorThresholdPoint(segment.outDir)
        : getEdgePoint(segment.outDir);
      drawLaserBeamLine(CX, CY, outPt.x, outPt.y, laserConnected);

      // 아직 열리지 않은 방의 문턱에 막힌 경우: 스파크 이펙트
      if (segment.blockedByClosedRoom) {
        const sparkPulse = Math.sin(now / 70) * 2.5 + 7;
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(outPt.x, outPt.y, sparkPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(outPt.x, outPt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  // 2. 아직 레이저가 도달하지 않은 방이더라도 현재 발사대/프리즘이 가리키는 출사 방향 가이드 점선 표시
  if (!isTargetRoom && prismDir) {
    const angle = getDirAngle(prismDir);
    const guideLen = isSourceRoom ? 64 : 58;
    const gx = CX + Math.cos(angle) * guideLen;
    const gy = CY + Math.sin(angle) * guideLen;

    ctx.save();
    ctx.strokeStyle = segment
      ? (isSourceRoom ? 'rgba(250, 204, 21, 0.8)' : 'rgba(125, 211, 252, 0.75)')
      : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -(now / 40);
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 방향 화살촉
    ctx.translate(gx, gy);
    ctx.rotate(angle);
    ctx.fillStyle = segment ? (isSourceRoom ? '#facc15' : '#38bdf8') : '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4.5);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 3. 방 중앙 오브젝트 (⚡ 고대 레이저 포탑 발사대 / 💎 크리스탈 반사 프리즘 / 🗡️ 바위 제단에 꽂힌 빛을 잃은 성검)
  if (isTargetRoom) {
    // =========================================================================
    // 🗡️ 빛을 잃은 성검 (Target Room: Sword in the Stone) & 성검 부활 빛 응축 연출
    // - 평소에는 어두운 바위 제단에 빛을 잃고 잿빛으로 잠든 성검이 꽂혀 있습니다.
    // - 레이저 광선이 닿으면 사방의 빛이 성검 검신으로 빨려 들어가며 황금빛 성검으로 부활합니다!
    // =========================================================================
    const corePulse = Math.sin(now / 160) * 3;

    if (laserConnected) {
      // (A) 사방에서 성검 중심으로 빨려 들어오는 빛의 수축 파동 링 (3겹)
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const ringPhase = ((now * 0.0024) + rIdx / 3) % 1; // 0(외곽) -> 1(중심 수축)
        const ringRadius = 82 * (1 - ringPhase) + 8;
        const ringAlpha = ringPhase < 0.2 ? ringPhase * 5 : (1 - ringPhase) * 0.85;
        ctx.strokeStyle = rIdx % 2 === 0
          ? `rgba(250, 204, 21, ${ringAlpha})`
          : `rgba(56, 189, 248, ${ringAlpha})`;
        ctx.lineWidth = 1.5 + ringPhase * 2;
        ctx.beginPath();
        ctx.arc(CX, CY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // (B) 사방 12방향에서 성검으로 빨려 들어가는 빛 줄기 & 광자 입자
      const numRays = 12;
      for (let i = 0; i < numRays; i++) {
        const pPhase = ((now * 0.0032) + (i * 0.19)) % 1;
        const angle = (i * Math.PI * 2 / numRays) + (now * 0.0008);
        const dist = 78 * (1 - pPhase);
        const tailDist = Math.min(86, dist + 14 + charge * 12);

        const px = CX + Math.cos(angle) * dist;
        const py = CY + Math.sin(angle) * dist;
        const tx = CX + Math.cos(angle) * tailDist;
        const ty = CY + Math.sin(angle) * tailDist;

        ctx.strokeStyle = (i % 2 === 0)
          ? `rgba(254, 240, 138, ${0.4 + pPhase * 0.6})`
          : `rgba(255, 255, 255, ${0.4 + pPhase * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // (C) 성검 아래 바닥 마법진 & 빛 오라
    ctx.fillStyle = laserConnected
      ? `rgba(250, 204, 21, ${0.28 + charge * 0.38})`
      : 'rgba(51, 65, 85, 0.22)';
    ctx.beginPath();
    ctx.arc(CX, CY + 6, 34 + corePulse * 0.5 + charge * 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = laserConnected ? '#fde047' : '#475569';
    ctx.lineWidth = laserConnected ? 2.6 : 1.6;
    ctx.shadowColor = laserConnected ? '#eab308' : 'transparent';
    ctx.shadowBlur = laserConnected ? 22 + charge * 18 : 0;
    ctx.beginPath();
    ctx.arc(CX, CY + 6, 30 + charge * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // (D) 고대 바위 제단 (Ancient Cracked Stone Pedestal)
    const rockY = CY + 14;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = laserConnected ? '#facc15' : '#475569';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(CX - 22, rockY + 12);
    ctx.lineTo(CX - 17, rockY - 3);
    ctx.lineTo(CX - 6, rockY - 9);
    ctx.lineTo(CX + 7, rockY - 9);
    ctx.lineTo(CX + 18, rockY - 2);
    ctx.lineTo(CX + 22, rockY + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 바위 제단 내부 균열 (레이저 연결 시 균열 사이로 황금빛이 뿜어져 나옴!)
    ctx.strokeStyle = laserConnected ? '#fef08a' : '#334155';
    ctx.lineWidth = laserConnected ? 2 : 1.2;
    if (laserConnected) {
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.moveTo(CX, rockY - 7);
    ctx.lineTo(CX - 5, rockY + 2);
    ctx.lineTo(CX - 11, rockY + 8);
    ctx.moveTo(CX, rockY - 7);
    ctx.lineTo(CX + 6, rockY + 3);
    ctx.lineTo(CX + 12, rockY + 9);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // (E) 바위 제단에 수직으로 깊숙이 꽂혀 있는 성검 (Sword Plunged into the Stone)
    ctx.save();
    ctx.translate(CX, CY);

    if (laserConnected) {
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 18 + charge * 16;
    }

    // 검신 (바위 속 y = +9 까지 꽂혀 있고, 위쪽 y = -16 에 코등이가 위치)
    ctx.fillStyle = laserConnected ? '#fef08a' : '#475569';
    ctx.strokeStyle = laserConnected ? '#ffffff' : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4.5, -16);
    ctx.lineTo(4.5, -16);
    ctx.lineTo(3, 9);
    ctx.lineTo(0, 13);
    ctx.lineTo(-3, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 검신 중앙 룬 능선 (빛을 잃었을 때는 어두운 회색, 빛을 받으면 눈부신 백색 광선!)
    ctx.strokeStyle = laserConnected ? '#ffffff' : '#334155';
    ctx.lineWidth = laserConnected ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(0, 8);
    ctx.stroke();

    // 날개형 코등이 (Winged Crossguard)
    ctx.strokeStyle = laserConnected ? '#f59e0b' : '#64748b';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -18);
    ctx.lineTo(0, -15);
    ctx.lineTo(13, -18);
    ctx.stroke();

    // 코등이 중앙 코어 보석 (빛을 잃었을 땐 꺼진 잿빛, 레이저 적중 시 청록/황금 빛 폭발)
    ctx.fillStyle = laserConnected ? '#38bdf8' : '#1e293b';
    ctx.beginPath();
    ctx.arc(0, -16, 3, 0, Math.PI * 2);
    ctx.fill();

    // 검자루 (Grip) & 폼멜 (Pommel)
    ctx.strokeStyle = laserConnected ? '#b45309' : '#334155';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, -27);
    ctx.stroke();

    ctx.fillStyle = laserConnected ? '#fde047' : '#64748b';
    ctx.beginPath();
    ctx.arc(0, -29, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // 레이저 충전 중일 때 성검 전체를 감싸며 피어오르는 초신성 황금 구체
    if (laserConnected) {
      const orbR = 14 + charge * 26;
      const orbGrad = ctx.createRadialGradient(0, -6, 2, 0, -6, orbR);
      orbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      orbGrad.addColorStop(0.55, 'rgba(254, 240, 138, 0.55)');
      orbGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(0, -6, orbR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.font = 'bold 11.5px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = laserConnected ? '#fef08a' : '#94a3b8';
    ctx.fillText(laserConnected ? '✨ 성검 활성' : '🗡️ 성검', CX, CY + 48);
  } else if (isSourceRoom) {
    // =========================================================================
    // ⚡ 시작 방 전용: 고대 마법 레이저 포탑 발사대 (Arcane Laser Emitter Turret)
    // - 반사 프리즘과 확연히 구분되는 8각 중장갑 포탑 베이스 + 트윈 레일 캐논 포신 + 포구 에너지 구체
    // =========================================================================
    const dirAngle = prismDir ? getDirAngle(prismDir) : 0;

    // (1) 외곽 황금/청록 에너지 필드 링
    ctx.fillStyle = 'rgba(234, 179, 8, 0.14)';
    ctx.beginPath();
    ctx.arc(CX, CY, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isNearPrism ? '#fde047' : '#eab308';
    ctx.lineWidth = isNearPrism ? 2.5 : 1.8;
    ctx.setLineDash([8, 4]);
    ctx.lineDashOffset = -(now / 35);
    ctx.beginPath();
    ctx.arc(CX, CY, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // (2) 8각 중장갑 포탑 베이스 & 8방위 리벳 노드
    ctx.save();
    ctx.translate(CX, CY);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const rx = Math.cos(a) * 30;
      const ry = Math.sin(a) * 30;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // (3) 회전하는 트윈 레일 레이저 캐논 포신 (Twin-Rail Emitter Barrel)
    ctx.rotate(dirAngle);

    // 포신 본체 하우징
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(-6, -11, 32, 22);
    ctx.fill();
    ctx.stroke();

    // 상하 트윈 포커싱 황금 레일
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-2, -14, 26, 4);
    ctx.fillRect(-2, 10, 26, 4);

    // 포신 내부 플라즈마 코일 라인
    ctx.fillStyle = laserConnected ? '#fde047' : '#38bdf8';
    ctx.shadowColor = laserConnected ? '#eab308' : '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fillRect(2, -4, 24, 8);

    // 포구(Muzzle) 끝에서 이글거리는 고밀도 에너지 구체
    const muzzlePulse = Math.sin(now / 90) * 1.8 + 6.5;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = laserConnected ? '#facc15' : '#38bdf8';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(28, 0, muzzlePulse, 0, Math.PI * 2);
    ctx.fill();

    // 포탑 중앙 원자로 코어 (Arcane Reactor Core)
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5 + Math.sin(now / 120) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const dirLabel = prismDir === 'up' ? '↑' :
      prismDir === 'right' ? '→' :
      prismDir === 'down' ? '↓' :
      prismDir === 'left' ? '←' : '';

    ctx.shadowBlur = 0;
    ctx.font = 'bold 11.5px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(`⚡ 발사대 (${dirLabel})`, CX, CY + 54);

    if (isNearPrism && !laserConnected) {
      const floatOffset = Math.sin(now / 140) * 2.5;
      drawFloatingActionBadge(ctx, '🔄 [SPACE] 회전', CX, CY - 62 + floatOffset, {
        width: 122,
        height: 26,
        strokeColor: '#facc15',
        shadowColor: '#eab308',
        textColor: '#fef08a'
      });
    }
  } else {
    // =========================================================================
    // 💎 중간 방 전용: 룬스톤 & 회전 오팔 반사경 (Runestone & Opal Laser Relay)
    // - Stage 2에서 점령했던 룬스톤과 오팔이 Stage 3에서 레이저를 굴절·증폭하는 매개체로 작동!
    // =========================================================================
    const isLit = Boolean(segment);
    const ringStroke = laserConnected
      ? '#facc15'
      : isLit
      ? '#38bdf8'
      : '#64748b';

    ctx.fillStyle = isLit ? 'rgba(56, 189, 248, 0.16)' : 'rgba(100, 116, 139, 0.1)';
    ctx.beginPath();
    ctx.arc(CX, CY, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringStroke;
    ctx.lineWidth = isNearPrism ? 2.5 : 1.8;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -(now / 45);
    ctx.beginPath();
    ctx.arc(CX, CY, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1. 하단 고대 룬스톤 석판 베이스 (Stage 2와 이어지는 룬스톤 디자인)
    ctx.fillStyle = '#1b2230';
    ctx.strokeStyle = isLit ? '#38bdf8' : '#475569';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(CX - 15, CY + 16);
    ctx.lineTo(CX - 13, CY - 12);
    ctx.lineTo(CX, CY - 22);
    ctx.lineTo(CX + 13, CY - 12);
    ctx.lineTo(CX + 15, CY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. 룬스톤 중앙에 박혀 회전하며 레이저를 쏘는 오팔 프리즘
    const dirAngle = prismDir ? getDirAngle(prismDir) : 0;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(dirAngle);

    ctx.fillStyle = isLit ? (laserConnected ? '#fde047' : '#38bdf8') : '#334155';
    ctx.strokeStyle = isLit ? '#ffffff' : '#94a3b8';
    ctx.lineWidth = 2;
    ctx.shadowColor = ringStroke;
    ctx.shadowBlur = isLit ? 14 : 4;

    // 출사 방향을 가리키는 오팔 크리스탈 포인터
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-9, -12);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 중앙 오팔 보석 코어
    ctx.fillStyle = isLit ? '#ffffff' : '#64748b';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const dirLabel = prismDir === 'up' ? '↑' :
      prismDir === 'right' ? '→' :
      prismDir === 'down' ? '↓' :
      prismDir === 'left' ? '←' : '';

    ctx.shadowBlur = 0;
    ctx.font = 'bold 11.5px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLit ? '#7dd3fc' : '#cbd5e1';
    ctx.fillText(`💎 룬스톤 오팔 (${dirLabel})`, CX, CY + 50);

    // 플레이어가 근처에 있을 때: [SPACE] 회전 배지 표시
    if (isNearPrism && !laserConnected) {
      const floatOffset = Math.sin(now / 140) * 2.5;
      drawFloatingActionBadge(ctx, '🔄 [SPACE] 회전', CX, CY - 58 + floatOffset, {
        width: 122,
        height: 26,
        strokeColor: '#38bdf8',
        shadowColor: '#0284c7',
        textColor: '#e0f2fe'
      });
    }
  }

  // 4. 코어 연결 클라이맥스 황금빛 화면 발광 오버레이 (별도 텍스트/게이지 없이 순수 빛 연출만 유지)
  if (laserConnected && charge > 0.7) {
    ctx.save();
    const flashAlpha = ((charge - 0.7) / 0.3) * 0.42;
    ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore();
}

// ----------------------------------------------------
// 🗡️ 6-C. 도망치는 자아 성검 & 출입문 철창 레버 렌더링 (Stage 4 The Flying Sword Chase & Trap)
// ----------------------------------------------------
export function drawStage4ForgeAndSword(ctx, stage4State) {
  if (!stage4State) return;
  const { W, H, CX, CY } = getDim(ctx);
  const {
    myCellId = null,
    roomDoors = [],
    closedDoors = [],
    nearestGateDir = null,
    isNearTrappedSword = false,
    flyingSword = null,
    hasLegendarySword = false,
    swordAwakenProgress = 0
  } = stage4State;
  const now = Date.now();

  const getDoorCenter = (dir, margin = 12) => {
    if (dir === 'up') return { x: CX, y: margin };
    if (dir === 'down') return { x: CX, y: H - margin };
    if (dir === 'left') return { x: margin, y: CY };
    return { x: W - margin, y: CY };
  };

  const getLeverPos = (dir) => {
    if (dir === 'up') return { x: CX + 46, y: 26 };
    if (dir === 'down') return { x: CX - 46, y: H - 26 };
    if (dir === 'left') return { x: 26, y: CY - 46 };
    return { x: W - 26, y: CY + 46 };
  };

  ctx.save();

  // 1. 각 출입문의 철창(Gate) 및 문 옆 개폐 레버(Lever) 렌더링
  for (const dir of roomDoors) {
    const isClosed = closedDoors.includes(dir);
    const isNearest = (nearestGateDir === dir && !isNearTrappedSword && !hasLegendarySword);

    // (1-A) 닫힌 문(🔒): 묵직한 강철 창살 + 붉은 에너지 결계선
    if (isClosed) {
      ctx.save();
      if (dir === 'up' || dir === 'down') {
        const yTop = dir === 'up' ? 0 : H - 22;
        const yBot = dir === 'up' ? 22 : H;
        const yMid = (yTop + yBot) / 2;

        // 붉은 차단 오라 배경
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(CX - 38, yTop, 76, 22);

        // 가로 강철 크로스바
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(CX - 38, yMid);
        ctx.lineTo(CX + 38, yMid);
        ctx.stroke();

        // 세로 강철 창살 5개
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3.2;
        for (let offset = -30; offset <= 30; offset += 15) {
          ctx.beginPath();
          ctx.moveTo(CX + offset, yTop + 1);
          ctx.lineTo(CX + offset, yBot - 1);
          ctx.stroke();
        }
      } else {
        const xLeft = dir === 'left' ? 0 : W - 22;
        const xRight = dir === 'left' ? 22 : W;
        const xMid = (xLeft + xRight) / 2;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(xLeft, CY - 38, 22, 76);

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(xMid, CY - 38);
        ctx.lineTo(xMid, CY + 38);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3.2;
        for (let offset = -30; offset <= 30; offset += 15) {
          ctx.beginPath();
          ctx.moveTo(xLeft + 1, CY + offset);
          ctx.lineTo(xRight - 1, CY + offset);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // (1-B) 문 옆 기계식 철창 레버 (Mechanical Gate Lever)
    const lPos = getLeverPos(dir);
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isNearest ? '#facc15' : (isClosed ? '#f87171' : '#34d399');
    ctx.lineWidth = isNearest ? 2.2 : 1.5;
    if (isNearest) {
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(lPos.x, lPos.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 레버 손잡이 스틱 (열림: 초록색 왼쪽 기울임 / 닫힘: 빨간색 오른쪽 기울임)
    const stickAngle = isClosed ? 0.55 : -0.55;
    const tipX = lPos.x + Math.sin(stickAngle) * 10;
    const tipY = lPos.y - Math.cos(stickAngle) * 10;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(lPos.x, lPos.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = isClosed ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // (1-C) 플레이어가 문/레버 근처에 있을 때 조작 배지 표시
    if (isNearest) {
      const floatOffset = Math.sin(now / 140) * 2;
      const btnW = 136;
      const btnH = 24;
      let btnX = CX - btnW / 2;
      let btnY = CY;
      if (dir === 'up') {
        btnX = CX - btnW / 2;
        btnY = 44 + floatOffset;
      } else if (dir === 'down') {
        btnX = CX - btnW / 2;
        btnY = H - 68 + floatOffset;
      } else if (dir === 'left') {
        btnX = 34;
        btnY = CY - 46 + floatOffset;
      } else if (dir === 'right') {
        btnX = W - 34 - btnW;
        btnY = CY - 46 + floatOffset;
      }

      drawFloatingActionBadge(
        ctx,
        isClosed ? '🔓 [SPACE] 문 열기' : '🔒 [SPACE] 문 닫기',
        btnX + btnW / 2,
        btnY,
        {
          width: btnW,
          height: btnH,
          radius: 6,
          font: 'bold 11px "Outfit", sans-serif',
          strokeColor: isClosed ? '#34d399' : '#f87171',
          shadowColor: isClosed ? '#10b981' : '#ef4444',
          textColor: isClosed ? '#a7f3d0' : '#fecaca'
        }
      );
    }
  }

  // 2. 다른 방들이 모두 꺼진 뒤 성검으로 빛이 모이는 연출 (성검 본체 아래쪽에 먼저 렌더링)
  if (hasLegendarySword && swordAwakenProgress > 0 && flyingSword && flyingSword.cellId === myCellId) {
    const sx = flyingSword.lx ?? CX;
    const sy = flyingSword.ly ?? CY;
    const awaken = Math.max(0.05, Math.min(1, swordAwakenProgress));

    // (2-A) 방 외곽에서 성검(sx, sy)으로 수축하며 빨려 들어가는 빛의 링 3겹
    for (let i = 0; i < 3; i++) {
      const inwardPhase = ((now * 0.0032) + i / 3) % 1; // 0(바깥) -> 1(성검 중심 흡수)
      const waveR = Math.max(8, (1 - inwardPhase) * 145 * (1 - awaken * 0.45));
      ctx.strokeStyle = `rgba(254, 240, 138, ${inwardPhase * 0.85})`;
      ctx.lineWidth = 2 + inwardPhase * 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, waveR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // (2-B) 사방 14방향에서 맵의 밝은 빛 입자들이 성검 속으로 빨려 들어가는 광선 스트림
    const numStreams = 14;
    for (let i = 0; i < numStreams; i++) {
      const sPhase = ((now * 0.004) + (i * 0.17)) % 1;
      const angle = (i * Math.PI * 2 / numStreams) - (now * 0.0012);
      const dist = (1 - sPhase) * 150 * (1 - awaken * 0.35);
      const tailDist = dist + 24;

      const px = sx + Math.cos(angle) * dist;
      const py = sy + Math.sin(angle) * dist;
      const tx = sx + Math.cos(angle) * tailDist;
      const ty = sy + Math.sin(angle) * tailDist;

      ctx.strokeStyle = `rgba(254, 240, 138, ${0.35 + sPhase * 0.65})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    // (2-C) 빛을 흡수하며 점점 날카롭게 응축되는 성검 중심 코어 광채
    const coreR = Math.max(18, 86 * (1 - awaken * 0.65));
    const pillarGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, coreR);
    pillarGrad.addColorStop(0, '#ffffff');
    pillarGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.85)');
    pillarGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = pillarGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 날아다니는 자아 성검(🗡️) 및 포획된 성검 본체 렌더링 (포획 직후 다른 방들이 꺼지고 빛이 모이는 동안 수직으로 빛나는 성검 유지)
  if (flyingSword && flyingSword.cellId === myCellId) {
    const sx = flyingSword.lx;
    const sy = flyingSword.ly;
    const sAngle = hasLegendarySword ? -Math.PI / 2 : (flyingSword.angle ?? -Math.PI / 2);
    const isTrapped = !hasLegendarySword && flyingSword.state === 'trapped';
    const isGroggy = !hasLegendarySword && flyingSword.state === 'groggy';
    const isStunned = isTrapped || isGroggy;
    const isFlying = !hasLegendarySword && flyingSword.state === 'flying';
    const groggyRatio = flyingSword.groggyRatio ?? (isTrapped ? 1 : 0);

    // (3-A) 고속 비행 중일 때 진행 방향 예고선 및 뒤쪽 속도 잔상 표시
    if (isFlying) {
      if (flyingSword.targetDir) {
        const dTarget = getDoorCenter(flyingSword.targetDir, 14);
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -(now / 14);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(dTarget.x, dTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 검 뒤쪽 고속 비행 잔상 줄기
      ctx.save();
      const tailX = sx - Math.cos(sAngle) * 32;
      const tailY = sy - Math.sin(sAngle) * 32;
      const tailGrad = ctx.createLinearGradient(sx, sy, tailX, tailY);
      tailGrad.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
      tailGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.restore();
    }

    // (3-B) 성검 바닥/주변 오라 링 (스턴/그로기 시 황금 스턴 링 + 남은 그로기 게이지 아크 & 회전하는 별!)
    ctx.save();
    const auraR = (isStunned || hasLegendarySword) ? 32 + Math.sin(now / 100) * 3 : 24 + Math.sin(now / 150) * 2;
    const auraGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, auraR);
    if (isStunned || hasLegendarySword) {
      auraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
      auraGrad.addColorStop(0.65, 'rgba(250, 204, 21, 0.25)');
      auraGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
    } else {
      auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
      auraGrad.addColorStop(0.65, 'rgba(250, 204, 21, 0.2)');
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, auraR, 0, Math.PI * 2);
    ctx.fill();

    if (isStunned) {
      // 배경 점선 원
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 남은 그로기 시간 원형 게이지 아크
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * groggyRatio);
      ctx.stroke();

      // 성검 주위를 빙글빙글 도는 스턴 별 3개
      for (let i = 0; i < 3; i++) {
        const starAngle = (now * 0.006) + (i * Math.PI * 2 / 3);
        const stX = sx + Math.cos(starAngle) * 22;
        const stY = sy - 10 + Math.sin(starAngle) * 9;
        ctx.fillStyle = '#fde047';
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(stX, stY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    // (3-C) 회전/비행하는 전설의 성검 본체 그래픽
    ctx.translate(sx, sy);
    ctx.rotate(sAngle + Math.PI / 2);

    // 검신 외곽 후광
    ctx.shadowColor = (isStunned || hasLegendarySword) ? '#facc15' : '#38bdf8';
    ctx.shadowBlur = 16;

    // 다이아몬드 형태 아스트랄 검신 (위쪽이 칼끝: y = -22, 아래쪽이 코등이: y = +8)
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, -4);
    ctx.lineTo(3.5, 8);
    ctx.lineTo(-3.5, 8);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();

    // 검신 중심 백색 코어 능선
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 7);
    ctx.stroke();

    // 날개형 황금 코등이 (Winged Crossguard)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.lineTo(0, 9);
    ctx.lineTo(12, 6);
    ctx.stroke();

    // 코등이 중앙 코어 보석
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 8, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 검자루 (Grip) & 폼멜 (Pommel)
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(0, 19);
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(0, 21, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // (3-D) 성검 상태 텍스트 및 포획 프롬프트 (포획 전일 때만 표시)
    if (!hasLegendarySword) {
      ctx.save();
      ctx.font = 'bold 11px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = Math.min(H - 16, sy + 36);
      if (isStunned) {
        ctx.fillStyle = '#fef08a';
        ctx.fillText('💫 그로기', sx, labelY);
      } else {
        ctx.fillStyle = '#bae6fd';
        ctx.fillText('🗡️ 성검', sx, labelY);
      }

      if (isStunned && isNearTrappedSword) {
        const floatOffset = Math.sin(now / 130) * 2.5;
        const btnW = 132;
        const btnH = 26;
        const btnX = Math.max(8, Math.min(W - btnW - 8, sx - btnW / 2));
        const btnY = Math.max(28, sy - 50 + floatOffset);

        drawFloatingActionBadge(ctx, '🗡️ [SPACE] 잡기', btnX + btnW / 2, btnY, {
          width: btnW,
          height: btnH,
          bgColor: 'rgba(15, 23, 42, 0.95)',
          strokeColor: '#facc15',
          lineWidth: 2,
          shadowColor: '#eab308',
          shadowBlur: 12,
          textColor: '#fef08a'
        });
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

// ----------------------------------------------------
// 👑 6-D. 심연의 마왕: 탄막 결계 & 보스 추격·성검 참격 렌더링 (Stage 5 Final Boss)
// ----------------------------------------------------
export function drawStage5BossAndArena(ctx, stage5State) {
  if (!stage5State || !stage5State.boss) return;
  const { W, H, CX, CY } = getDim(ctx);
  const {
    myCellId = null,
    roomDoors = [],
    boss = null,
    isNearBoss = false
  } = stage5State;
  const now = Date.now();

  ctx.save();

  const isBarrageHere = Boolean(
    boss.state === 'barrage' &&
    boss.barrageCellId === myCellId
  );
  const isBossHere = Boolean(
    boss.cellId === myCellId &&
    boss.state !== 'barrage'
  );

  // 1. 🔥 탄막 피하기 결계 페이즈 ('barrage'): 문 결계 봉쇄 + 4모서리 심연 포탈 + 탄막 + 타이머 게이지
  if (isBarrageHere) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);

    // (1-A) 방 테두리 붉은/보라 심연 결계선
    ctx.strokeStyle = `rgba(244, 63, 94, ${0.38 + pulse * 0.35})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);

    // (1-B) 열린 문들에 붉은 마법 결계 봉쇄막 표시 (탄막 페이즈 동안 방 이동 불가 시각 피드백)
    const doorHalf = DOOR_W / 2;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#e11d48';
    ctx.shadowBlur = 10;
    for (const dir of roomDoors) {
      ctx.beginPath();
      if (dir === 'up') {
        ctx.moveTo(CX - doorHalf, WALL + 3);
        ctx.lineTo(CX + doorHalf, WALL + 3);
      } else if (dir === 'down') {
        ctx.moveTo(CX - doorHalf, H - WALL - 3);
        ctx.lineTo(CX + doorHalf, H - WALL - 3);
      } else if (dir === 'left') {
        ctx.moveTo(WALL + 3, CY - doorHalf);
        ctx.lineTo(WALL + 3, CY + doorHalf);
      } else if (dir === 'right') {
        ctx.moveTo(W - WALL - 3, CY - doorHalf);
        ctx.lineTo(W - WALL - 3, CY + doorHalf);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // (1-C) 네 모서리 심연 탄막 포탈 (4 Corner Abyssal Turret Portals)
    const corners = [
      { x: 34, y: 34 },
      { x: W - 34, y: 34 },
      { x: W - 34, y: H - 34 },
      { x: 34, y: H - 34 }
    ];
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      const spin = (now * 0.004) * (i % 2 === 0 ? 1 : -1);

      const pGrad = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 18);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.4, '#f43f5e');
      pGrad.addColorStop(0.75, 'rgba(147, 51, 234, 0.55)');
      pGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(spin);
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // (1-D) 하단 탄막 결계 남은 시간 바 & 안내 텍스트
    const barW = 176;
    const barH = 7;
    const barX = CX - barW / 2;
    const barY = H - 22;
    const remainRatio = Math.max(0, Math.min(1, 1 - (boss.barrageProgress || 0)));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = '#f43f5e';
    roundRect(ctx, barX, barY, barW * remainRatio, barH, 4);
    ctx.fill();

    ctx.font = 'bold 11.5px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fecdd3';
    ctx.shadowColor = '#be123c';
    ctx.shadowBlur = 6;
    ctx.fillText(`🔥 탄막 회피 (${boss.barrageTimeLeft || 1}s)`, CX, H - 34);
    ctx.restore();
  }

  // 2. 👑 심연의 마왕 (The Abyssal Demon King) 본체 렌더링 (추격/공격/피격/격파 페이즈)
  if (isBossHere) {
    const isHit = boss.state === 'hit';
    const isDying = boss.state === 'dying';
    const spawnProg = boss.spawnProgress ?? 1;
    const vanishProg = boss.vanishProgress ?? 0;
    const isSpawning = !isDying && !isHit && spawnProg < 0.995;
    const isVanishing = !isDying && vanishProg > 0.005;
    const showHitFlash = (isHit && vanishProg < 0.16) || isDying;

    const shakeX = showHitFlash ? (Math.random() - 0.5) * (isDying ? 12 : 6) : 0;
    const shakeY = showHitFlash ? (Math.random() - 0.5) * (isDying ? 12 : 6) : 0;
    const floatY = Math.sin(now / 200) * 4.5;
    const bx = (boss.lx ?? CX) + shakeX;
    const by = (boss.ly ?? CY) + floatY + shakeY;

    ctx.save();

    let bhScale = 0;
    if (isSpawning) {
      bhScale = spawnProg < 0.32
        ? Math.sin((spawnProg / 0.32) * (Math.PI / 2)) * 1.15
        : 1.15 * Math.pow(Math.max(0, 1 - (spawnProg - 0.32) / 0.68), 1.35);
    } else if (isVanishing) {
      bhScale = vanishProg < 0.28
        ? 0.25 + Math.sin((vanishProg / 0.28) * (Math.PI / 2)) * 0.98
        : (vanishProg < 0.78
          ? 1.23
          : 1.23 * Math.pow(Math.max(0, 1 - (vanishProg - 0.78) / 0.22), 1.5));
    }
    const tiltAngle = -0.32 + Math.sin(now * 0.0015) * 0.04;

    // (2-0) 🌑 우아한 심연의 블랙홀(Gravitational Singularity & Accretion Halo) 후면부 연출
    if ((isSpawning || isVanishing) && bhScale > 0.02) {
      ctx.save();
      ctx.translate(bx, by);

      // 1) 심연 중력장 왜곡 헤일로 (Deep Gravitational Well)
      const wellR = 76 * bhScale;
      const wellGrad = ctx.createRadialGradient(0, 0, 6 * bhScale, 0, 0, wellR);
      wellGrad.addColorStop(0, '#010005');
      wellGrad.addColorStop(0.32, '#03010a');
      wellGrad.addColorStop(0.46, 'rgba(30, 10, 60, 0.92)');
      wellGrad.addColorStop(0.62, 'rgba(126, 34, 206, 0.52)');
      wellGrad.addColorStop(0.8, 'rgba(219, 39, 119, 0.2)');
      wellGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = wellGrad;
      ctx.beginPath();
      ctx.arc(0, 0, wellR, 0, Math.PI * 2);
      ctx.fill();

      // 2) 기울어진 타원형 강착 원반 — 후면 아크 (Back Half of Tilted Elliptical Accretion Disk)
      ctx.save();
      ctx.rotate(tiltAngle);
      ctx.scale(1.48, 0.44);

      const diskRingR = 42 * bhScale;
      const diskGrad = ctx.createLinearGradient(-diskRingR, 0, diskRingR, 0);
      diskGrad.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
      diskGrad.addColorStop(0.28, 'rgba(240, 171, 252, 0.85)');
      diskGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
      diskGrad.addColorStop(0.72, 'rgba(244, 63, 94, 0.82)');
      diskGrad.addColorStop(1, 'rgba(126, 34, 206, 0.18)');

      ctx.strokeStyle = diskGrad;
      ctx.lineWidth = 6.5 * bhScale;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, diskRingR, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3) 사건의 지평선을 감싸며 완만하게 흐르는 중력 렌즈 광호 (Gravitational Lensing Arcs)
      const slowRot = now * (isVanishing ? -0.0024 : 0.0022);
      for (let i = 0; i < 2; i++) {
        const arcR = (27 + i * 6.5) * bhScale;
        const startA = slowRot + i * Math.PI;
        ctx.save();
        ctx.strokeStyle = i === 0
          ? `rgba(232, 121, 249, ${Math.min(0.78, bhScale * 0.72)})`
          : `rgba(251, 113, 133, ${Math.min(0.58, bhScale * 0.55)})`;
        ctx.lineWidth = (2.8 - i * 0.8) * bhScale;
        ctx.lineCap = 'round';
        ctx.shadowColor = i === 0 ? '#a855f7' : '#f43f5e';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, arcR, startA, startA + Math.PI * 0.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, arcR, startA + Math.PI, startA + Math.PI * 1.72);
        ctx.stroke();
        ctx.restore();
      }

      // 4) 사건의 지평선으로 고요하게 끌려 들어가는 미세 성운 입자 (Singularity Stardust Motes)
      const moteCount = 8;
      for (let i = 0; i < moteCount; i++) {
        const cycle = ((now * 0.0014) + i * (1 / moteCount)) % 1;
        const progress = isVanishing ? (1 - cycle) : cycle;
        const mDist = (21 + progress * 34) * bhScale;
        const mAngle = (i * Math.PI * 2 / moteCount) + (1 - progress) * 1.1 + (now * 0.0008);
        const mx = Math.cos(mAngle) * mDist;
        const my = Math.sin(mAngle) * mDist * 0.78;
        const mAlpha = Math.sin(progress * Math.PI) * Math.min(0.85, bhScale);

        ctx.fillStyle = i % 2 === 0
          ? `rgba(245, 208, 254, ${mAlpha})`
          : `rgba(253, 164, 175, ${mAlpha})`;
        ctx.beginPath();
        ctx.arc(mx, my, (1.2 + (i % 2) * 0.7) * Math.min(1.1, bhScale), 0, Math.PI * 2);
        ctx.fill();
      }

      // 5) 칠흑의 사건의 지평선 코어 & 광자 고리 (Event Horizon & Photon Ring)
      const coreR = Math.max(2, 22 * bhScale);
      ctx.fillStyle = '#020007';
      ctx.shadowColor = isVanishing ? '#f43f5e' : '#c084fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isVanishing
        ? `rgba(251, 113, 133, ${Math.min(0.92, bhScale)})`
        : `rgba(232, 121, 249, ${Math.min(0.92, bhScale)})`;
      ctx.lineWidth = 2.2 * Math.min(1.1, bhScale);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(250, 232, 255, ${Math.min(0.85, bhScale * 0.8)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.94, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 보스 본체 스케일 & 페이드 변환 (과도한 회전 없이 사건의 지평선 중심에서 우아하게 떠오르거나 침잠)
    let bossScale = 1;
    let bossAlpha = 1;
    let sinkOffsetY = 0;
    if (isSpawning) {
      const easeOut = 1 - Math.pow(1 - spawnProg, 2.6);
      bossScale = Math.max(0.08, easeOut);
      bossAlpha = Math.min(1, Math.pow(spawnProg, 0.85) * 1.25);
      sinkOffsetY = (1 - easeOut) * 10;
    } else if (isVanishing) {
      const bv = Math.min(1, vanishProg / 0.86);
      const easeIn = Math.pow(1 - bv, 2.2);
      bossScale = Math.max(0, easeIn);
      bossAlpha = Math.max(0, Math.pow(1 - bv, 1.5));
      sinkOffsetY = (1 - easeIn) * 8;
    }

    if (bossScale > 0.01 && bossAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = bossAlpha;
      if (isSpawning || isVanishing) {
        ctx.translate(bx, by + sinkOffsetY);
        ctx.scale(bossScale, bossScale);
        ctx.translate(-bx, -by);
      }

      // (2-A) 바닥 심연 마법진 & 암흑 오라
      const bossAuraR = 54 + Math.sin(now / 150) * 4;
      const bGrad = ctx.createRadialGradient(bx, by, 6, bx, by, bossAuraR);
      if (showHitFlash) {
        bGrad.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
        bGrad.addColorStop(0.55, 'rgba(244, 63, 94, 0.45)');
        bGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      } else {
        bGrad.addColorStop(0, 'rgba(147, 51, 234, 0.52)');
        bGrad.addColorStop(0.6, 'rgba(225, 29, 72, 0.25)');
        bGrad.addColorStop(1, 'rgba(88, 28, 135, 0)');
      }
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, bossAuraR, 0, Math.PI * 2);
      ctx.fill();

      // 바닥 회전 룬 링
      ctx.strokeStyle = showHitFlash ? '#fef08a' : 'rgba(244, 63, 94, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -(now / 30);
      ctx.beginPath();
      ctx.arc(bx, by, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // (2-B) 마왕 주변을 공전하는 3개의 심연 마력 구체 (Orbiting Dark Orbs)
      for (let i = 0; i < 3; i++) {
        const orbAngle = (now * 0.0035) + (i * Math.PI * 2 / 3);
        const ox = bx + Math.cos(orbAngle) * 34;
        const oy = by + Math.sin(orbAngle) * 24;
        ctx.fillStyle = showHitFlash ? '#fef08a' : '#e879f9';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // (2-C) 마왕의 망토 & 악마의 날개 실루엣 (Dark Royal Mantle & Wings)
      const wingSpread = 28 + Math.sin(now / 180) * 3;
      ctx.fillStyle = showHitFlash ? '#fef08a' : '#3b0764';
      ctx.strokeStyle = showHitFlash ? '#ffffff' : '#f43f5e';
      ctx.lineWidth = 2;
      ctx.shadowColor = showHitFlash ? '#facc15' : '#e11d48';
      ctx.shadowBlur = 14;

      // 좌우 박쥐형 마왕 날개
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.quadraticCurveTo(bx + side * 18, by - 22, bx + side * wingSpread, by - 12);
        ctx.quadraticCurveTo(bx + side * 22, by + 2, bx + side * 24, by + 14);
        ctx.quadraticCurveTo(bx + side * 12, by + 10, bx, by + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // (2-D) 마왕의 중장갑 흉갑 & 투구 코어 (Armored Demon Head & Torso)
      ctx.fillStyle = showHitFlash ? '#ffffff' : '#0f172a';
      ctx.strokeStyle = showHitFlash ? '#facc15' : '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // (2-E) 양쪽 거대한 흑요석 마왕 뿔 (Curved Obsidian Horns)
      ctx.strokeStyle = showHitFlash ? '#fef08a' : '#f43f5e';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * 11, by - 11);
        ctx.quadraticCurveTo(bx + side * 23, by - 18, bx + side * 17, by - 28);
        ctx.stroke();
      }

      // (2-F) 머리 위 황금-진홍 마왕 왕관 (Abyssal Crown)
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by - 16);
      ctx.lineTo(bx - 7, by - 25);
      ctx.lineTo(bx - 3, by - 19);
      ctx.lineTo(bx, by - 27);
      ctx.lineTo(bx + 3, by - 19);
      ctx.lineTo(bx + 7, by - 25);
      ctx.lineTo(bx + 9, by - 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // (2-G) 타오르는 두 개의 진홍빛 안광 (Glowing Crimson Demon Eyes)
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = showHitFlash ? '#ef4444' : '#fb7185';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * 3, by - 1);
        ctx.lineTo(bx + side * 10, by - 4);
        ctx.lineTo(bx + side * 8, by + 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // (2-0B) 🌑 블랙홀 전면부 강착 원반 & 닫힘 렌즈 섬광 (보스를 가로지르는 입체 링 연출)
    if ((isSpawning || isVanishing) && bhScale > 0.02) {
      ctx.save();
      ctx.translate(bx, by);

      ctx.save();
      ctx.rotate(tiltAngle);
      ctx.scale(1.48, 0.44);

      const diskRingR = 42 * bhScale;
      const frontGrad = ctx.createLinearGradient(-diskRingR, 0, diskRingR, 0);
      frontGrad.addColorStop(0, 'rgba(168, 85, 247, 0.15)');
      frontGrad.addColorStop(0.25, 'rgba(240, 171, 252, 0.92)');
      frontGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
      frontGrad.addColorStop(0.75, 'rgba(251, 113, 133, 0.9)');
      frontGrad.addColorStop(1, 'rgba(126, 34, 206, 0.15)');

      ctx.strokeStyle = frontGrad;
      ctx.lineWidth = 5.2 * bhScale;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, diskRingR, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.stroke();
      ctx.restore();

      if (isVanishing && vanishProg > 0.76) {
        const pinch = Math.max(0, 1 - (vanishProg - 0.76) / 0.24);
        const flareW = 48 * pinch;
        const flareGrad = ctx.createLinearGradient(-flareW, 0, flareW, 0);
        flareGrad.addColorStop(0, 'rgba(240, 171, 252, 0)');
        flareGrad.addColorStop(0.5, `rgba(255, 255, 255, ${pinch * 0.95})`);
        flareGrad.addColorStop(1, 'rgba(240, 171, 252, 0)');
        ctx.strokeStyle = flareGrad;
        ctx.lineWidth = 2.2 * pinch;
        ctx.beginPath();
        ctx.moveTo(-flareW, 0);
        ctx.lineTo(flareW, 0);
        ctx.stroke();
      }

      ctx.restore();
    }

    // (2-H) 보스 상단 체력바 & 이름 표시 (👑 보스 ❤️❤️❤️)
    ctx.shadowBlur = 0;
    if (bossAlpha > 0.15) {
      ctx.save();
      ctx.globalAlpha = bossAlpha;
      const hearts = '❤️'.repeat(Math.max(0, boss.hp)) + '🖤'.repeat(Math.max(0, boss.maxHp - boss.hp));
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fda4af';
      ctx.fillText(`👑 보스  ${hearts}`, bx, by - 42 * Math.max(0.55, bossScale));
      ctx.restore();
    }

    if (!isHit && isNearBoss && !isDying && !isVanishing) {
      const floatOffset = Math.sin(now / 120) * 2.5;
      const btnW = 132;
      const btnH = 26;
      const btnX = Math.max(8, Math.min(W - btnW - 8, bx - btnW / 2));
      const btnY = Math.min(H - 34, by + 28 + floatOffset);

      drawFloatingActionBadge(ctx, '⚔️ [SPACE] 공격', btnX + btnW / 2, btnY, {
        width: btnW,
        height: btnH,
        bgColor: 'rgba(15, 23, 42, 0.95)',
        strokeColor: '#facc15',
        lineWidth: 2,
        shadowColor: '#eab308',
        shadowBlur: 12,
        textColor: '#fef08a'
      });
    }

    // (2-I) 보스 최후의 초신성 폭발 연출 ('dying')
    if (isDying) {
      const dProg = Math.max(0.05, Math.min(1, boss.dyingProgress || 0));
      for (let i = 0; i < 4; i++) {
        const wavePhase = ((now * 0.003) + i / 4) % 1;
        const waveR = 18 + wavePhase * 96;
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(250, 204, 21, ${(1 - wavePhase) * 0.9})`
          : `rgba(244, 63, 94, ${(1 - wavePhase) * 0.85})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by, waveR, 0, Math.PI * 2);
        ctx.stroke();
      }

      const pGrad = ctx.createRadialGradient(bx, by, 4, bx, by, 60 + dProg * 40);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.85)');
      pGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(bx, by, 60 + dProg * 40, 0, Math.PI * 2);
      ctx.fill();

      if (dProg > 0.65) {
        const flashAlpha = ((dProg - 0.65) / 0.35) * 0.5;
        ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    ctx.restore();
  }

  // 3. 💥 탄막 구체(Bullets) 렌더링 (탄막 결계 방이거나 보스와 교전 중인 방일 때)
  if ((isBarrageHere || isBossHere) && Array.isArray(boss.bullets) && boss.bullets.length > 0) {
    ctx.save();
    for (const b of boss.bullets) {
      const r = b.r || 6;
      const color = b.color || '#f43f5e';

      // 외곽 네온 글로우
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();

      // 내부 백열 코어
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. ⚔️ 황금 성검 초승달 참격 이펙트 (Slash Effect — 보스 타격 시 화려한 검기 폭발!)
  if (boss.slashEffect && boss.slashEffect.cellId === myCellId) {
    const se = boss.slashEffect;
    const prog = Math.max(0, Math.min(1, se.progress || 0));
    const alpha = Math.max(0, 1 - prog);

    ctx.save();
    ctx.translate(se.x, se.y);
    ctx.rotate(se.angle || 0);

    // (4-A) 초승달 황금 검기 아크
    const arcR = 26 + prog * 28;
    ctx.strokeStyle = `rgba(250, 204, 21, ${alpha})`;
    ctx.lineWidth = 8 * alpha + 2;
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 20;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, arcR, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();

    // (4-B) 백색 중심 검섬(Cross Slash)
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 4 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(-42, -18);
    ctx.lineTo(42, 18);
    ctx.moveTo(-32, 24);
    ctx.lineTo(32, -24);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

// ----------------------------------------------------
// 🌑 7. 스테이지 전환 페이드 오버레이 (Stage 1 -> 2 -> 3 -> 4 Cascade)
// ----------------------------------------------------
export function drawStageTransitionOverlay(ctx, transitionState) {
  if (!transitionState || transitionState.alpha <= 0.01) return;
  const { W, H, CX, CY } = getDim(ctx);
  const alpha = Math.max(0, Math.min(1, transitionState.alpha));
  const toStage = transitionState.toStage || 2;

  ctx.save();
  ctx.fillStyle = `rgba(6, 9, 15, ${alpha * 0.92})`;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 상단 타이틀
  ctx.font = 'bold 19px "Outfit", sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#eab308';
  ctx.shadowBlur = 12;
  const clearTitle = `STAGE ${toStage - 1} CLEAR`;
  ctx.fillText(clearTitle, CX, CY - 24);

  // 하단 다음 스테이지 안내
  ctx.shadowBlur = 0;
  ctx.font = 'bold 12px "Outfit", sans-serif';
  if (toStage === 5) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('👑 STAGE 5: 탄막을 피한 뒤 보스를 찾아 [SPACE]로 공격하세요', CX, CY + 14);
  } else if (toStage === 4) {
    ctx.fillStyle = '#facc15';
    ctx.fillText('🗡️ STAGE 4: 문 앞 [SPACE]로 문을 닫아 성검을 잡으세요', CX, CY + 14);
  } else if (toStage === 3) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ STAGE 3: [SPACE]로 룬스톤 오팔을 돌려 성검에 레이저를 연결하세요', CX, CY + 14);
  } else {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('💠 STAGE 2: [SPACE]로 룬스톤을 점령하세요', CX, CY + 14);
  }

  ctx.restore();
}

/**
 * 상단 HUD 오버레이 (스테이지별 목표, 아이템, 단축키 안내 및 토스트 피드백)
 */
export function drawHUD(ctx, hasKey, isMuted, lockedAlertTimer = 0, hudExtra = null) {
  const { W, CX } = getDim(ctx);
  const stage = (hudExtra && hudExtra.stage) || 1;
  const hasMapItem = Boolean(hudExtra && hudExtra.hasMapItem);
  const hasBootsItem = Boolean(hudExtra && hudExtra.hasBootsItem);
  const hasLegendarySword = Boolean(hudExtra && hudExtra.hasLegendarySword);
  ctx.save();

  // 1. 좌상단 외곽: 스테이지별 핵심 상태 배지
  let leftText = '';
  let borderColor = '#475569';
  let textColor = '#94a3b8';
  let glowColor = 'transparent';

  const itemIcons = `${hasMapItem ? ' 🗺️' : ''}${hasBootsItem ? ' 👢' : ''}${hasLegendarySword ? ' 🗡️' : ''}`;

  if (stage === 5) {
    const bossHp = (hudExtra && hudExtra.bossHp) ?? 3;
    const bossMaxHp = (hudExtra && hudExtra.bossMaxHp) ?? 3;
    const bossState = (hudExtra && hudExtra.bossState) || 'barrage';
    const barrageTimeLeft = (hudExtra && hudExtra.barrageTimeLeft) || 0;
    const searchTimeLeft = (hudExtra && hudExtra.searchTimeLeft) || 0;
    const hearts = '❤️'.repeat(Math.max(0, bossHp)) + '🖤'.repeat(Math.max(0, bossMaxHp - bossHp));
    if (bossHp <= 0) {
      leftText = `⚔️ S5 | 클리어${itemIcons}`;
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else if (bossState === 'barrage') {
      leftText = `⚔️ S5 | 탄막 ${barrageTimeLeft}s | 👑${hearts}${itemIcons}`;
      borderColor = '#f43f5e';
      textColor = '#fecdd3';
      glowColor = '#e11d48';
    } else {
      leftText = `⚔️ S5 | 탐색 ${searchTimeLeft}s | 👑${hearts}${itemIcons}`;
      borderColor = '#c084fc';
      textColor = '#f3e8ff';
      glowColor = '#9333ea';
    }
  } else if (stage === 4) {
    const isSwordTrapped = Boolean(hudExtra && hudExtra.isSwordTrapped);
    if (hasLegendarySword) {
      leftText = `🗡️ S4 | 성검 획득${itemIcons}`;
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else if (isSwordTrapped) {
      leftText = `🗡️ S4 | 성검 그로기${itemIcons}`;
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else {
      leftText = `🗡️ S4 | [SPACE] 문 닫기${itemIcons}`;
      borderColor = '#38bdf8';
      textColor = '#bae6fd';
      glowColor = '#0284c7';
    }
  } else if (stage === 3) {
    const laserConnected = Boolean(hudExtra && hudExtra.laserConnected);
    leftText = `${laserConnected ? '⚡ S3 | 연결 완료' : '⚡ S3 | 성검에 레이저 연결'}${itemIcons}`;
    borderColor = laserConnected ? '#facc15' : '#38bdf8';
    textColor = laserConnected ? '#fef08a' : '#7dd3fc';
    glowColor = laserConnected ? '#eab308' : '#0284c7';
  } else if (stage === 2) {
    const pScore = (hudExtra && hudExtra.playerScore) ?? 0;
    const mScore = (hudExtra && hudExtra.monsterScore) ?? 0;
    const timeLeft = (hudExtra && hudExtra.stage2TimeLeft) ?? 0;
    const isOvertime = Boolean(hudExtra && hudExtra.isOvertime);
    const timeLabel = isOvertime ? '⚡OVERTIME' : `⏱️${timeLeft}s`;
    leftText = `💠 S2 | 🔵${pScore} : ${mScore}🔴 | ${timeLabel}${itemIcons}`;
    if (isOvertime) {
      borderColor = '#f59e0b';
      textColor = '#fde047';
      glowColor = '#f59e0b';
    } else if (pScore > mScore) {
      borderColor = '#38bdf8';
      textColor = '#7dd3fc';
      glowColor = '#0284c7';
    } else if (mScore > pScore) {
      borderColor = '#ef4444';
      textColor = '#fca5a5';
      glowColor = '#ef4444';
    } else {
      borderColor = '#38bdf8';
      textColor = '#e2e8f0';
    }
  } else {
    leftText = `${hasKey ? '🔑 KEY: OK' : '🔑 KEY: NONE'}${itemIcons}`;
    borderColor = hasKey ? '#eab308' : '#475569';
    textColor = hasKey ? '#fef08a' : '#94a3b8';
    glowColor = hasKey ? '#eab308' : 'transparent';
  }

  const badgeFont = 'bold 11px "JetBrains Mono", monospace';
  ctx.font = badgeFont;
  const badgeW = Math.max(114, Math.ceil(measureTextCached(ctx, badgeFont, leftText)) + 22);
  const badgeH = 22;
  const badgeX = 6;
  const badgeY = 4;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glowColor !== 'transparent' ? 8 : 0;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

  // 2. 우상단 외곽: 미니맵 및 사운드 단축키 배지
  const hintText = `🗺️ [M] MAP  |  ${isMuted ? '🔇 [U] MUTE' : '🔊 [U] SFX'}`;
  const hintFont = '10.5px "JetBrains Mono", monospace';
  ctx.font = hintFont;
  const hintW = Math.max(186, Math.ceil(measureTextCached(ctx, hintFont, hintText)) + 28);
  const hintH = 22;
  const hintX = W - 6 - hintW;
  const hintY = 4;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  roundRect(ctx, hintX, hintY, hintW, hintH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hintText, hintX + hintW / 2, hintY + hintH / 2 + 0.5);

  // 3. 상단 토스트 알림 (잠긴 문 경고 or 아이템 획득 / 깃발 점령 알림)
  if (lockedAlertTimer > 0) {
    const alpha = Math.min(1, lockedAlertTimer / 15);
    const toastW = 216;
    const toastH = 26;
    const toastX = CX - toastW / 2;
    const toastY = 32;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(69, 10, 10, 0.9)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    roundRect(ctx, toastX, toastY, toastW, toastH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.font = '600 12px "Outfit", sans-serif';
    ctx.fillStyle = '#fecaca';
    ctx.textAlign = 'center';
    ctx.fillText('🔒 열쇠가 필요합니다', CX, toastY + toastH / 2);
  } else if (hudExtra && hudExtra.toastTimer > 0 && hudExtra.toastText) {
    const alpha = Math.min(1, hudExtra.toastTimer / 15);
    const toastFont = '600 12px "Outfit", sans-serif';
    ctx.font = toastFont;
    const toastW = Math.max(220, Math.ceil(measureTextCached(ctx, toastFont, hudExtra.toastText)) + 32);
    const toastH = 26;
    const toastX = CX - toastW / 2;
    const toastY = 32;

    const toastColor = hudExtra.toastColor || '#eab308';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = toastColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = toastColor;
    ctx.shadowBlur = 10;
    roundRect(ctx, toastX, toastY, toastW, toastH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(hudExtra.toastText, CX, toastY + toastH / 2);
  }

  ctx.restore();
}

/**
 * 판타지 HUD 스타일의 문 열기 안내 프롬프트
 */
export function drawPrompt(ctx, promptData) {
  const { CX, CY } = getDim(ctx);
  const now = Date.now();
  const floatOffset = Math.sin(now / 180) * 2.5;

  ctx.save();

  const boxW = 146;
  const boxH = 68;
  const boxX = CX - boxW / 2;
  const boxY = CY - boxH / 2 + floatOffset;

  ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 20;
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();

  ctx.shadowBlur = 8;
  if (promptData.willOpenNew) {
    ctx.strokeStyle = '#38bdf8';
    ctx.shadowColor = '#0284c7';
  } else {
    ctx.strokeStyle = '#34d399';
    ctx.shadowColor = '#059669';
  }
  ctx.lineWidth = 1.8;
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.stroke();

  ctx.shadowBlur = 0;
  const keyW = 80;
  const keyH = 22;
  const keyX = CX - keyW / 2;
  const keyY = boxY + 11;

  ctx.fillStyle = '#1e293b';
  roundRect(ctx, keyX, keyY, keyW, keyH, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  roundRect(ctx, keyX, keyY, keyW, keyH, 5);
  ctx.stroke();

  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE', CX, keyY + keyH / 2);

  const dirArrow = promptData.dir === 'up' ? '↑ ' :
    promptData.dir === 'down' ? '↓ ' :
    promptData.dir === 'left' ? '← ' :
    promptData.dir === 'right' ? '→ ' : '';
  const actionLabel = promptData.willOpenNew ? `${dirArrow}방 개척` : `${dirArrow}방 이동`;

  ctx.font = '600 13.5px "Outfit", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(actionLabel, CX, boxY + 49);

  ctx.restore();
}

// HUD 및 UI 텍스트 폭 캐시 (매 프레임 measureText 반복 호출 방지)
const textWidthCache = new Map();
function measureTextCached(ctx, font, text) {
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
function drawFloatingActionBadge(ctx, text, centerX, topY, opts = {}) {
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

function roundRect(ctx, x, y, width, height, radius) {
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
