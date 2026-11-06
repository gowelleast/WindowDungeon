import { CONFIG } from '../config.js';
import { MSG } from '../protocol.js';
import { cellId as getCellId, parseCellId } from '../grid.js';
import {
  world,
  OPPOSITE_DIR,
  getDoorPosition,
  getAdjacentCell,
  isGateClosed
} from './world.js';

function moveMonsterToward(targetX, targetY, moveSpeed) {
  const { monster } = world;
  const mdx = targetX - monster.lx;
  const mdy = targetY - monster.ly;
  const dist = Math.hypot(mdx, mdy);

  if (Math.abs(mdx) > Math.abs(mdy)) {
    monster.facing = mdx >= 0 ? 'right' : 'left';
  } else if (dist > 0.5) {
    monster.facing = mdy >= 0 ? 'down' : 'up';
  }

  if (dist <= moveSpeed + 1.5) {
    monster.lx = targetX;
    monster.ly = targetY;
    monster.vx = 0;
    monster.vy = 0;
    return true;
  }

  monster.vx = (mdx / dist) * moveSpeed;
  monster.vy = (mdy / dist) * moveSpeed;
  monster.lx += monster.vx;
  monster.ly += monster.vy;
  return false;
}

/**
 * Stage 2 전용: 몬스터의 현재 방에서 가장 가까운 미점령 방('neutral' 또는 'player' 소유 방)으로 향하는
 * 최단 경로의 첫 번째 이동 방향('up'|'down'|'left'|'right')을 BFS로 탐색합니다.
 */
