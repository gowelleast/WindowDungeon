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

  // 2. 다른 방들이 모두 꺼진 뒤 성검으로 빛이 모이는 연출 (성검 본체 아래쪽에 먼저 렌더링)
  if (hasLegendarySword && swordAwakenProgress > 0 && flyingSword && flyingSword.cellId === myCellId) {
    const sx = flyingSword.lx ?? CX;
    const sy = flyingSword.ly ?? CY;
    const awaken = Math.max(0.05, Math.min(1, swordAwakenProgress));

    // (2-A) 방 외곽에서 성검(sx, sy)으로 수축하며 빨려 들어가는 빛의 링 3겹
    for (let i = 0; i < 3; i++) {
      const inwardPhase = ((now * 0.0032) + i / 3) % 1;
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

