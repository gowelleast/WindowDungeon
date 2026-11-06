import { CONFIG } from '../../config.js';
import { MSG } from '../../protocol.js';
import { parseCellId } from '../../grid.js';
import {
  world,
  prepareStageGridAndSurvivingRoom,
  resetPlayerForStage,
  broadcastStageTransitionComplete,
  triggerFinalVictory
} from '../world.js';

/**
 * Stage 5 전용: 보스가 순간이동할 다음 방을 선택합니다.
 */
function pickNextBossRoom(excludeCellId) {
  const parsedFrom = parseCellId(excludeCellId);
  const candidates = world.allReachableCells.filter(c => c.id !== excludeCellId);
  if (candidates.length === 0) return excludeCellId;

  const { boss } = world;
  const visitedList = Array.isArray(boss.visitedCellIds) ? boss.visitedCellIds : [];

  const scored = candidates.map(c => {
    let score = Math.random() * 25;
    if (parsedFrom) {
      const mDist = Math.abs(c.gx - parsedFrom.gx) + Math.abs(c.gy - parsedFrom.gy);
      if (mDist === 1) score += 42;
      else if (mDist === 2) score += 40;
      else score -= mDist * 10;
    }
    if (candidates.length > 1) {
      if (c.id === boss.cellId || c.id === boss.barrageCellId) {
        score -= 80;
      } else if (visitedList.includes(c.id)) {
        score -= 55;
      }
    }
    return { id: c.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosenId = scored[0].id;
  if (!visitedList.includes(excludeCellId)) {
    visitedList.push(excludeCellId);
  }
  if (!visitedList.includes(chosenId)) {
    visitedList.push(chosenId);
  }
  boss.visitedCellIds = visitedList;
  return chosenId;
}

/**
 * Stage 5 전용: 심연의 마왕(👑) 탄막 회피 & 방 추격·성검 직격 보스전 AI 업데이트
 */
function updateStage5BossAI(channel) {
  const { boss, player } = world;
  if (world.currentStage !== 5 || world.isVictory || world.isStageTransition) return;

  const W = CONFIG.ROOM_OUTER_W;
  const H = CONFIG.ROOM_OUTER_H;
  const cx = W / 2;
  const cy = H / 2;

  if (boss.slashEffect) {
    boss.slashEffect.timer--;
    if (boss.slashEffect.timer <= 0) {
      boss.slashEffect = null;
    }
  }

  // 0. 활성 탄막 이동 및 플레이어 충돌 판정
  const activeBulletCellId = boss.state === 'barrage' ? boss.barrageCellId : boss.cellId;
  for (let i = boss.bullets.length - 1; i >= 0; i--) {
    const b = boss.bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < -16 || b.x > W + 16 || b.y < -16 || b.y > H + 16) {
      boss.bullets.splice(i, 1);
      continue;
    }

    if (player.cellId === activeBulletCellId && player.invulnerableTimer <= 0) {
      const dist = Math.hypot(player.lx - b.x, player.ly - b.y);
      if (dist < player.radius + (b.r || 6) - 2) {
        player.stunTimer = 10;
        player.invulnerableTimer = 48;
        const hitAngle = Math.atan2(player.ly - b.y, player.lx - b.x);
        player.kx = Math.cos(hitAngle) * 11;
        player.ky = Math.sin(hitAngle) * 11;
        boss.bullets.splice(i, 1);
        channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
      }
    }
  }

  // 1. 보스 체력이 0이 되어 최후의 대폭발('dying') 연출 중일 때
  if (boss.state === 'dying') {
    boss.actionTimer--;
    boss.bullets = [];
    player.invulnerableTimer = Math.max(player.invulnerableTimer, 10);
    if (boss.actionTimer <= 0) {
      triggerFinalVictory(channel);
    }
    return;
  }

  // 2. 성검 참격에 피격되어 경직('hit') 중일 때
  if (boss.state === 'hit') {
    boss.actionTimer--;
    boss.bullets = [];
    if (boss.actionTimer <= 0) {
      boss.cellId = pickNextBossRoom(player.cellId);
      boss.lx = cx;
      boss.ly = cy;
      boss.state = 'barrage';
      boss.barrageCellId = player.cellId;
      boss.barrageDuration = 150;
      boss.actionTimer = boss.barrageDuration;
      boss.patternStep = 0;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'teleport_barrage',
        activeCellId: player.cellId
      });
    }
    return;
  }

  // 3. 탄막 피하기 페이즈 ('barrage')
  if (boss.state === 'barrage') {
    boss.barrageCellId = player.cellId;
    boss.actionTimer--;

    const fireInterval = boss.hp === 3 ? 17 : boss.hp === 2 ? 14 : 11;
    const elapsed = boss.barrageDuration - boss.actionTimer;

    if (elapsed > 12 && boss.actionTimer > 15 && elapsed % fireInterval === 0) {
      const corners = [
        { x: 34, y: 34 },
        { x: W - 34, y: 34 },
        { x: W - 34, y: H - 34 },
        { x: 34, y: H - 34 }
      ];
      const step = boss.patternStep++;
      const bulletSpeed = boss.hp === 3 ? 3.1 : boss.hp === 2 ? 3.5 : 3.9;

      if (step % 2 === 0) {
        const activeCorners = [corners[step % 4], corners[(step + 2) % 4]];
        for (const c of activeCorners) {
          const baseAngle = Math.atan2(player.ly - c.y, player.lx - c.x);
          const spreadAngles = boss.hp === 1 ? [-0.26, 0, 0.26] : [-0.15, 0.15];
          for (const offset of spreadAngles) {
            const a = baseAngle + offset;
            boss.bullets.push({
              x: c.x,
              y: c.y,
              vx: Math.cos(a) * bulletSpeed,
              vy: Math.sin(a) * bulletSpeed,
              r: 6,
              color: '#f43f5e'
            });
          }
        }
      } else {
        for (let idx = 0; idx < 4; idx++) {
          const c = corners[idx];
          const toCenter = Math.atan2(cy - c.y, cx - c.x);
          const waveOffset = Math.sin(step * 0.75 + idx) * 0.42;
          const a = toCenter + waveOffset;
          boss.bullets.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * (bulletSpeed * 0.92),
            vy: Math.sin(a) * (bulletSpeed * 0.92),
            r: 5.5,
            color: '#c084fc'
          });
        }
      }

      channel.send(MSG.BOSS_ATTACK, {
        activeCellId: player.cellId,
        silent: step % 2 !== 0
      });
    }

    if (boss.actionTimer <= 0) {
      boss.bullets = [];
      boss.state = 'searching';
      boss.searchDuration = 330;
      boss.searchTimer = boss.searchDuration;

      if (!boss.cellId || boss.cellId === player.cellId) {
        boss.cellId = pickNextBossRoom(player.cellId);
      }
      boss.lx = cx;
      boss.ly = cy;
      boss.spawnTimer = 24;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'search_start',
        activeCellId: player.cellId
      });
    }
    return;
  }

  // 4. 보스 추격 & 성검 공격 페이즈 ('searching')
  if (boss.state === 'searching') {
    boss.searchTimer--;
    if (boss.spawnTimer > 0) {
      boss.spawnTimer--;
    }

    if (player.cellId === boss.cellId) {
      boss.lx = cx + Math.cos(world.tickCount * 0.06) * 28;
      boss.ly = cy + Math.sin(world.tickCount * 0.08) * 18;

      if (boss.spawnTimer <= 8 && boss.searchTimer > 20) {
        const distToBoss = Math.hypot(player.lx - boss.lx, player.ly - boss.ly);
        if (distToBoss < player.radius + 22 && player.invulnerableTimer <= 0) {
          player.stunTimer = 10;
          player.invulnerableTimer = 45;
          const angle = Math.atan2(player.ly - boss.ly, player.lx - boss.lx);
          player.kx = Math.cos(angle) * 12;
          player.ky = Math.sin(angle) * 12;
          channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
        }

        if (world.tickCount % 36 === 0) {
          const baseAngle = Math.atan2(player.ly - boss.ly, player.lx - boss.lx);
          for (const offset of [-0.32, 0, 0.32]) {
            const a = baseAngle + offset;
            boss.bullets.push({
              x: boss.lx,
              y: boss.ly,
              vx: Math.cos(a) * 2.9,
              vy: Math.sin(a) * 2.9,
              r: 6,
              color: '#e879f9'
            });
          }
        }
      }
    } else {
      boss.lx = cx;
      boss.ly = cy;
      boss.bullets = [];
    }

    if (boss.searchTimer <= 0) {
      if (boss.cellId === player.cellId) {
        boss.cellId = pickNextBossRoom(player.cellId);
      }
      boss.state = 'barrage';
      boss.barrageCellId = player.cellId;
      boss.barrageDuration = 150;
      boss.actionTimer = boss.barrageDuration;
      boss.bullets = [];
      boss.patternStep = 0;

      channel.send(MSG.BOSS_WARNING, {
        phase: 'timeout_barrage',
        activeCellId: player.cellId
      });
    }
  }
}

