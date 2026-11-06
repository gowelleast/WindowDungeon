import { getDim, drawFloatingActionBadge } from '../utils.js';

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

        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(CX - 38, yTop, 76, 22);

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(CX - 38, yMid);
        ctx.lineTo(CX + 38, yMid);
        ctx.stroke();

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

  // 2. 다른 방들이 모두 꺼진 뒤 성검으로 방 전체의 빛이 응축·흡수되는 연출 (성검 본체 아래쪽에 먼저 렌더링)
  if (hasLegendarySword && swordAwakenProgress > 0 && flyingSword && flyingSword.cellId === myCellId) {
    const sx = flyingSword.lx ?? CX;
    const sy = flyingSword.ly ?? CY;
    const t = Math.max(0.02, Math.min(1, swordAwakenProgress));
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // (2-A) 방 전체를 채우던 광원이 성검 중심으로 수축하며 밝기가 밀도 있게 응축되는 볼류메트릭 후광
    const outerHaloR = Math.max(28, 220 * (1 - ease * 0.82));
    const haloGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, outerHaloR);
    haloGrad.addColorStop(0, `rgba(255, 255, 255, ${0.5 + ease * 0.45})`);
    haloGrad.addColorStop(0.25, `rgba(254, 249, 195, ${0.42 + (1 - ease) * 0.2})`);
    haloGrad.addColorStop(0.6, `rgba(250, 204, 21, ${(1 - ease) * 0.28})`);
    haloGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, outerHaloR, 0, Math.PI * 2);
    ctx.fill();

    // (2-B) 성검으로 수렴하는 부드러운 원뿔형 빛기둥 (Volumetric God-Ray Cones — 선이 아닌 부드러운 면 광선)
    const rayCount = 6;
    const maxRayLen = Math.max(36, 190 * (1 - ease * 0.72));
    for (let i = 0; i < rayCount; i++) {
      const baseAngle = (i * Math.PI * 2 / rayCount) + (now * 0.00045 * (i % 2 === 0 ? 1 : -1));
      const spread = (0.14 + (i % 2) * 0.05) * (1 - ease * 0.35);
      const rayLen = maxRayLen * (0.85 + 0.15 * Math.sin(now * 0.003 + i * 1.7));

      const x1 = sx + Math.cos(baseAngle - spread) * rayLen;
      const y1 = sy + Math.sin(baseAngle - spread) * rayLen;
      const x2 = sx + Math.cos(baseAngle + spread) * rayLen;
      const y2 = sy + Math.sin(baseAngle + spread) * rayLen;
      const midX = sx + Math.cos(baseAngle) * rayLen;
      const midY = sy + Math.sin(baseAngle) * rayLen;

      const coneAlpha = Math.sin(t * Math.PI) * 0.26 + (1 - ease) * 0.12;
      const coneGrad = ctx.createLinearGradient(sx, sy, midX, midY);
      coneGrad.addColorStop(0, `rgba(255, 255, 255, ${coneAlpha * 1.3})`);
      coneGrad.addColorStop(0.45, `rgba(254, 240, 138, ${coneAlpha * 0.7})`);
      coneGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
    }

    // (2-C) 방 안의 빛이 성검 코어로 조용히 수축하는 소프트 링 펄스 (경계선이 없는 부드러운 빛의 파동)
    for (let i = 0; i < 2; i++) {
      const ringProgress = ((now * 0.0014) + i * 0.5) % 1;
      const ringR = Math.max(12, outerHaloR * (1 - ringProgress));
      const ringAlpha = Math.sin(ringProgress * Math.PI) * (0.35 * (1 - ease * 0.5));
      const ringGrad = ctx.createRadialGradient(sx, sy, Math.max(1, ringR - 14), sx, sy, ringR + 6);
      ringGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
      ringGrad.addColorStop(0.6, `rgba(254, 249, 195, ${ringAlpha})`);
      ringGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // (2-D) 빛이 모두 모였을 때 검신에서 날카롭게 빛나는 십자 아나모픽 렌즈 플레어
    const flareIntensity = Math.sin(t * Math.PI);
    const vLen = 30 + flareIntensity * 46;
    const hLen = 22 + flareIntensity * 34;
    const flareAlpha = 0.4 + flareIntensity * 0.55;

    const vGrad = ctx.createLinearGradient(sx, sy - vLen, sx, sy + vLen);
    vGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
    vGrad.addColorStop(0.5, `rgba(255, 255, 255, ${flareAlpha})`);
    vGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = vGrad;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 2, 2.2, vLen, 0, 0, Math.PI * 2);
    ctx.fill();

    const hGrad = ctx.createLinearGradient(sx - hLen, sy - 2, sx + hLen, sy - 2);
    hGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
    hGrad.addColorStop(0.5, `rgba(254, 249, 195, ${flareAlpha * 0.9})`);
    hGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 2, hLen, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 3. 날아다니는 자아 성검(🗡️) 및 포획된 성검 본체 렌더링
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

    // (3-B) 성검 바닥/주변 오라 링
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
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * groggyRatio);
      ctx.stroke();

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

    ctx.shadowColor = (isStunned || hasLegendarySword) ? '#facc15' : '#38bdf8';
    ctx.shadowBlur = 16;

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, -4);
    ctx.lineTo(3.5, 8);
    ctx.lineTo(-3.5, 8);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 7);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.lineTo(0, 9);
    ctx.lineTo(12, 6);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 8, 2.8, 0, Math.PI * 2);
    ctx.fill();

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

    // (3-D) 성검 상태 텍스트 (포획 전일 때만 표시, 근접 시 자동 포획되므로 별도 SPACE 배지는 생략)
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
      ctx.restore();
    }
  }

  ctx.restore();
}

