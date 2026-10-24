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

  // 기본 석재 톤
  pCtx.fillStyle = '#16191f';
  pCtx.fillRect(0, 0, 40, 40);

  // 석재 타일 음영 및 틈새 (Mortar)
  pCtx.strokeStyle = '#0b0d11';
  pCtx.lineWidth = 2;
  pCtx.strokeRect(0, 0, 40, 40);

  // 상단/좌측 하이라이트 (빛 반사)
  pCtx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  pCtx.fillRect(2, 2, 36, 1);
  pCtx.fillRect(2, 2, 1, 36);

  // 하단/우측 그림자
  pCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  pCtx.fillRect(2, 37, 36, 1);
  pCtx.fillRect(37, 2, 1, 36);

  // 타일 표면 미세 스펙클 질감
  pCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  pCtx.fillRect(8, 10, 14, 12);
  pCtx.fillRect(24, 22, 10, 8);

  floorPattern = ctx.createPattern(pCanvas, 'repeat');
  return floorPattern;
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

  // 2. 바닥 비네팅 (외곽으로 갈수록 자연스럽게 어두워짐)
  const floorVignette = ctx.createRadialGradient(CX, CY, 60, CX, CY, Math.max(W, H) / 1.5);
  floorVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  floorVignette.addColorStop(1, 'rgba(5, 7, 10, 0.65)');
  ctx.fillStyle = floorVignette;
  ctx.fillRect(0, 0, W, H);

  // 3. 3D 입체 석벽 (Outer Wall)
  drawWalls(ctx);

  // 4. 문(Doors / Runic Portals) 렌더링
  if (roomData && roomData.doors) {
    roomData.doors.forEach(dir => {
      const isTarget = activePrompt && activePrompt.dir === dir && !activePrompt.clear;
      drawDoor(ctx, dir, isTarget, now);
    });
  }

  // 5. 벽면 횃불(Torches) 및 동적 불꽃 렌더링
  getTorches(W, H).forEach(pos => {
    drawTorch(ctx, pos.x, pos.y, now);
  });
}

/**
 * 입체감 있는 석벽 테두리
 */
function drawWalls(ctx) {
  const { W, H } = getDim(ctx);

  // 벽 본체 (단단한 흑요석/다크 슬레이트 질감)
  ctx.fillStyle = '#232832';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);

  // 벽 블록 구분선 (Masonry Blocks)
  ctx.strokeStyle = '#15181e';
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

  // 벽 안쪽 하이라이트 베벨
  ctx.strokeStyle = '#3d4554';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  // 벽 바닥 쪽 드롭 섀도우 (입체 깊이감)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(WALL, WALL, W - WALL * 2, 6);
  ctx.fillRect(WALL, WALL, 6, H - WALL * 2);
}

/**
 * 룬 문자 포탈 스타일의 문 렌더링
 */
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

  // 1. 문 통로 깊은 심연 보이드
  ctx.fillStyle = '#06080e';
  ctx.fillRect(x, y, w, h);

  // 2. 포탈 에너지 라인 & 펄스 효과
  const pulse = Math.sin(now / 180) * 0.3 + 0.7; // 0.4 ~ 1.0
  const colorRune = isTarget ? `rgba(56, 189, 248, ${pulse})` : 'rgba(56, 189, 248, 0.4)';
  const glowBlur = isTarget ? 15 : 6;

  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = glowBlur;
  ctx.strokeStyle = colorRune;
  ctx.lineWidth = isTarget ? 3.5 : 2;

  // 문 출입선 (임계선)
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

  // 3. 문 좌우 기둥 룬스톤 (Pillars)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#475569';
  if (dir === 'up' || dir === 'down') {
    ctx.fillRect(x - 4, y, 4, h);
    ctx.fillRect(x + w, y, 4, h);
  } else {
    ctx.fillRect(x, y - 4, w, 4);
    ctx.fillRect(x, y + h, w, 4);
  }

  // 4. 활성화 상태일 때 방 안으로 흘러나오는 빛줄기
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

/**
 * 벽면 횃불 렌더링
 */