export const stage5Controller = {
  stage: 5,

  init(channel, startCell) {
    const { cx, cy } = prepareStageGridAndSurvivingRoom(startCell, 5);
    world.hasLegendarySword = true;
    world.closedGates.clear();
    world.monster.cellId = null;

    resetPlayerForStage(startCell.id, cx, cy + 20);

    const { boss } = world;
    boss.hp = 3;
    boss.maxHp = 3;
    boss.cellId = null;
    boss.barrageCellId = startCell.id;
    boss.visitedCellIds = [startCell.id];
    boss.cellId = pickNextBossRoom(startCell.id);
    boss.lx = cx;
    boss.ly = cy;
    boss.state = 'barrage';
    boss.barrageDuration = 150;
    boss.actionTimer = 150;
    boss.searchDuration = 330;
    boss.searchTimer = 330;
    boss.spawnTimer = 0;
    boss.patternStep = 0;
    boss.bullets = [];
    boss.slashEffect = null;

    console.log(
      `[Master] Stage 5 최종 보스전 시작! 시작 방(${startCell.id}) 탄막 피하기 발동, 보스(👑 HP ${boss.hp}/${boss.maxHp}) 은신 위치: ${boss.cellId}`
    );

    broadcastStageTransitionComplete(channel, startCell, 4, 5);
  },

  onRoomDiscovered() {},
  onDoorConfirm() {},

  update(channel, { spaceJustPressed }) {
    const { boss, player } = world;
    let isNearBoss = false;

    updateStage5BossAI(channel);

    if (boss.state === 'searching' && boss.cellId && player.cellId === boss.cellId) {
      const distToBoss = Math.hypot(player.lx - boss.lx, player.ly - boss.ly);
      isNearBoss = distToBoss < 76;

      if (isNearBoss && spaceJustPressed) {
        boss.hp = Math.max(0, boss.hp - 1);
        boss.bullets = [];
        boss.slashEffect = {
          cellId: player.cellId,
          x: boss.lx,
          y: boss.ly,
          angle: Math.atan2(boss.ly - player.ly, boss.lx - player.lx),
          timer: 20,
          maxTimer: 20
        };

        player.invulnerableTimer = Math.max(player.invulnerableTimer, 30);

        if (boss.hp <= 0) {
          boss.state = 'dying';
          boss.actionTimer = 52;
        } else {
          boss.state = 'hit';
          boss.actionTimer = 28;
        }

        console.log(`[Master] ⚔️ 성검 참격 적중! 보스 남은 체력: ${boss.hp}/${boss.maxHp}`);
        channel.send(MSG.BOSS_HIT, {
          fromCellId: player.cellId,
          bossCellId: boss.cellId,
          hp: boss.hp,
          maxHp: boss.maxHp,
          isDefeated: boss.hp <= 0,
          activeCellId: player.cellId
        });
      }
    }

    return { shouldReturn: false, isNearBoss };
  }
};

