import { getDim, measureTextCached, roundRect } from './utils.js';

// ----------------------------------------------------
// 🌑 7. 스테이지 전환 페이드 오버레이 (Stage 1 -> 2 -> 3 -> 4 Cascade)
// ----------------------------------------------------
export function drawStageTransitionOverlay(ctx, transitionState) {
  if (!transitionState || transitionState.alpha <= 0.01) return;
  const { W, H, CX, CY } = getDim(ctx);
  const alpha = Math.max(0, Math.min(1, transitionState.alpha));
  const toStage = transitionState.toStage || 2;

  ctx.save();
  ctx.fillStyle = `rgba(6, 9, 15, ${alpha * 0.92})`;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 상단 타이틀
  ctx.font = 'bold 19px "Outfit", sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#eab308';
  ctx.shadowBlur = 12;
  const clearTitle = `STAGE ${toStage - 1} CLEAR`;
  ctx.fillText(clearTitle, CX, CY - 24);

  // 하단 다음 스테이지 안내
  ctx.shadowBlur = 0;
  ctx.font = 'bold 12px "Outfit", sans-serif';
  if (toStage === 5) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('👑 STAGE 5: 탄막을 피한 뒤 보스를 찾아 [SPACE]로 공격하세요', CX, CY + 14);
  } else if (toStage === 4) {
    ctx.fillStyle = '#facc15';
    ctx.fillText('🗡️ STAGE 4: 문 앞 [SPACE]로 문을 닫아 성검을 잡으세요', CX, CY + 14);
  } else if (toStage === 3) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ STAGE 3: [SPACE]로 룬스톤 오팔을 돌려 성검에 레이저를 연결하세요', CX, CY + 14);
  } else {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('💠 STAGE 2: [SPACE]로 룬스톤을 점령하세요', CX, CY + 14);
  }

  ctx.restore();
}

/**
 * 상단 HUD 오버레이 (스테이지별 목표, 아이템, 단축키 안내 및 토스트 피드백)
 */
