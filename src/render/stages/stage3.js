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

  // 3. 방 중앙 오브젝트 (⚡ 고대 레이저 포탑 발사대 / 💎 크리스탈 반사 프리즘 / 🗡️ 바위 제단에 꽂힌 봉인된 성검)
  if (isTargetRoom) {
    // 🗡️ 봉인된 성검 (Target Room: Sword in the Stone)
    const corePulse = Math.sin(now / 220) * 3;

    if (laserConnected) {
      // [연결 완료] 성검으로 빛이 응축되는 볼류메트릭 후광 & 원뿔형 빛기둥(God-Ray) 연출
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // (A) 부드러운 황금빛 후광 코어
      const haloR = 58 + charge * 26 + Math.sin(now / 140) * 4;
      const haloGrad = ctx.createRadialGradient(CX, CY, 3, CX, CY, haloR);
      haloGrad.addColorStop(0, `rgba(255, 255, 255, ${0.5 + charge * 0.4})`);
      haloGrad.addColorStop(0.4, `rgba(253, 224, 71, ${0.26 + charge * 0.28})`);
      haloGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(CX, CY, haloR, 0, Math.PI * 2);
      ctx.fill();

      // (B) 성검 중심으로 비치는 부드러운 원뿔형 빛기둥 (Volumetric Light Cones)
      const rayCount = 6;
      const maxRayLen = 84 - charge * 18;
      for (let i = 0; i < rayCount; i++) {
        const baseAngle = (i * Math.PI * 2 / rayCount) + (now * 0.0005 * (i % 2 === 0 ? 1 : -1));
        const spread = 0.13 + (i % 2) * 0.04;
        const rayLen = maxRayLen * (0.85 + 0.15 * Math.sin(now * 0.003 + i * 1.5));

        const x1 = CX + Math.cos(baseAngle - spread) * rayLen;
        const y1 = CY + Math.sin(baseAngle - spread) * rayLen;
        const x2 = CX + Math.cos(baseAngle + spread) * rayLen;
        const y2 = CY + Math.sin(baseAngle + spread) * rayLen;
        const midX = CX + Math.cos(baseAngle) * rayLen;
        const midY = CY + Math.sin(baseAngle) * rayLen;

        const coneAlpha = 0.22 + charge * 0.22;
        const coneGrad = ctx.createLinearGradient(CX, CY, midX, midY);
        coneGrad.addColorStop(0, `rgba(255, 255, 255, ${coneAlpha * 1.2})`);
        coneGrad.addColorStop(0.45, `rgba(254, 240, 138, ${coneAlpha * 0.65})`);
        coneGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
      }

      // (C) 경계선이 없는 부드러운 빛의 수축 파동
      for (let i = 0; i < 2; i++) {
        const ringProgress = ((now * 0.0016) + i * 0.5) % 1;
        const ringR = Math.max(10, 78 * (1 - ringProgress));
        const ringAlpha = Math.sin(ringProgress * Math.PI) * 0.32;
        const ringGrad = ctx.createRadialGradient(CX, CY, Math.max(1, ringR - 12), CX, CY, ringR + 5);
        ringGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
        ringGrad.addColorStop(0.6, `rgba(254, 249, 195, ${ringAlpha})`);
        ringGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(CX, CY, ringR + 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // [빛 연결 전] 룬스톤과 확연히 구별되는 '봉인된 성검'의 어두운 심연 결계 & 그림자 아지랑이 이펙트
      ctx.save();

      // (A) 주변 빛을 빨아들이는 듯한 짙은 심연 바닥 그림자 & 보랏빛 암흑 오라
      const abyssR = 54 + corePulse;
      const abyssGrad = ctx.createRadialGradient(CX, CY + 2, 6, CX, CY + 2, abyssR);
      abyssGrad.addColorStop(0, 'rgba(2, 6, 23, 0.95)');
      abyssGrad.addColorStop(0.5, 'rgba(49, 46, 129, 0.38)');
      abyssGrad.addColorStop(0.78, 'rgba(88, 28, 135, 0.18)');
      abyssGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = abyssGrad;
      ctx.beginPath();
      ctx.arc(CX, CY + 2, abyssR, 0, Math.PI * 2);
      ctx.fill();

      // (B) 천천히 역회전하는 이중 고대 봉인 마법진 (보라/암청색 룬 링)
      ctx.save();
      ctx.translate(CX, CY + 4);
      ctx.rotate(now * 0.0005);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.36)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 마법진 내부 6각 봉인 기하학 문양
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 1.1;
      for (let t = 0; t < 2; t++) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3 + (t * Math.PI) / 3;
          const vx = Math.cos(a) * 38;
          const vy = Math.sin(a) * 38;
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // (C) 성검 주변에서 느리게 피어오르는 어두운 그림자/영혼 입자
      const wispCount = 6;
      for (let i = 0; i < wispCount; i++) {
        const wPhase = ((now * 0.0009) + i / wispCount) % 1;
        const wAngle = (i * Math.PI * 2 / wispCount) + Math.sin(now * 0.0015 + i) * 0.35;
        const wRadius = 18 + Math.sin(wPhase * Math.PI) * 20;
        const wx = CX + Math.cos(wAngle) * wRadius;
        const wy = CY + 10 - wPhase * 34;
        const wAlpha = Math.sin(wPhase * Math.PI) * 0.55;

        const wGrad = ctx.createRadialGradient(wx, wy, 0.5, wx, wy, 7);
        wGrad.addColorStop(0, `rgba(167, 139, 250, ${wAlpha})`);
        wGrad.addColorStop(0.5, `rgba(30, 27, 75, ${wAlpha * 0.8})`);
        wGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.arc(wx, wy, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // (D) 성검 수직선상으로 어른거리는 어두운 봉인 기둥 잔광
      const sealPillar = ctx.createLinearGradient(CX - 14, CY, CX + 14, CY);
      sealPillar.addColorStop(0, 'rgba(76, 29, 149, 0)');
      sealPillar.addColorStop(0.5, `rgba(124, 58, 237, ${0.14 + Math.sin(now / 260) * 0.05})`);
      sealPillar.addColorStop(1, 'rgba(76, 29, 149, 0)');
      ctx.fillStyle = sealPillar;
      ctx.fillRect(CX - 14, CY - 42, 28, 62);

      ctx.restore();
    }

    // (C) 성검 아래 바닥 마법진 코어 링
    ctx.fillStyle = laserConnected
      ? `rgba(250, 204, 21, ${0.28 + charge * 0.38})`
      : 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.arc(CX, CY + 6, 30 + corePulse * 0.4 + charge * 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = laserConnected ? '#fde047' : 'rgba(139, 92, 246, 0.55)';
    ctx.lineWidth = laserConnected ? 2.4 : 1.6;
    ctx.shadowColor = laserConnected ? '#eab308' : '#7c3aed';
    ctx.shadowBlur = laserConnected ? 20 + charge * 16 : 10;
    ctx.beginPath();
    ctx.arc(CX, CY + 6, 28 + charge * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // (D) 고대 바위 제단 (Ancient Cracked Stone Pedestal)
    const rockY = CY + 14;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = laserConnected ? '#facc15' : '#6366f1';
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

    // 바위 제단 내부 균열 (봉인 중에는 보랏빛 심연 맥동, 레이저 연결 시 황금빛 분출!)
    ctx.strokeStyle = laserConnected ? '#fef08a' : 'rgba(167, 139, 250, 0.65)';
    ctx.lineWidth = laserConnected ? 2 : 1.3;
    ctx.shadowColor = laserConnected ? '#facc15' : '#8b5cf6';
    ctx.shadowBlur = laserConnected ? 10 : 6;
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
    } else {
      ctx.shadowColor = '#7c3aed';
      ctx.shadowBlur = 12;
    }

    // 검신 (봉인 중에는 칠흑색 흑요석 검신 + 보랏빛 테두리, 연결 시 황금빛 검신)
    ctx.fillStyle = laserConnected ? '#fef08a' : '#1e1b4b';
    ctx.strokeStyle = laserConnected ? '#ffffff' : '#a78bfa';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.lineTo(5, -18);
    ctx.lineTo(3.2, 9);
    ctx.lineTo(0, 13);
    ctx.lineTo(-3.2, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 검신 중앙 룬 능선
    ctx.strokeStyle = laserConnected ? '#ffffff' : 'rgba(196, 181, 253, 0.7)';
    ctx.lineWidth = laserConnected ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, 8);
    ctx.stroke();

    // 날개형 코등이 (Winged Crossguard)
    ctx.strokeStyle = laserConnected ? '#f59e0b' : '#818cf8';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -20);
    ctx.lineTo(0, -17);
    ctx.lineTo(14, -20);
    ctx.stroke();

    // 코등이 중앙 코어 보석
    ctx.fillStyle = laserConnected ? '#38bdf8' : '#c084fc';
    ctx.beginPath();
    ctx.arc(0, -18, 3, 0, Math.PI * 2);
    ctx.fill();

    // 검자루 (Grip) & 폼멜 (Pommel)
    ctx.strokeStyle = laserConnected ? '#b45309' : '#4c1d95';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -29);
    ctx.stroke();

    ctx.fillStyle = laserConnected ? '#fde047' : '#a78bfa';
    ctx.beginPath();
    ctx.arc(0, -31, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // 레이저 충전 중일 때 성검 전체를 감싸며 피어오르는 성광 구체
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
    ctx.fillStyle = laserConnected ? '#fef08a' : '#c4b5fd';
    ctx.fillText(laserConnected ? '✨ 성검 활성' : '🗡️ 봉인된 성검', CX, CY + 50);
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

