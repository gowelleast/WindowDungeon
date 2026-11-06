import { getDim, drawFloatingActionBadge } from '../utils.js';

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