function drawTorch(ctx, tx, ty, now) {
  ctx.save();

  // 1. 횃불 브래킷 (쇠 받침대)
  ctx.fillStyle = '#475569';
  ctx.fillRect(tx - 3, ty - 3, 6, 6);

  // 2. 동적 불꽃 흔들림
  const flicker = Math.sin(now / 70 + tx) * 2;
  const flameH = 10 + Math.cos(now / 90) * 2.5;

  // 은은한 주황색 횃불 조명 반경
  const torchLight = ctx.createRadialGradient(tx, ty, 3, tx, ty, 55);
  torchLight.addColorStop(0, 'rgba(251, 146, 60, 0.22)');
  torchLight.addColorStop(0.5, 'rgba(245, 158, 11, 0.08)');
  torchLight.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = torchLight;
  ctx.beginPath();
  ctx.arc(tx, ty, 55, 0, Math.PI * 2);
  ctx.fill();

  // 3. 불꽃 코어
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

/**
 * 🚩 황금 제단 및 부유 깃발 렌더링
 */
export function drawFlag(ctx, cx, cy) {
  const dim = getDim(ctx);
  const targetCx = cx !== undefined ? cx : dim.CX;
  const targetCy = cy !== undefined ? cy : dim.CY;
  const now = Date.now();
  ctx.save();

  // 1. 바닥 고대 마법진 (Runic Altar)
  const pulse = Math.sin(now / 300) * 0.15 + 0.85;
  ctx.strokeStyle = `rgba(245, 158, 11, ${pulse * 0.5})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(targetCx, targetCy, 38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(250, 204, 21, ${pulse * 0.3})`;
  ctx.beginPath();
  ctx.arc(targetCx, targetCy, 26, 0, Math.PI * 2);
  ctx.stroke();

  // 2. 깃발 공중 부유 (Floating Bobbing)
  const hoverY = Math.sin(now / 220) * 7;
  const flagY = targetCy + hoverY;

  // 바닥 그림자 (높이에 따라 크기 변화)
  const shadowRadius = Math.max(10, 22 - hoverY);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(targetCx, targetCy + 24, shadowRadius, shadowRadius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. 깃대 (Golden Staff)
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 12;

  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(targetCx - 2, flagY - 28, 4, 48);

  // 깃대 상단 황금 보주
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(targetCx, flagY - 30, 5, 0, Math.PI * 2);
  ctx.fill();

  // 4. 휘날리는 붉은 비단 깃발 (Crimson Banner)
  const wave = Math.sin(now / 160) * 4;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(targetCx + 2, flagY - 28);
  ctx.lineTo(targetCx + 34 + wave, flagY - 18);
  ctx.lineTo(targetCx + 2, flagY - 8);
  ctx.closePath();
  ctx.fill();

  // 깃발 테두리 골드 라인
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 5. 공중 반짝이 파티클 (Sparkles)
  for (let i = 0; i < 4; i++) {
    const angle = (now / 600) + (i * Math.PI / 2);
    const dist = 32 + Math.sin(now / 300 + i) * 6;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * (dist * 0.6) + hoverY;

    ctx.fillStyle = '#fde047';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 탐험가(플레이어) 렌더링
 */
export function drawPlayer(ctx, playerState) {
  const { lx, ly, facing } = playerState;
  const radius = playerState.radius || 15;
  const now = Date.now();

  ctx.save();

  // 1. 바닥 발밑 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(lx, ly + radius - 2, radius * 1.1, radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. 랜턴 전방 조명 빔 (Sight Cone / Lantern Light)
  drawLanternBeam(ctx, lx, ly, facing);

  // 3. 플레이어 본체 (신비로운 모험가 아바타)
  // 외투/아머 베이스
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(lx, ly, radius, 0, Math.PI * 2);
  ctx.fill();

  // 이너 코어 (에메랄드/크리스탈)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(lx, ly, radius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // 4. 시선 방향 지시자 (날렵한 발광 쉐브론 조준선)
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

  // 바이저 발광 점
  ctx.fillStyle = '#f8fafc';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(lx + dx * (radius * 0.4), ly + dy * (radius * 0.4), 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 플레이어 전방 횃불/랜턴 조명 원추(Cone)
 */
function drawLanternBeam(ctx, lx, ly, facing) {
  let angle = 0;
  if (facing === 'right') angle = 0;
  else if (facing === 'down') angle = Math.PI / 2;
  else if (facing === 'left') angle = Math.PI;
  else if (facing === 'up') angle = -Math.PI / 2;

  const beamLength = 90;
  const fov = Math.PI / 3.2; // 약 56도

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
 * 방 전체의 던전 분위기 조명 (Vignette & Fog of War)
 */
export function drawDungeonLighting(ctx, playerState = null) {
  const { W, H } = getDim(ctx);
  ctx.save();
  // 플레이어가 현재 방에 있는 경우
  if (playerState) {
    const { lx, ly } = playerState;
    const ambientDarkness = ctx.createRadialGradient(lx, ly, 45, lx, ly, 230);
    ambientDarkness.addColorStop(0, 'rgba(4, 6, 9, 0)');
    ambientDarkness.addColorStop(0.7, 'rgba(4, 6, 9, 0.35)');
    ambientDarkness.addColorStop(1, 'rgba(4, 6, 9, 0.7)');

    ctx.fillStyle = ambientDarkness;
    ctx.fillRect(0, 0, W, H);
  } else {
    // 플레이어가 없는 방 (어두운 배경 대기 모드)
    ctx.fillStyle = 'rgba(4, 6, 9, 0.45)';
    ctx.fillRect(0, 0, W, H);
  }
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

  // 1. 글래스모피즘 어두운 패널
  ctx.fillStyle = 'rgba(11, 14, 20, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 20;
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();

  // 2. 네온 오라 보더
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

  // 3. 키캡 배지 [ SPACE ]
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

  // 4. 타이틀 텍스트: 방 이동
  ctx.font = '600 14px "Outfit", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('방 이동', CX, boxY + 50);

  ctx.restore();
}

/**
 * 둥근 사각형 헬퍼 함수
 */
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
