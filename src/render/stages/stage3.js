import { WALL, getDim, drawFloatingActionBadge } from '../utils.js';

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
    // 🗡️ 빛을 잃은 성검 (Target Room: Sword in the Stone) & 성검 부활 빛 응축 연출
    const corePulse = Math.sin(now / 160) * 3;

    if (laserConnected) {
      // (A) 사방에서 성검 중심으로 빨려 들어오는 빛의 수축 파동 링 (3겹)
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const ringPhase = ((now * 0.0024) + rIdx / 3) % 1;
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

    // 코등이 중앙 코어 보석
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
    // ⚡ 시작 방 전용: 고대 마법 레이저 포탑 발사대 (Arcane Laser Emitter Turret)
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

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(-6, -11, 32, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-2, -14, 26, 4);
    ctx.fillRect(-2, 10, 26, 4);

    ctx.fillStyle = laserConnected ? '#fde047' : '#38bdf8';
    ctx.shadowColor = laserConnected ? '#eab308' : '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fillRect(2, -4, 24, 8);

    const muzzlePulse = Math.sin(now / 90) * 1.8 + 6.5;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = laserConnected ? '#facc15' : '#38bdf8';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(28, 0, muzzlePulse, 0, Math.PI * 2);
    ctx.fill();

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
    // 💎 중간 방 전용: 룬스톤 & 회전 오팔 반사경 (Runestone & Opal Laser Relay)
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

    // 1. 하단 고대 룬스톤 석판 베이스
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

    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-9, -12);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

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

  // 4. 코어 연결 클라이맥스 황금빛 화면 발광 오버레이
  if (laserConnected && charge > 0.7) {
    ctx.save();
    const flashAlpha = ((charge - 0.7) / 0.3) * 0.42;
    ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore();
}

