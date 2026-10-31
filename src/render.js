import { CONFIG } from './config.js';

const WALL = 20;
const DOOR_W = 80;

// 동적 캔버스 크기 대응 헬퍼
function getDim(ctx) {
  const W = ctx && ctx.canvas ? ctx.canvas.width : CONFIG.ROOM_OUTER_W;
  const H = ctx && ctx.canvas ? ctx.canvas.height : CONFIG.ROOM_OUTER_H;
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

// 바닥 석재 타일 캐시용 패턴 (오프스크린 캔버스로 1회 생성)
let floorPattern = null;
function getFloorPattern(ctx) {
  if (floorPattern) return floorPattern;
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 40;
  pCanvas.height = 40;
  const pCtx = pCanvas.getContext('2d');

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

  floorPattern = ctx.createPattern(pCanvas, 'repeat');
  return floorPattern;
}

// ----------------------------------------------------
// 🌟 플레이어 발자국 트레일 파티클 시스템
// ----------------------------------------------------
const footstepTrails = [];

export function addFootstepTrail(x, y) {
  footstepTrails.push({
    x, y,
    alpha: 0.65,
    size: Math.random() * 3 + 2.5,
    color: Math.random() > 0.4 ? '#34d399' : '#38bdf8'
  });
  if (footstepTrails.length > 35) {
    footstepTrails.shift();
  }
}

export function drawFootstepTrails(ctx) {
  ctx.save();
  for (let i = footstepTrails.length - 1; i >= 0; i--) {
    const p = footstepTrails[i];
    p.alpha -= 0.018;
    if (p.alpha <= 0) {
      footstepTrails.splice(i, 1);
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 방(Floor, Walls, Doors, Torches) 렌더링
 */
export function drawRoom(ctx, roomData, activePrompt = null) {
  const { W, H, CX, CY } = getDim(ctx);
  const now = Date.now();

  // 1. 바닥 타일 렌더링
  ctx.fillStyle = getFloorPattern(ctx);
  ctx.fillRect(0, 0, W, H);

  // 2. 바닥 비네팅
  const floorVignette = ctx.createRadialGradient(CX, CY, 60, CX, CY, Math.max(W, H) / 1.5);
  floorVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  floorVignette.addColorStop(1, 'rgba(4, 6, 9, 0.7)');
  ctx.fillStyle = floorVignette;
  ctx.fillRect(0, 0, W, H);

  // 3. 발자국 트레일 잔상 렌더링
  drawFootstepTrails(ctx);

  // 4. 3D 입체 석벽
  drawWalls(ctx);

  // 5. 문(Doors) 렌더링
  if (roomData && roomData.doors) {
    roomData.doors.forEach(dir => {
      const isTarget = activePrompt && activePrompt.dir === dir && !activePrompt.clear;
      drawDoor(ctx, dir, isTarget, now);
    });
  }

  // 6. 벽면 횃불
  getTorches(W, H).forEach(pos => {
    drawTorch(ctx, pos.x, pos.y, now);
  });
}

function drawWalls(ctx) {
  const { W, H } = getDim(ctx);

  ctx.fillStyle = '#212631';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);

  ctx.strokeStyle = '#13161c';
  ctx.lineWidth = 1.5;
  const blockSize = 40;
  for (let x = WALL; x < W - WALL; x += blockSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, WALL);
    ctx.moveTo(x, H - WALL); ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = WALL; y < H - WALL; y += blockSize) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(WALL, y);
    ctx.moveTo(W - WALL, y); ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#394150';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(WALL, WALL, W - WALL * 2, 6);
  ctx.fillRect(WALL, WALL, 6, H - WALL * 2);
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

  // 1. 고대 포탈 기단 마법진
  const pulse = Math.sin(now / 250) * 0.2 + 0.8;
  const ringColor = hasKey ? `rgba(234, 179, 8, ${pulse})` : `rgba(239, 68, 68, ${pulse * 0.7})`;

  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.shadowColor = hasKey ? '#eab308' : '#ef4444';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(targetCx, targetCy, 42, 0, Math.PI * 2);
  ctx.stroke();

  // 2. 포탈 중앙 소용돌이
  if (hasKey) {
    // [열쇠 소지]: 황금빛 활성화 포탈
    const portalGrad = ctx.createRadialGradient(targetCx, targetCy, 5, targetCx, targetCy, 38);
    portalGrad.addColorStop(0, '#ffffff');
    portalGrad.addColorStop(0.3, 'rgba(250, 204, 21, 0.85)');
    portalGrad.addColorStop(0.7, 'rgba(234, 179, 8, 0.5)');
    portalGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = portalGrad;
    ctx.beginPath();
    ctx.arc(targetCx, targetCy, 38, 0, Math.PI * 2);
    ctx.fill();

    // 탈출 안내
    ctx.font = 'bold 13px "Outfit", sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 8;
    ctx.fillText('✨ 탈출구 개방됨!', targetCx, targetCy - 52);
    ctx.font = '600 11px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('[SPACE]로 탈출', targetCx, targetCy + 56);
  } else {
    // [열쇠 미소지]: 붉은 봉인 사슬 및 자물쇠 홀로그램
    const lockedGrad = ctx.createRadialGradient(targetCx, targetCy, 5, targetCx, targetCy, 38);
    lockedGrad.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
    lockedGrad.addColorStop(0.8, 'rgba(153, 27, 27, 0.45)');
    lockedGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lockedGrad;
    ctx.beginPath();
    ctx.arc(targetCx, targetCy, 38, 0, Math.PI * 2);
    ctx.fill();

    // 🔒 자물쇠 아이콘 그리기
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', targetCx, targetCy);

    // 봉인 텍스트
    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.shadowBlur = 6;
    ctx.fillText('봉인된 탈출문', targetCx, targetCy - 50);
    ctx.font = '500 10.5px sans-serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('황금 열쇠 필요', targetCx, targetCy + 52);
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
 * 탐험가(플레이어) 렌더링
 */
export function drawPlayer(ctx, playerState) {
  const { lx, ly, facing, isStunned } = playerState;
  const radius = playerState.radius || 15;
  const now = Date.now();

  ctx.save();

  // 스턴 피격 시 깜빡임 연출
  if (isStunned && Math.floor(now / 60) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // 1. 발자국 트레일 생성 (이동 중일 때)
  if (playerState.vx !== 0 || playerState.vy !== 0) {
    addFootstepTrail(lx, ly + radius - 2);
  }

  // 2. 바닥 발밑 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(lx, ly + radius - 2, radius * 1.1, radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. 랜턴 전방 조명 빔
  drawLanternBeam(ctx, lx, ly, facing);

  // 4. 플레이어 본체
  ctx.shadowColor = isStunned ? '#f87171' : '#10b981';
  ctx.shadowBlur = 10;
  ctx.fillStyle = isStunned ? '#b91c1c' : '#059669';
  ctx.beginPath();
  ctx.arc(lx, ly, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = isStunned ? '#fca5a5' : '#34d399';
  ctx.beginPath();
  ctx.arc(lx, ly, radius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // 5. 시선 방향 지시선
  let dx = 0, dy = 0;
  if (facing === 'up') dy = -1;
  else if (facing === 'down') dy = 1;
  else if (facing === 'left') dx = -1;
  else if (facing === 'right') dx = 1;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(lx + dx * (radius + 8), ly + dy * (radius + 8));
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(lx + dx * (radius * 0.4), ly + dy * (radius * 0.4), 3, 0, Math.PI * 2);
  ctx.fill();

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
 * 방 전체 던전 조명 (다이나믹 비네팅)
 */
export function drawDungeonLighting(ctx, playerState = null) {
  const { W, H } = getDim(ctx);
  ctx.save();
  if (playerState) {
    const { lx, ly } = playerState;
    const ambientDarkness = ctx.createRadialGradient(lx, ly, 45, lx, ly, 240);
    ambientDarkness.addColorStop(0, 'rgba(4, 6, 9, 0)');
    ambientDarkness.addColorStop(0.65, 'rgba(4, 6, 9, 0.35)');
    ambientDarkness.addColorStop(1, 'rgba(4, 6, 9, 0.75)');

    ctx.fillStyle = ambientDarkness;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = 'rgba(4, 6, 9, 0.48)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/**
 * 상단 HUD 오버레이 (열쇠 소지 현황 및 음향 안내)
 */
export function drawHUD(ctx, hasKey, isMuted) {
  const { W } = getDim(ctx);
  ctx.save();

  // 1. 좌상단: 열쇠 소지 상태 배지
  const badgeW = 95;
  const badgeH = 26;
  const badgeX = 26;
  const badgeY = 26;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = hasKey ? '#eab308' : '#475569';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = hasKey ? '#eab308' : 'transparent';
  ctx.shadowBlur = hasKey ? 8 : 0;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = 'bold 11.5px "JetBrains Mono", monospace';
  ctx.fillStyle = hasKey ? '#fef08a' : '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hasKey ? '🔑 KEY: OK' : '🔑 KEY: NONE', badgeX + badgeW / 2, badgeY + badgeH / 2);

  // 2. 우상단: 사운드 상태 힌트
  const soundText = isMuted ? '🔇 MUTE' : '🔊 SFX ON';
  ctx.font = '10.5px monospace';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText(soundText, W - 28, 42);

  ctx.restore();
}

/**
 * 판타지 HUD 스타일의 문 열기 안내 프롬프트
 */
export function drawPrompt(ctx, promptData) {
  const { CX, CY } = getDim(ctx);
  ctx.save();

  const boxW = 140;
  const boxH = 68;
  const boxX = CX - boxW / 2;
  const boxY = CY - boxH / 2;

  ctx.fillStyle = 'rgba(11, 14, 20, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, keyX, keyY, keyW, keyH, 5);
  ctx.stroke();

  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE', CX, keyY + keyH / 2);

  ctx.font = '600 14px "Outfit", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('방 이동', CX, boxY + 50);

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