export function drawHUD(ctx, hasKey, isMuted, lockedAlertTimer = 0, hudExtra = null) {
  const { W, CX } = getDim(ctx);
  const stage = (hudExtra && hudExtra.stage) || 1;
  const hasLegendarySword = Boolean(hudExtra && hudExtra.hasLegendarySword);
  ctx.save();

  // 1. 좌상단 외곽: 스테이지별 핵심 상태 배지
  let leftText = '';
  let borderColor = '#475569';
  let textColor = '#94a3b8';
  let glowColor = 'transparent';

  if (stage === 5) {
    const bossHp = (hudExtra && hudExtra.bossHp) ?? 3;
    const bossMaxHp = (hudExtra && hudExtra.bossMaxHp) ?? 3;
    const bossState = (hudExtra && hudExtra.bossState) || 'barrage';
    const barrageTimeLeft = (hudExtra && hudExtra.barrageTimeLeft) || 0;
    const searchTimeLeft = (hudExtra && hudExtra.searchTimeLeft) || 0;
    const hearts = '❤️'.repeat(Math.max(0, bossHp)) + '🖤'.repeat(Math.max(0, bossMaxHp - bossHp));
    if (bossHp <= 0) {
      leftText = '⚔️ S5 | 클리어';
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else if (bossState === 'barrage') {
      leftText = `⚔️ S5 | 탄막 ${barrageTimeLeft}s | 👑${hearts}`;
      borderColor = '#f43f5e';
      textColor = '#fecdd3';
      glowColor = '#e11d48';
    } else {
      leftText = `⚔️ S5 | 탐색 ${searchTimeLeft}s | 👑${hearts}`;
      borderColor = '#c084fc';
      textColor = '#f3e8ff';
      glowColor = '#9333ea';
    }
  } else if (stage === 4) {
    const isSwordTrapped = Boolean(hudExtra && hudExtra.isSwordTrapped);
    if (hasLegendarySword) {
      leftText = '🗡️ S4 | 성검 획득';
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else if (isSwordTrapped) {
      leftText = '🗡️ S4 | 성검 그로기';
      borderColor = '#facc15';
      textColor = '#fef08a';
      glowColor = '#eab308';
    } else {
      leftText = '🗡️ S4 | [SPACE] 문 닫기';
      borderColor = '#38bdf8';
      textColor = '#bae6fd';
      glowColor = '#0284c7';
    }
  } else if (stage === 3) {
    const laserConnected = Boolean(hudExtra && hudExtra.laserConnected);
    leftText = laserConnected ? '⚡ S3 | 연결 완료' : '⚡ S3 | 성검에 레이저 연결';
    borderColor = laserConnected ? '#facc15' : '#38bdf8';
    textColor = laserConnected ? '#fef08a' : '#7dd3fc';
    glowColor = laserConnected ? '#eab308' : '#0284c7';
  } else if (stage === 2) {
    const pScore = (hudExtra && hudExtra.playerScore) ?? 0;
    const mScore = (hudExtra && hudExtra.monsterScore) ?? 0;
    const timeLeft = (hudExtra && hudExtra.stage2TimeLeft) ?? 0;
    const isOvertime = Boolean(hudExtra && hudExtra.isOvertime);
    const timeLabel = isOvertime ? '⚡OVERTIME' : `⏱️${timeLeft}s`;
    leftText = `💠 S2 | 🔵${pScore} : ${mScore}🔴 | ${timeLabel}`;
    if (isOvertime) {
      borderColor = '#f59e0b';
      textColor = '#fde047';
      glowColor = '#f59e0b';
    } else if (pScore > mScore) {
      borderColor = '#38bdf8';
      textColor = '#7dd3fc';
      glowColor = '#0284c7';
    } else if (mScore > pScore) {
      borderColor = '#ef4444';
      textColor = '#fca5a5';
      glowColor = '#ef4444';
    } else {
      borderColor = '#38bdf8';
      textColor = '#e2e8f0';
    }
  } else {
    leftText = hasKey ? '🔑 KEY: OK' : '🔑 KEY: NONE';
    borderColor = hasKey ? '#eab308' : '#475569';
    textColor = hasKey ? '#fef08a' : '#94a3b8';
    glowColor = hasKey ? '#eab308' : 'transparent';
  }

  const badgeFont = 'bold 11px "JetBrains Mono", monospace';
  ctx.font = badgeFont;
  const badgeW = Math.max(114, Math.ceil(measureTextCached(ctx, badgeFont, leftText)) + 22);
  const badgeH = 22;
  const badgeX = 6;
  const badgeY = 4;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glowColor !== 'transparent' ? 8 : 0;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

  // 2. 우상단 외곽: 미니맵 및 사운드 단축키 배지
  const hintText = `🗺️ [M] MAP  |  ${isMuted ? '🔇 [U] MUTE' : '🔊 [U] SFX'}`;
  const hintFont = '10.5px "JetBrains Mono", monospace';
  ctx.font = hintFont;
  const hintW = Math.max(186, Math.ceil(measureTextCached(ctx, hintFont, hintText)) + 28);
  const hintH = 22;
  const hintX = W - 6 - hintW;
  const hintY = 4;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  roundRect(ctx, hintX, hintY, hintW, hintH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hintText, hintX + hintW / 2, hintY + hintH / 2 + 0.5);

  // 3. 상단 토스트 알림 (잠긴 문 경고 or 아이템 획득 / 깃발 점령 알림)
  if (lockedAlertTimer > 0) {
    const alpha = Math.min(1, lockedAlertTimer / 15);
    const toastW = 216;
    const toastH = 26;
    const toastX = CX - toastW / 2;
    const toastY = 32;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(69, 10, 10, 0.9)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    roundRect(ctx, toastX, toastY, toastW, toastH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.font = '600 12px "Outfit", sans-serif';
    ctx.fillStyle = '#fecaca';
    ctx.textAlign = 'center';
    ctx.fillText('🔒 열쇠가 필요합니다', CX, toastY + toastH / 2);
  } else if (hudExtra && hudExtra.toastTimer > 0 && hudExtra.toastText) {
    const alpha = Math.min(1, hudExtra.toastTimer / 15);
    const toastFont = '600 12px "Outfit", sans-serif';
    ctx.font = toastFont;
    const toastW = Math.max(220, Math.ceil(measureTextCached(ctx, toastFont, hudExtra.toastText)) + 32);
    const toastH = 26;
    const toastX = CX - toastW / 2;
    const toastY = 32;

    const toastColor = hudExtra.toastColor || '#eab308';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = toastColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = toastColor;
    ctx.shadowBlur = 10;
    roundRect(ctx, toastX, toastY, toastW, toastH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(hudExtra.toastText, CX, toastY + toastH / 2);
  }

  ctx.restore();
}

/**
 * 판타지 HUD 스타일의 문 열기 안내 프롬프트
 */
export function drawPrompt(ctx, promptData) {
  const { CX, CY } = getDim(ctx);
  const now = Date.now();
  const floatOffset = Math.sin(now / 180) * 2.5;

  ctx.save();

  const boxW = 146;
  const boxH = 68;
  const boxX = CX - boxW / 2;
  const boxY = CY - boxH / 2 + floatOffset;

  ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  roundRect(ctx, keyX, keyY, keyW, keyH, 5);
  ctx.stroke();

  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE', CX, keyY + keyH / 2);

  const dirArrow = promptData.dir === 'up' ? '↑ ' :
    promptData.dir === 'down' ? '↓ ' :
    promptData.dir === 'left' ? '← ' :
    promptData.dir === 'right' ? '→ ' : '';
  const actionLabel = promptData.willOpenNew ? `${dirArrow}방 개척` : `${dirArrow}방 이동`;

  ctx.font = '600 13.5px "Outfit", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(actionLabel, CX, boxY + 49);

  ctx.restore();
}

