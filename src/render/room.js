import {
  WALL,
  DOOR_W,
  OPPOSITE_DOOR,
  getDim,
  getTorches,
  getDirVector,
  easeOutCubic
} from './utils.js';

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
      // 다른 방들이 모두 닫힌 뒤 성검을 잡은 방에서(0 -> 1): 맵과 배경의 밝음이 성검(tx, ty)으로 우아하게 수축·흡수되며 어두워짐!
      const prog = Math.max(0, Math.min(1, swordAwakenProgress));
      const ease = prog < 0.5 ? 4 * prog * prog * prog : 1 - Math.pow(-2 * prog + 2, 3) / 2;
      const tx = swordPos ? swordPos.x : (playerState ? playerState.lx : CX);
      const ty = swordPos ? swordPos.y : (playerState ? playerState.ly : CY);
      const maxR = Math.hypot(W, H) * 0.92;
      const shrinkR = Math.max(30, maxR * (1 - ease * 0.85));
      const innerR = Math.max(8, shrinkR * 0.28);

      const absorbGrad = ctx.createRadialGradient(tx, ty, innerR, tx, ty, shrinkR);
      absorbGrad.addColorStop(0, 'rgba(254, 249, 195, 0)');
      absorbGrad.addColorStop(0.45, `rgba(15, 23, 42, ${ease * 0.35})`);
      absorbGrad.addColorStop(0.78, `rgba(6, 9, 15, ${0.08 + ease * 0.58})`);
      absorbGrad.addColorStop(1, `rgba(3, 5, 10, ${0.14 + ease * 0.72})`);

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
const activeDoorEffects = [];

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

