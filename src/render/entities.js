import { getDim } from './utils.js';

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
    ctx.ellipse(lx + capeWiggle * 0.5, py + 4, radius * 0.9, radius * 0.65, 0, 0, Math.PI * 2);
  } else if (facing === 'down') {
    ctx.ellipse(lx, py + radius - 3, radius * 0.65, radius * 0.35, 0, 0, Math.PI * 2);
  } else if (facing === 'left') {
    ctx.ellipse(lx + radius * 0.4 + capeWiggle, py + 2, radius * 0.6, radius * 0.5, 0.2, 0, Math.PI * 2);
  } else if (facing === 'right') {
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
  if (isStunned) {
    // 😵 피격 시: 귀엽게 질끈 감긴 > < 표정
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx - 7, py - 1); ctx.lineTo(lx - 3, py + 1); ctx.lineTo(lx - 7, py + 3);
    ctx.stroke();
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
      ctx.beginPath(); ctx.ellipse(lx - 4.5, py + 0.5, 2.5, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + 4.5, py + 0.5, 2.5, 3.8, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(lx - 5.2, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + 3.8, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx - 3.8, py + 2, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + 5.2, py + 2, 0.6, 0, Math.PI * 2); ctx.fill();

    } else if (facing === 'left') {
      ctx.beginPath(); ctx.ellipse(lx - 6, py + 0.5, 2.5, 3.8, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx - 0.5, py + 0.5, 1.8, 3.2, -0.1, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(lx - 6.8, py - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx - 1.2, py - 1, 0.9, 0, Math.PI * 2); ctx.fill();

    } else if (facing === 'right') {
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

