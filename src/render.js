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
  // 사용자의 요청으로 지저분한 발자국 잔상 비활성화 (정갈한 던전 바닥 유지)
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

  // 3. 3D 입체 석벽 (지저분한 발자국 트레일 제거)
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
 * 탐험가(플레이어) 렌더링:
 * 몬스터처럼 귀엽고 매력적인 꼬마 에메랄드 모험가 (Chibi Adventurer) 디자인
 * - 초롱초롱한 눈망울과 볼터치, 귀여운 모험가 후드/깃털, 앙증맞은 랜턴
 * - 이동 시 통통 튀는 바운스 애니메이션
 * - 피격 시 귀여운 >_< 표정 연출
 */
export function drawPlayer(ctx, playerState) {
  const { lx, ly, facing, isStunned } = playerState;
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

  // 스턴 피격 시 깜빡임 연출
  if (isStunned && Math.floor(now / 60) % 2 === 0) {
    ctx.globalAlpha = 0.45;
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

  // 9. 손에 든 작은 황금 랜턴 (Mini Adventurer Lantern)
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
