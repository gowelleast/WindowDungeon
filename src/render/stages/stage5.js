import { WALL, DOOR_W, getDim, roundRect, drawFloatingActionBadge } from '../utils.js';

// ----------------------------------------------------
// 👑 6-D. 심연의 마왕: 탄막 결계 & 보스 추격·성검 참격 렌더링 (Stage 5 Final Boss)
// ----------------------------------------------------
export function drawStage5BossAndArena(ctx, stage5State) {
  if (!stage5State || !stage5State.boss) return;
  const { W, H, CX, CY } = getDim(ctx);
  const {
    myCellId = null,
    roomDoors = [],
    boss = null,
    isNearBoss = false
  } = stage5State;
  const now = Date.now();

  ctx.save();

  const isBarrageHere = Boolean(
    boss.state === 'barrage' &&
    boss.barrageCellId === myCellId
  );
  const isBossHere = Boolean(
    boss.cellId === myCellId &&
    boss.state !== 'barrage'
  );

  // 1. 🔥 탄막 피하기 결계 페이즈 ('barrage'): 문 결계 봉쇄 + 4모서리 심연 포탈 + 탄막 + 타이머 게이지
  if (isBarrageHere) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);

    // (1-A) 방 테두리 붉은/보라 심연 결계선
    ctx.strokeStyle = `rgba(244, 63, 94, ${0.38 + pulse * 0.35})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(WALL + 2, WALL + 2, W - WALL * 2 - 4, H - WALL * 2 - 4);

    // (1-B) 열린 문들에 붉은 마법 결계 봉쇄막 표시
    const doorHalf = DOOR_W / 2;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#e11d48';
    ctx.shadowBlur = 10;
    for (const dir of roomDoors) {
      ctx.beginPath();
      if (dir === 'up') {
        ctx.moveTo(CX - doorHalf, WALL + 3);
        ctx.lineTo(CX + doorHalf, WALL + 3);
      } else if (dir === 'down') {
        ctx.moveTo(CX - doorHalf, H - WALL - 3);
        ctx.lineTo(CX + doorHalf, H - WALL - 3);
      } else if (dir === 'left') {
        ctx.moveTo(WALL + 3, CY - doorHalf);
        ctx.lineTo(WALL + 3, CY + doorHalf);
      } else if (dir === 'right') {
        ctx.moveTo(W - WALL - 3, CY - doorHalf);
        ctx.lineTo(W - WALL - 3, CY + doorHalf);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // (1-C) 네 모서리 심연 탄막 포탈 (4 Corner Abyssal Turret Portals)
    const corners = [
      { x: 34, y: 34 },
      { x: W - 34, y: 34 },
      { x: W - 34, y: H - 34 },
      { x: 34, y: H - 34 }
    ];
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      const spin = (now * 0.004) * (i % 2 === 0 ? 1 : -1);

      const pGrad = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 18);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.4, '#f43f5e');
      pGrad.addColorStop(0.75, 'rgba(147, 51, 234, 0.55)');
      pGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(spin);
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // (1-D) 하단 탄막 결계 남은 시간 바 & 안내 텍스트
    const barW = 176;
    const barH = 7;
    const barX = CX - barW / 2;
    const barY = H - 22;
    const remainRatio = Math.max(0, Math.min(1, 1 - (boss.barrageProgress || 0)));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = '#f43f5e';
    roundRect(ctx, barX, barY, barW * remainRatio, barH, 4);
    ctx.fill();

    ctx.font = 'bold 11.5px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fecdd3';
    ctx.shadowColor = '#be123c';
    ctx.shadowBlur = 6;
    ctx.fillText(`🔥 탄막 회피 (${boss.barrageTimeLeft || 1}s)`, CX, H - 34);
    ctx.restore();
  }

  // 2. 👑 심연의 마왕 (The Abyssal Demon King) 본체 렌더링 (추격/공격/피격/격파 페이즈)
  if (isBossHere) {
    const isHit = boss.state === 'hit';
    const isDying = boss.state === 'dying';
    const spawnProg = boss.spawnProgress ?? 1;
    const vanishProg = boss.vanishProgress ?? 0;
    const isSpawning = !isDying && !isHit && spawnProg < 0.995;
    const isVanishing = !isDying && vanishProg > 0.005;
    const showHitFlash = (isHit && vanishProg < 0.16) || isDying;

    const shakeX = showHitFlash ? (Math.random() - 0.5) * (isDying ? 12 : 6) : 0;
    const shakeY = showHitFlash ? (Math.random() - 0.5) * (isDying ? 12 : 6) : 0;
    const floatY = Math.sin(now / 200) * 4.5;
    const bx = (boss.lx ?? CX) + shakeX;
    const by = (boss.ly ?? CY) + floatY + shakeY;

    ctx.save();

    let bhScale = 0;
    if (isSpawning) {
      bhScale = spawnProg < 0.32
        ? Math.sin((spawnProg / 0.32) * (Math.PI / 2)) * 1.15
        : 1.15 * Math.pow(Math.max(0, 1 - (spawnProg - 0.32) / 0.68), 1.35);
    } else if (isVanishing) {
      bhScale = vanishProg < 0.28
        ? 0.25 + Math.sin((vanishProg / 0.28) * (Math.PI / 2)) * 0.98
        : (vanishProg < 0.78
          ? 1.23
          : 1.23 * Math.pow(Math.max(0, 1 - (vanishProg - 0.78) / 0.22), 1.5));
    }
    const tiltAngle = -0.32 + Math.sin(now * 0.0015) * 0.04;

    // (2-0) 🌑 우아한 심연의 블랙홀(Gravitational Singularity & Accretion Halo) 후면부 연출
    if ((isSpawning || isVanishing) && bhScale > 0.02) {
      ctx.save();
      ctx.translate(bx, by);

      // 1) 심연 중력장 왜곡 헤일로 (Deep Gravitational Well)
      const wellR = 76 * bhScale;
      const wellGrad = ctx.createRadialGradient(0, 0, 6 * bhScale, 0, 0, wellR);
      wellGrad.addColorStop(0, '#010005');
      wellGrad.addColorStop(0.32, '#03010a');
      wellGrad.addColorStop(0.46, 'rgba(30, 10, 60, 0.92)');
      wellGrad.addColorStop(0.62, 'rgba(126, 34, 206, 0.52)');
      wellGrad.addColorStop(0.8, 'rgba(219, 39, 119, 0.2)');
      wellGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = wellGrad;
      ctx.beginPath();
      ctx.arc(0, 0, wellR, 0, Math.PI * 2);
      ctx.fill();

      // 2) 기울어진 타원형 강착 원반 — 후면 아크
      ctx.save();
      ctx.rotate(tiltAngle);
      ctx.scale(1.48, 0.44);

      const diskRingR = 42 * bhScale;
      const diskGrad = ctx.createLinearGradient(-diskRingR, 0, diskRingR, 0);
      diskGrad.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
      diskGrad.addColorStop(0.28, 'rgba(240, 171, 252, 0.85)');
      diskGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
      diskGrad.addColorStop(0.72, 'rgba(244, 63, 94, 0.82)');
      diskGrad.addColorStop(1, 'rgba(126, 34, 206, 0.18)');

      ctx.strokeStyle = diskGrad;
      ctx.lineWidth = 6.5 * bhScale;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, diskRingR, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3) 사건의 지평선을 감싸며 완만하게 흐르는 중력 렌즈 광호
      const slowRot = now * (isVanishing ? -0.0024 : 0.0022);
      for (let i = 0; i < 2; i++) {
        const arcR = (27 + i * 6.5) * bhScale;
        const startA = slowRot + i * Math.PI;
        ctx.save();
        ctx.strokeStyle = i === 0
          ? `rgba(232, 121, 249, ${Math.min(0.78, bhScale * 0.72)})`
          : `rgba(251, 113, 133, ${Math.min(0.58, bhScale * 0.55)})`;
        ctx.lineWidth = (2.8 - i * 0.8) * bhScale;
        ctx.lineCap = 'round';
        ctx.shadowColor = i === 0 ? '#a855f7' : '#f43f5e';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, arcR, startA, startA + Math.PI * 0.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, arcR, startA + Math.PI, startA + Math.PI * 1.72);
        ctx.stroke();
        ctx.restore();
      }

      // 4) 사건의 지평선으로 고요하게 끌려 들어가는 미세 성운 입자
      const moteCount = 8;
      for (let i = 0; i < moteCount; i++) {
        const cycle = ((now * 0.0014) + i * (1 / moteCount)) % 1;
        const progress = isVanishing ? (1 - cycle) : cycle;
        const mDist = (21 + progress * 34) * bhScale;
        const mAngle = (i * Math.PI * 2 / moteCount) + (1 - progress) * 1.1 + (now * 0.0008);
        const mx = Math.cos(mAngle) * mDist;
        const my = Math.sin(mAngle) * mDist * 0.78;
        const mAlpha = Math.sin(progress * Math.PI) * Math.min(0.85, bhScale);

        ctx.fillStyle = i % 2 === 0
          ? `rgba(245, 208, 254, ${mAlpha})`
          : `rgba(253, 164, 175, ${mAlpha})`;
        ctx.beginPath();
        ctx.arc(mx, my, (1.2 + (i % 2) * 0.7) * Math.min(1.1, bhScale), 0, Math.PI * 2);
        ctx.fill();
      }

      // 5) 칠흑의 사건의 지평선 코어 & 광자 고리
      const coreR = Math.max(2, 22 * bhScale);
      ctx.fillStyle = '#020007';
      ctx.shadowColor = isVanishing ? '#f43f5e' : '#c084fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isVanishing
        ? `rgba(251, 113, 133, ${Math.min(0.92, bhScale)})`
        : `rgba(232, 121, 249, ${Math.min(0.92, bhScale)})`;
      ctx.lineWidth = 2.2 * Math.min(1.1, bhScale);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(250, 232, 255, ${Math.min(0.85, bhScale * 0.8)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.94, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 보스 본체 스케일 & 페이드 변환
    let bossScale = 1;
    let bossAlpha = 1;
    let sinkOffsetY = 0;
    if (isSpawning) {
      const easeOut = 1 - Math.pow(1 - spawnProg, 2.6);
      bossScale = Math.max(0.08, easeOut);
      bossAlpha = Math.min(1, Math.pow(spawnProg, 0.85) * 1.25);
      sinkOffsetY = (1 - easeOut) * 10;
    } else if (isVanishing) {
      const bv = Math.min(1, vanishProg / 0.86);
      const easeIn = Math.pow(1 - bv, 2.2);
      bossScale = Math.max(0, easeIn);
      bossAlpha = Math.max(0, Math.pow(1 - bv, 1.5));
      sinkOffsetY = (1 - easeIn) * 8;
    }

    if (bossScale > 0.01 && bossAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = bossAlpha;
      if (isSpawning || isVanishing) {
        ctx.translate(bx, by + sinkOffsetY);
        ctx.scale(bossScale, bossScale);
        ctx.translate(-bx, -by);
      }

      // (2-A) 바닥 심연 마법진 & 암흑 오라
      const bossAuraR = 54 + Math.sin(now / 150) * 4;
      const bGrad = ctx.createRadialGradient(bx, by, 6, bx, by, bossAuraR);
      if (showHitFlash) {
        bGrad.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
        bGrad.addColorStop(0.55, 'rgba(244, 63, 94, 0.45)');
        bGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      } else {
        bGrad.addColorStop(0, 'rgba(147, 51, 234, 0.52)');
        bGrad.addColorStop(0.6, 'rgba(225, 29, 72, 0.25)');
        bGrad.addColorStop(1, 'rgba(88, 28, 135, 0)');
      }
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, bossAuraR, 0, Math.PI * 2);
      ctx.fill();

      // 바닥 회전 룬 링
      ctx.strokeStyle = showHitFlash ? '#fef08a' : 'rgba(244, 63, 94, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -(now / 30);
      ctx.beginPath();
      ctx.arc(bx, by, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // (2-B) 마왕 주변을 공전하는 3개의 심연 마력 구체
      for (let i = 0; i < 3; i++) {
        const orbAngle = (now * 0.0035) + (i * Math.PI * 2 / 3);
        const ox = bx + Math.cos(orbAngle) * 34;
        const oy = by + Math.sin(orbAngle) * 24;
        ctx.fillStyle = showHitFlash ? '#fef08a' : '#e879f9';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // (2-C) 마왕의 망토 & 악마의 날개 실루엣
      const wingSpread = 28 + Math.sin(now / 180) * 3;
      ctx.fillStyle = showHitFlash ? '#fef08a' : '#3b0764';
      ctx.strokeStyle = showHitFlash ? '#ffffff' : '#f43f5e';
      ctx.lineWidth = 2;
      ctx.shadowColor = showHitFlash ? '#facc15' : '#e11d48';
      ctx.shadowBlur = 14;

      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.quadraticCurveTo(bx + side * 18, by - 22, bx + side * wingSpread, by - 12);
        ctx.quadraticCurveTo(bx + side * 22, by + 2, bx + side * 24, by + 14);
        ctx.quadraticCurveTo(bx + side * 12, by + 10, bx, by + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // (2-D) 마왕의 중장갑 흉갑 & 투구 코어
      ctx.fillStyle = showHitFlash ? '#ffffff' : '#0f172a';
      ctx.strokeStyle = showHitFlash ? '#facc15' : '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // (2-E) 양쪽 거대한 흑요석 마왕 뿔
      ctx.strokeStyle = showHitFlash ? '#fef08a' : '#f43f5e';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * 11, by - 11);
        ctx.quadraticCurveTo(bx + side * 23, by - 18, bx + side * 17, by - 28);
        ctx.stroke();
      }

      // (2-F) 머리 위 황금-진홍 마왕 왕관
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by - 16);
      ctx.lineTo(bx - 7, by - 25);
      ctx.lineTo(bx - 3, by - 19);
      ctx.lineTo(bx, by - 27);
      ctx.lineTo(bx + 3, by - 19);
      ctx.lineTo(bx + 7, by - 25);
      ctx.lineTo(bx + 9, by - 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // (2-G) 타오르는 두 개의 진홍빛 안광
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = showHitFlash ? '#ef4444' : '#fb7185';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * 3, by - 1);
        ctx.lineTo(bx + side * 10, by - 4);
        ctx.lineTo(bx + side * 8, by + 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // (2-0B) 🌑 블랙홀 전면부 강착 원반 & 닫힘 렌즈 섬광
    if ((isSpawning || isVanishing) && bhScale > 0.02) {
      ctx.save();
      ctx.translate(bx, by);

      ctx.save();
      ctx.rotate(tiltAngle);
      ctx.scale(1.48, 0.44);

      const diskRingR = 42 * bhScale;
      const frontGrad = ctx.createLinearGradient(-diskRingR, 0, diskRingR, 0);
      frontGrad.addColorStop(0, 'rgba(168, 85, 247, 0.15)');
      frontGrad.addColorStop(0.25, 'rgba(240, 171, 252, 0.92)');
      frontGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
      frontGrad.addColorStop(0.75, 'rgba(251, 113, 133, 0.9)');
      frontGrad.addColorStop(1, 'rgba(126, 34, 206, 0.15)');

      ctx.strokeStyle = frontGrad;
      ctx.lineWidth = 5.2 * bhScale;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, diskRingR, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.stroke();
      ctx.restore();

      if (isVanishing && vanishProg > 0.76) {
        const pinch = Math.max(0, 1 - (vanishProg - 0.76) / 0.24);
        const flareW = 48 * pinch;
        const flareGrad = ctx.createLinearGradient(-flareW, 0, flareW, 0);
        flareGrad.addColorStop(0, 'rgba(240, 171, 252, 0)');
        flareGrad.addColorStop(0.5, `rgba(255, 255, 255, ${pinch * 0.95})`);
        flareGrad.addColorStop(1, 'rgba(240, 171, 252, 0)');
        ctx.strokeStyle = flareGrad;
        ctx.lineWidth = 2.2 * pinch;
        ctx.beginPath();
        ctx.moveTo(-flareW, 0);
        ctx.lineTo(flareW, 0);
        ctx.stroke();
      }

      ctx.restore();
    }

    // (2-H) 보스 상단 체력바 & 이름 표시 (👑 보스 ❤️❤️❤️)
    ctx.shadowBlur = 0;
    if (bossAlpha > 0.15) {
      ctx.save();
      ctx.globalAlpha = bossAlpha;
      const hearts = '❤️'.repeat(Math.max(0, boss.hp)) + '🖤'.repeat(Math.max(0, boss.maxHp - boss.hp));
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fda4af';
      ctx.fillText(`👑 보스  ${hearts}`, bx, by - 42 * Math.max(0.55, bossScale));
      ctx.restore();
    }

    if (!isHit && isNearBoss && !isDying && !isVanishing) {
      const floatOffset = Math.sin(now / 120) * 2.5;
      const btnW = 132;
      const btnH = 26;
      const btnX = Math.max(8, Math.min(W - btnW - 8, bx - btnW / 2));
      const btnY = Math.min(H - 34, by + 28 + floatOffset);

      drawFloatingActionBadge(ctx, '⚔️ [SPACE] 공격', btnX + btnW / 2, btnY, {
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

    // (2-I) 보스 최후의 초신성 폭발 연출 ('dying')
    if (isDying) {
      const dProg = Math.max(0.05, Math.min(1, boss.dyingProgress || 0));
      for (let i = 0; i < 4; i++) {
        const wavePhase = ((now * 0.003) + i / 4) % 1;
        const waveR = 18 + wavePhase * 96;
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(250, 204, 21, ${(1 - wavePhase) * 0.9})`
          : `rgba(244, 63, 94, ${(1 - wavePhase) * 0.85})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by, waveR, 0, Math.PI * 2);
        ctx.stroke();
      }

      const pGrad = ctx.createRadialGradient(bx, by, 4, bx, by, 60 + dProg * 40);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.85)');
      pGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(bx, by, 60 + dProg * 40, 0, Math.PI * 2);
      ctx.fill();

      if (dProg > 0.65) {
        const flashAlpha = ((dProg - 0.65) / 0.35) * 0.5;
        ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    ctx.restore();
  }

  // 3. 💥 탄막 구체(Bullets) 렌더링
  if ((isBarrageHere || isBossHere) && Array.isArray(boss.bullets) && boss.bullets.length > 0) {
    ctx.save();
    for (const b of boss.bullets) {
      const r = b.r || 6;
      const color = b.color || '#f43f5e';

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. ⚔️ 황금 성검 초승달 참격 이펙트
  if (boss.slashEffect && boss.slashEffect.cellId === myCellId) {
    const se = boss.slashEffect;
    const prog = Math.max(0, Math.min(1, se.progress || 0));
    const alpha = Math.max(0, 1 - prog);

    ctx.save();
    ctx.translate(se.x, se.y);
    ctx.rotate(se.angle || 0);

    const arcR = 26 + prog * 28;
    ctx.strokeStyle = `rgba(250, 204, 21, ${alpha})`;
    ctx.lineWidth = 8 * alpha + 2;
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 20;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, arcR, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 4 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(-42, -18);
    ctx.lineTo(42, 18);
    ctx.moveTo(-32, 24);
    ctx.lineTo(32, -24);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