function findBestStage2Dir(startScreenLabel, startGx, startGy, lastEnteredFrom) {
  const allDirs = ['up', 'down', 'left', 'right'];
  const validDirs = allDirs.filter(d => getAdjacentCell(startScreenLabel, startGx, startGy, d) !== null);
  if (validDirs.length === 0) return null;

  const orderedDirs = [
    ...validDirs.filter(d => d !== lastEnteredFrom),
    ...validDirs.filter(d => d === lastEnteredFrom)
  ];

  const visited = new Set([getCellId(startScreenLabel, startGx, startGy)]);
  const queue = [];

  for (const dir of orderedDirs) {
    const adj = getAdjacentCell(startScreenLabel, startGx, startGy, dir);
    if (!adj) continue;
    const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
    visited.add(adjId);
    if (world.flagOwners.get(adjId) !== 'monster') {
      return dir;
    }
    queue.push({ screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy, firstDir: dir });
  }

  while (queue.length > 0) {
    const curr = queue.shift();
    for (const dir of allDirs) {
      const adj = getAdjacentCell(curr.screenLabel, curr.gx, curr.gy, dir);
      if (!adj) continue;
      const adjId = getCellId(adj.screen.label, adj.gx, adj.gy);
      if (visited.has(adjId)) continue;
      visited.add(adjId);
      if (world.flagOwners.get(adjId) !== 'monster') {
        return curr.firstDir;
      }
      queue.push({ screenLabel: adj.screen.label, gx: adj.gx, gy: adj.gy, firstDir: curr.firstDir });
    }
  }

  const forwardDirs = validDirs.filter(d => d !== lastEnteredFrom);
  const pool = forwardDirs.length > 0 ? forwardDirs : validDirs;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 몬스터 AI 업데이트:
 * - Stage 1, 3, 4: 평소에는 순찰하다가 인접 방/같은 방에 플레이어가 있으면 추적(Chasing) 및 타격
 * - Stage 2: 플레이어를 쫓아다니는 대신, 더 민첩한 속도로 미점령 방('neutral'/'player') 최단 경로를 찾아
 *   방 중앙 깃발을 점령하고 다음 방으로 빠르게 넘어가는 영토 확장 우선 AI 동작
 */
export function updateMonsterAI(channel) {
  const { monster, player, currentStage } = world;
  if (!monster.cellId || world.isVictory || world.isStageTransition) return;

  const isSameRoom = (monster.cellId === player.cellId);
  const cx = CONFIG.ROOM_OUTER_W / 2;
  const cy = CONFIG.ROOM_OUTER_H / 2;

  // Stage 2: 몬스터가 방 중앙(깃발 반경 28px 이내)을 지나가면 해당 방을 적 영토('monster')로 즉시 점령!
  if (currentStage === 2 && world.flagOwners.get(monster.cellId) !== 'monster') {
    const distToCenter = Math.hypot(monster.lx - cx, monster.ly - cy);
    if (distToCenter < 28) {
      world.flagOwners.set(monster.cellId, 'monster');
      world.flagOwnersDirty = true;
      channel.send(MSG.FLAG_CAPTURED, {
        cellId: monster.cellId,
        owner: 'monster',
        activeCellId: player.cellId
      });
    }
  }

  const parsedMonsterCell = parseCellId(monster.cellId);
  const mScreenLabel = parsedMonsterCell ? parsedMonsterCell.screenLabel : '';
  const mGx = parsedMonsterCell ? parsedMonsterCell.gx : 0;
  const mGy = parsedMonsterCell ? parsedMonsterCell.gy : 0;
  const allDirs = ['up', 'down', 'left', 'right'];

  // =========================================================
  // STAGE 2 전용 AI: 플레이어 추격보다 민첩한 영토 점령 최우선!
  // =========================================================
  if (currentStage === 2) {
    monster.state = 'wandering';

    if (monster.attackCooldown > 0) {
      monster.attackCooldown--;
    }

    if (isSameRoom) {
      const distToPlayer = Math.hypot(player.lx - monster.lx, player.ly - monster.ly);
      if (distToPlayer < player.radius + monster.radius && player.invulnerableTimer <= 0 && monster.attackCooldown <= 0) {
        player.stunTimer = 12;
        player.invulnerableTimer = 65;
        monster.attackCooldown = 20;

        const angle = Math.atan2(player.ly - monster.ly, player.lx - monster.lx);
        player.kx = Math.cos(angle) * 15;
        player.ky = Math.sin(angle) * 15;
        channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
      }
    }

    if (monster.wanderCooldown > 0) {
      monster.wanderCooldown--;
      return;
    }

    const stage2MoveSpeed = monster.speed * 1.1;

    if (!monster.passedCenter || world.flagOwners.get(monster.cellId) !== 'monster') {
      const reachedCenter = moveMonsterToward(cx, cy, stage2MoveSpeed);
      if (reachedCenter) {
        monster.passedCenter = true;
        if (world.flagOwners.get(monster.cellId) !== 'monster') {
          world.flagOwners.set(monster.cellId, 'monster');
          world.flagOwnersDirty = true;
          channel.send(MSG.FLAG_CAPTURED, {
            cellId: monster.cellId,
            owner: 'monster',
            activeCellId: player.cellId
          });
        }
        monster.targetDir = findBestStage2Dir(mScreenLabel, mGx, mGy, monster.lastEnteredFrom);
      }
    } else {
      const validDirs = allDirs.filter(d => getAdjacentCell(mScreenLabel, mGx, mGy, d) !== null);
      if (validDirs.length === 0) return;

      if (!monster.targetDir || !validDirs.includes(monster.targetDir)) {
        monster.targetDir = findBestStage2Dir(mScreenLabel, mGx, mGy, monster.lastEnteredFrom);
      }

      if (monster.targetDir) {
        const doorPos = getDoorPosition(monster.targetDir, 22);
        const reachedDoor = moveMonsterToward(doorPos.x, doorPos.y, stage2MoveSpeed);
        if (reachedDoor) {
          const adj = getAdjacentCell(mScreenLabel, mGx, mGy, monster.targetDir);
          if (adj) {
            const enteredFrom = OPPOSITE_DIR[monster.targetDir];
            const entryPos = getDoorPosition(enteredFrom, 26);
            monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
            monster.lx = entryPos.x;
            monster.ly = entryPos.y;
            monster.facing = monster.targetDir;
            monster.lastEnteredFrom = enteredFrom;
            monster.targetDir = null;
            monster.passedCenter = false;
          } else {
            monster.targetDir = null;
          }
        }
      }
    }

    const mMinX = 22;
    const mMaxX = CONFIG.ROOM_OUTER_W - 22;
    const mMinY = 22;
    const mMaxY = CONFIG.ROOM_OUTER_H - 22;
    monster.lx = Math.max(mMinX, Math.min(monster.lx, mMaxX));
    monster.ly = Math.max(mMinY, Math.min(monster.ly, mMaxY));
    return;
  }

  // =========================================================
  // STAGE 1, 3, 4 공용 AI: 순찰 및 플레이어 감지 시 추격
  // =========================================================
  let dirToPlayerRoom = null;
  if (!isSameRoom) {
    for (const d of allDirs) {
      if (isGateClosed(monster.cellId, d)) continue;
      const adj = getAdjacentCell(mScreenLabel, mGx, mGy, d);
      if (adj && getCellId(adj.screen.label, adj.gx, adj.gy) === player.cellId) {
        dirToPlayerRoom = d;
        break;
      }
    }
  }

  if (isSameRoom || dirToPlayerRoom !== null) {
    monster.state = 'chasing';
  } else {
    monster.state = 'wandering';
  }

  if (isSameRoom) {
    monster.targetDir = null;
    if (monster.attackCooldown > 0) {
      monster.attackCooldown--;
      monster.vx *= 0.8;
      monster.vy *= 0.8;
      monster.lx += monster.vx;
      monster.ly += monster.vy;
    } else {
      const mdx = player.lx - monster.lx;
      const mdy = player.ly - monster.ly;
      const dist = Math.hypot(mdx, mdy);

      if (dist > 5) {
        monster.vx = (mdx / dist) * monster.speed;
        monster.vy = (mdy / dist) * monster.speed;
        monster.lx += monster.vx;
        monster.ly += monster.vy;
      }

      if (Math.abs(mdx) > Math.abs(mdy)) {
        monster.facing = mdx > 0 ? 'right' : 'left';
      } else {
        monster.facing = mdy > 0 ? 'down' : 'up';
      }

      if (dist < player.radius + monster.radius) {
        if (player.invulnerableTimer <= 0) {
          player.stunTimer = 14;
          player.invulnerableTimer = 75;
          monster.attackCooldown = 45;

          const angle = Math.atan2(player.ly - monster.ly, player.lx - monster.lx);
          player.kx = Math.cos(angle) * 16;
          player.ky = Math.sin(angle) * 16;

          monster.vx = -Math.cos(angle) * 3;
          monster.vy = -Math.sin(angle) * 3;

          channel.send(MSG.MONSTER_HIT, { activeCellId: player.cellId });
        }
      }
    }
  } else {
    if (monster.wanderCooldown > 0) {
      monster.wanderCooldown--;
      return;
    }

    if (dirToPlayerRoom) {
      if (monster.targetDir !== dirToPlayerRoom) {
        monster.targetDir = dirToPlayerRoom;
        const distFromCenter = Math.hypot(monster.lx - cx, monster.ly - cy);
        monster.passedCenter = distFromCenter < 45;
      }
    } else {
      const validDirs = allDirs.filter(
        d => getAdjacentCell(mScreenLabel, mGx, mGy, d) !== null && !isGateClosed(monster.cellId, d)
      );
      if (validDirs.length === 0) return;

      if (!monster.targetDir || !validDirs.includes(monster.targetDir)) {
        const forwardDirs = validDirs.filter(d => d !== monster.lastEnteredFrom);
        const candidateDirs = forwardDirs.length > 0 ? forwardDirs : validDirs;
        monster.targetDir = candidateDirs[Math.floor(Math.random() * candidateDirs.length)];
        monster.passedCenter = false;
      }
    }

    if (!monster.targetDir || isGateClosed(monster.cellId, monster.targetDir)) {
      monster.targetDir = null;
      return;
    }

    const moveSpeed = dirToPlayerRoom ? monster.speed * 0.85 : monster.wanderSpeed;

    if (!monster.passedCenter) {
      const reachedCenter = moveMonsterToward(cx, cy, moveSpeed);
      if (reachedCenter) {
        monster.passedCenter = true;
      }
    } else {
      const doorPos = getDoorPosition(monster.targetDir, 22);
      const reachedDoor = moveMonsterToward(doorPos.x, doorPos.y, moveSpeed);

      if (reachedDoor) {
        const adj = getAdjacentCell(mScreenLabel, mGx, mGy, monster.targetDir);
        if (adj && !isGateClosed(monster.cellId, monster.targetDir)) {
          const enteredFrom = OPPOSITE_DIR[monster.targetDir];
          const entryPos = getDoorPosition(enteredFrom, 26);
          monster.cellId = getCellId(adj.screen.label, adj.gx, adj.gy);
          monster.lx = entryPos.x;
          monster.ly = entryPos.y;
          monster.facing = monster.targetDir;
          monster.lastEnteredFrom = enteredFrom;
          monster.targetDir = null;
          monster.passedCenter = false;
        } else {
          monster.targetDir = null;
        }
      }
    }
  }

  const mMinX = 22;
  const mMaxX = CONFIG.ROOM_OUTER_W - 22;
  const mMinY = 22;
  const mMaxY = CONFIG.ROOM_OUTER_H - 22;
  monster.lx = Math.max(mMinX, Math.min(monster.lx, mMaxX));
  monster.ly = Math.max(mMinY, Math.min(monster.ly, mMaxY));
}

