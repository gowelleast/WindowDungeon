import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import {
  setupHiDPICanvas,
  drawRoom,
  drawPlayer,
  drawPrompt,
  drawKey,
  drawExitPortal,
  drawGoldenRoomItem,
  drawTerritoryFlag,
  drawStage3LaserAndNode,
  drawStage4ForgeAndSword,
  drawStage5BossAndArena,
  drawStageTransitionOverlay,
  drawMonster,
  drawDungeonLighting,
  drawDoorTransitionEffects,
  triggerDoorTransitionEffect,
  hasActiveDoorTransition,
  drawHUD
} from './render.js';
import { CONFIG, computeDynamicRoomSize } from './config.js';
import { MultiScreenConfetti } from './confetti.js';
import { sound } from './sound.js';
import { initMinimap, togglePipMinimap } from './minimap.js';

// window.open의 두 번째 인자가 window.name으로 자동 설정되므로 이를 최우선으로 사용합니다.
const hashParams = new URLSearchParams(window.location.hash.substring(1));
let winId = window.name;
if (!winId || winId === '') {
  winId = hashParams.get('winId');
}
if (!winId) winId = 'room-' + Math.floor(Math.random() * 10000);

// 해상도에 맞춘 동적 방 크기(w, h) 및 슬롯 크기(slotW, slotH), 음소거 상태 동기화 적용
const initSizing = computeDynamicRoomSize(window.screen.availWidth, window.screen.availHeight);
const dynamicW = parseInt(hashParams.get('w'), 10) || initSizing.roomW;
const dynamicH = parseInt(hashParams.get('h'), 10) || initSizing.roomH;
CONFIG.ROOM_OUTER_W = dynamicW;
CONFIG.ROOM_OUTER_H = dynamicH;
CONFIG.ROOM_SLOT_W = initSizing.slotW;
CONFIG.ROOM_SLOT_H = initSizing.slotH;

const isMutedParam = hashParams.get('muted');
if (isMutedParam !== null) {
  sound.setMute(isMutedParam === '1');
}

window.name = winId;
document.title = (winId === 'lobby') ? 'Window Dungeon — Lobby' : `Room: ${winId}`;

const channel = new DungeonChannel(winId);

// 미니맵 동기화 리스너 활성화 (방 창에서도 PiP 전술 레이더 즉시 오픈 가능)
const disposeMinimap = initMinimap(channel);

const canvas = document.getElementById('game-canvas');
const ctx = setupHiDPICanvas(canvas, dynamicW, dynamicH);

let myCellId = null;
let roomData = null;
let currentPrompt = null;
let isVictory = false;
let confetti = null;

let currentStage = 1;
let isExitRoom = false;
let isKeyRoom = false;
let isGoldenRoom = false;
let goldenItemType = 'map';
let goldenItemCollected = false;
let hasKey = false;
let hasMapItem = false;
let hasBootsItem = false;
let myFlagOwner = 'neutral';

// Stage 3 레이저 퍼즐 상태
let laserSourceCellId = null;
let laserTargetCellId = null;
let myPrismDir = null;
let myLaserSegment = null;
let laserConnected = false;

// Stage 4 도망치는 성검 & 철창 레버 상태
let myClosedDoors = [];
let latestFlyingSword = null;
let hasLegendarySword = false;

// Stage 5 심연의 마왕 최종 보스전 상태
let latestBoss = null;
let victoryTimestamp = 0;

let latestMonster = null;
let latestTickData = null;
let wasPlayerHere = false;
let wasMonsterHere = false;
let lockedAlertTimer = 0;
let toastTimer = 0;
let toastText = '';
let toastColor = '#eab308';
let isClosingByCascade = false;
let isAudioHost = (winId === 'lobby');

const stageTransition = {
  active: false,
  phase: 'none', // 'none' | 'fadeOut' | 'fadeIn'
  alpha: 0,
  toStage: 2
};

let pendingRafId = null;
let lastHandledTransitionId = 0;
let lastLocalDepartTime = 0;

function checkDoorTransitionEvent(transition) {
  if (!transition || !myCellId) return;
  if (transition.id <= lastHandledTransitionId) return;
  if (Date.now() - transition.timestamp > 800) return;

  if (myCellId === transition.toCellId) {
    lastHandledTransitionId = transition.id;
    triggerDoorTransitionEffect('arrive', transition.dir);
    scheduleRender();
  } else if (myCellId === transition.fromCellId) {
    lastHandledTransitionId = transition.id;
    if (performance.now() - lastLocalDepartTime > 300) {
      triggerDoorTransitionEffect('depart', transition.dir);
      scheduleRender();
    }
  }
}

function renderFrame() {
  pendingRafId = null;
  if (isVictory) return;

  if (stageTransition.phase === 'fadeOut') {
    stageTransition.alpha = Math.min(1, stageTransition.alpha + 0.08);
  } else if (stageTransition.phase === 'fadeIn') {
    stageTransition.alpha = Math.max(0, stageTransition.alpha - 0.06);
    if (stageTransition.alpha <= 0) {
      stageTransition.active = false;
      stageTransition.phase = 'none';
    }
  }

  const isPlayerHere = Boolean(myCellId && latestTickData && latestTickData.activeCellId === myCellId);

  // 1. 방 바닥, 벽, 문 렌더링 (스테이지별 테마, 황금방, Stage 2 영토, Stage 3 레이저, 또는 Stage 4 성소/오라 포함)
  const isSwordHere = Boolean(currentStage === 4 && latestFlyingSword && latestFlyingSword.cellId === myCellId);
  const swordAwakenProgress = (latestTickData && latestTickData.swordAwakenProgress) || 0;
  drawRoom(ctx, roomData, isPlayerHere ? currentPrompt : null, {
    stage: currentStage,
    isGoldenRoom: (currentStage === 1 && isGoldenRoom),
    flagOwner: (currentStage === 2) ? myFlagOwner : null,
    hasLaserBeam: (currentStage === 3 && Boolean(myLaserSegment)),
    isLaserConnected: (currentStage === 3 && laserConnected),
    hasForgeAura: isSwordHere && !hasLegendarySword,
    hasLegendarySword: (currentStage === 4 && hasLegendarySword && isSwordHere),
    swordAwakenProgress
  });

  // 2~3. 스테이지별 중앙 오브젝트 렌더링
  if (currentStage === 1) {
    if (isExitRoom) {
      drawExitPortal(ctx, hasKey);
    }
    if (isKeyRoom && !hasKey) {
      drawKey(ctx);
    }
    if (isGoldenRoom) {
      drawGoldenRoomItem(ctx, goldenItemType, goldenItemCollected);
    }
  } else if (currentStage === 2) {
    const isNearFlag = Boolean(isPlayerHere && latestTickData && latestTickData.isNearFlag);
    drawTerritoryFlag(ctx, myFlagOwner, isNearFlag);
  } else if (currentStage === 3) {
    const isNearPrism = Boolean(isPlayerHere && latestTickData && latestTickData.isNearPrism);
    drawStage3LaserAndNode(ctx, {
      isSourceRoom: (myCellId === laserSourceCellId),
      isTargetRoom: (myCellId === laserTargetCellId),
      prismDir: myPrismDir,
      segment: myLaserSegment,
      laserConnected,
      laserChargeProgress: (latestTickData && latestTickData.laserChargeProgress) || 0,
      isNearPrism
    });
  } else if (currentStage === 4) {
    drawStage4ForgeAndSword(ctx, {
      myCellId,
      roomDoors: (roomData && Array.isArray(roomData.doors)) ? roomData.doors : [],
      closedDoors: myClosedDoors,
      nearestGateDir: isPlayerHere && latestTickData ? latestTickData.nearestGateDir : null,
      isNearTrappedSword: Boolean(isPlayerHere && latestTickData && latestTickData.isNearTrappedSword),
      flyingSword: latestFlyingSword,
      hasLegendarySword,
      swordAwakenProgress: (latestTickData && latestTickData.swordAwakenProgress) || 0
    });
  } else if (currentStage === 5) {
    drawStage5BossAndArena(ctx, {
      myCellId,
      roomDoors: (roomData && Array.isArray(roomData.doors)) ? roomData.doors : [],
      boss: latestBoss,
      isNearBoss: Boolean(isPlayerHere && latestTickData && latestTickData.isNearBoss)
    });
  }

  // 4. 그림자 몬스터 렌더링 (몬스터가 이 방에 있을 때)
  if (myCellId && latestMonster && latestMonster.cellId === myCellId) {
    drawMonster(ctx, latestMonster);
  }

  // 5. 플레이어 및 스테이지별 다이나믹 조명 렌더링
  const lightingOpts = {
    stage: currentStage,
    hasLaserBeam: (currentStage === 3 && Boolean(myLaserSegment)),
    isLaserConnected: (currentStage === 3 && laserConnected),
    hasLegendarySword: (currentStage === 4 && hasLegendarySword && isSwordHere),
    swordAwakenProgress,
    swordPos: (currentStage === 4 && isSwordHere && latestFlyingSword)
      ? { x: latestFlyingSword.lx, y: latestFlyingSword.ly }
      : null
  };
  if (isPlayerHere) {
    drawPlayer(ctx, latestTickData);
    drawDungeonLighting(ctx, latestTickData, lightingOpts);
    if (currentPrompt) drawPrompt(ctx, currentPrompt);
  } else {
    drawDungeonLighting(ctx, null, lightingOpts);
  }

  // 6. 크로스 윈도우 문 통과 전환 파티클 이펙트 (출발 창 & 도착 창 동시 연출)
  drawDoorTransitionEffects(ctx);

  // 7. 상단 HUD (스테이지 상태, 아이템, 스코어, 타이머 및 토스트 알림)
  drawHUD(ctx, hasKey, sound.isMuted, isPlayerHere ? lockedAlertTimer : 0, {
    stage: currentStage,
    hasMapItem,
    hasBootsItem,
    hasLegendarySword,
    playerScore: (latestTickData && latestTickData.playerScore) ?? 0,
    monsterScore: (latestTickData && latestTickData.monsterScore) ?? 0,
    stage2TimeLeft: (latestTickData && latestTickData.stage2TimeLeft) ?? 20,
    isOvertime: Boolean(latestTickData && latestTickData.isOvertime),
    laserConnected,
    isSwordTrapped: Boolean(
      latestFlyingSword &&
      (latestFlyingSword.state === 'trapped' || latestFlyingSword.state === 'groggy')
    ),
    bossHp: (latestBoss && latestBoss.hp) ?? 3,
    bossMaxHp: (latestBoss && latestBoss.maxHp) ?? 3,
    bossState: (latestBoss && latestBoss.state) || 'barrage',
    barrageTimeLeft: (latestBoss && latestBoss.barrageTimeLeft) || 0,
    searchTimeLeft: (latestBoss && latestBoss.searchTimeLeft) || 0,
    toastTimer: isPlayerHere ? toastTimer : 0,
    toastText,
    toastColor
  });

  // 8. Stage 1 -> Stage 2 전환 페이드 오버레이
  if (stageTransition.active || stageTransition.alpha > 0) {
    drawStageTransitionOverlay(ctx, stageTransition);
  }
}

function scheduleRender() {
  if (pendingRafId === null) {
    pendingRafId = requestAnimationFrame(renderFrame);
  }
}

// 창 생성 즉시 첫 프레임을 동기 렌더링하여 빈 화면(흰 화면) 노출 방지
renderFrame();

// 유저 첫 클릭/인터랙션 시 오디오 컨텍스트 및 앰비언트 드론 활성화
const activateAudio = () => {
  sound.init();
  if (isAudioHost) {
    sound.startAmbient();
  }
};
window.addEventListener('click', activateAudio, { once: true });
window.addEventListener('keydown', activateAudio, { once: true });

// 1. 인사 (핸드쉐이크 및 브라우저 창 오버헤드 실측값 즉시 전송 + 폴백 재시도)
function sendHello() {
  const overheadY = window.outerHeight - window.innerHeight;
  const overheadX = window.outerWidth - window.innerWidth;
  channel.send(MSG.HELLO, {
    winId,
    overheadY: (overheadY > 0) ? overheadY : undefined,
    overheadX: (overheadX > 0) ? overheadX : undefined
  });
}
sendHello();
let helloTimer = setInterval(sendHello, 40);

// 2. 메시지 수신
channel.on(MSG.ASSIGN, (data) => {
  if (data.winId === winId) {
    if (helloTimer) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
    myCellId = data.id;
    roomData = data;
    currentStage = data.stage || currentStage;
    isExitRoom = !!data.isExitRoom;
    isKeyRoom = !!data.isKeyRoom;
    isGoldenRoom = !!data.isGoldenRoom;
    if (data.goldenItemType) goldenItemType = data.goldenItemType;
    if (data.goldenItemCollected !== undefined) goldenItemCollected = !!data.goldenItemCollected;
    hasKey = !!data.hasKey;
    if (data.hasMapItem !== undefined) hasMapItem = !!data.hasMapItem;
    if (data.hasBootsItem !== undefined) hasBootsItem = !!data.hasBootsItem;
    if (data.flagOwner) myFlagOwner = data.flagOwner;
    if (data.laserSourceCellId !== undefined) laserSourceCellId = data.laserSourceCellId;
    if (data.laserTargetCellId !== undefined) laserTargetCellId = data.laserTargetCellId;
    if (data.prismDir !== undefined) myPrismDir = data.prismDir;
    if (data.laserConnected !== undefined) laserConnected = !!data.laserConnected;
    if (Array.isArray(data.closedDoors)) myClosedDoors = data.closedDoors;
    if (data.hasLegendarySword !== undefined) hasLegendarySword = !!data.hasLegendarySword;

    if (data.isMuted !== undefined) {
      sound.setMute(data.isMuted);
    }
    if (data.doorTransition) {
      checkDoorTransitionEvent(data.doorTransition);
    }

    scheduleRender();
  }
});

// Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 순차 창 닫기(Cascade) 수신
channel.on(MSG.CLOSE_ROOM, (data) => {
  if (data && data.targetWinId === winId) {
    isClosingByCascade = true;
    sound.stopAmbient();
    disposeMinimap();
    window.close();
  }
});

function clearStage1RoomFlags() {
  isExitRoom = false;
  isKeyRoom = false;
  isGoldenRoom = false;
}

// 스테이지 전환 연출 수신 (남아있는 E 방 페이드아웃 -> 페이드인)
channel.on(MSG.STAGE_TRANSITION, (data) => {
  if (!data) return;
  if (data.phase === 'start') {
    stageTransition.toStage = data.toStage || 2;
    if (data.activeWinId === winId || data.activeCellId === myCellId) {
      isAudioHost = true;
      sound.playVictory();
      stageTransition.active = true;
      stageTransition.phase = 'fadeOut';
      scheduleRender();
    }
  } else if (data.phase === 'complete') {
    currentStage = data.toStage || 2;
    stageTransition.toStage = currentStage;
    clearStage1RoomFlags();
    myFlagOwner = 'neutral';
    myLaserSegment = null;
    laserConnected = false;
    myClosedDoors = [];
    latestFlyingSword = null;
    latestBoss = null;
    if (data.activeWinId === winId || data.activeCellId === myCellId) {
      isAudioHost = true;
      sound.startAmbient();
      stageTransition.active = true;
      stageTransition.phase = 'fadeIn';
      if (currentStage === 5) {
        toastText = 'STAGE 5: 탄막을 피한 뒤 보스를 찾아 공격하세요';
        toastColor = '#f87171';
      } else if (currentStage === 4) {
        toastText = 'STAGE 4: [SPACE]로 문을 닫아 성검을 막으세요';
        toastColor = '#facc15';
      } else if (currentStage === 3) {
        toastText = 'STAGE 3: 프리즘을 돌려 성검에 레이저를 연결하세요';
        toastColor = '#38bdf8';
      } else {
        toastText = 'STAGE 2: [SPACE]로 깃발을 점령하세요';
        toastColor = '#34d399';
      }
      toastTimer = 85;
      try { window.focus(); } catch (e) { }
    }
    scheduleRender();
  }
});

function executeDoorTransition(promptData) {
  if (!promptData || promptData.clear) return false;

  const isActive = navigator.userActivation ? navigator.userActivation.isActive : 'unknown';
  console.log(`[AutoDoor] 문 통과 시도 (willOpenNew: ${promptData.willOpenNew}, userActivation.isActive: ${isActive})`);

  let actualRect = null;
  let openedWin = null;

  if (promptData.willOpenNew) {
    const { targetWinId, rect, dir } = promptData;
    const w = Math.round((rect && rect.width) || dynamicW);
    const h = Math.round((rect && rect.height) || dynamicH);

    // 현재 방 창의 실제 화면 좌표 및 물리 크기 측정
    const curX = (typeof window.screenX === 'number' && !isNaN(window.screenX)) ? window.screenX : (window.screenLeft || 0);
    const curY = (typeof window.screenY === 'number' && !isNaN(window.screenY)) ? window.screenY : (window.screenTop || 0);
    const curW = window.outerWidth || w;
    const curH = window.outerHeight || h;

    // Master가 화면 해상도에 맞춰 균등 분할 계산한 정규 N*M 그리드 좌표(rect)를 최우선 적용
    let targetLeft = (rect && typeof rect.left === 'number') ? rect.left : curX;
    let targetTop = (rect && typeof rect.top === 'number') ? rect.top : curY;

    if (!rect) {
      if (dir === 'right') targetLeft = curX + curW;
      else if (dir === 'left') targetLeft = curX - curW;
      else if (dir === 'down') targetTop = curY + curH;
      else if (dir === 'up') targetTop = curY - curH;
    }

    targetLeft = Math.round(targetLeft);
    targetTop = Math.round(targetTop);
    actualRect = { left: targetLeft, top: targetTop, width: w, height: h };

    const features = `popup=yes,resizable=no,width=${w},height=${h},left=${targetLeft},top=${targetTop}`;
    openedWin = window.open(`./room.html#winId=${targetWinId}&w=${w}&h=${h}&muted=${sound.isMuted ? 1 : 0}`, targetWinId, features);
  } else {
    openedWin = window.open('', promptData.targetWinId);
    if (openedWin) openedWin.focus();
  }

  if (!openedWin) {
    console.warn('[AutoDoor] 브라우저 팝업 차단으로 자동 창 열기가 거부되었습니다. [Space] 키를 눌러주세요.');
    return false;
  }

  keys.clear();
  channel.send(MSG.INPUT, { keys: [] });
  sound.playDoorPass();

  // 출발 창 문에서 즉시 다음 창 방향으로 빨려 들어가는 공간 전이 이펙트 실행
  lastLocalDepartTime = performance.now();
  triggerDoorTransitionEffect('depart', promptData.dir);
  scheduleRender();

  channel.send(MSG.DOOR_CONFIRM, {
    winId,
    dir: promptData.dir,
    targetWinId: promptData.targetWinId,
    actualRect
  });
  currentPrompt = null;
  return true;
}

channel.on(MSG.DOOR_PROMPT, (data) => {
  if (data.activeCellId === myCellId) {
    if (data.clear) {
      currentPrompt = null;
      scheduleRender();
    } else {
      currentPrompt = data;
      // 스페이스바 없이 문에 닿는 즉시 자동 방 이동 시도
      const moved = executeDoorTransition(data);
      if (!moved) {
        scheduleRender();
      }
    }
  }
});

// 사운드 및 상호작용 피드백 이벤트
channel.on(MSG.KEY_COLLECTED, (data) => {
  hasKey = true;
  if (!data || !data.activeCellId || data.activeCellId === myCellId) {
    sound.playKey();
    toastText = '🔑 열쇠 획득';
    toastColor = '#eab308';
    toastTimer = 55;
  }
  scheduleRender();
});

channel.on(MSG.ITEM_COLLECTED, (data) => {
  goldenItemCollected = true;
  if (data && data.hasMapItem !== undefined) hasMapItem = !!data.hasMapItem;
  if (data && data.hasBootsItem !== undefined) hasBootsItem = !!data.hasBootsItem;
  if (data && data.activeCellId === myCellId) {
    sound.playItemPickup();
    toastText = data.itemType === 'boots'
      ? '👢 신발 획득 (이동 속도 증가)'
      : '🗺️ 지도 획득 (전체 맵 표시)';
    toastColor = '#facc15';
    toastTimer = 75;
  }
  scheduleRender();
});

channel.on(MSG.FLAG_CAPTURED, (data) => {
  if (!data) return;
  if (data.cellId === myCellId) {
    myFlagOwner = data.owner;
  }
  if (data.activeCellId === myCellId) {
    sound.playFlagCapture(data.owner === 'player');
    if (data.owner === 'player') {
      toastText = '💠 룬스톤 점령';
      toastColor = '#38bdf8';
      toastTimer = 38;
    } else if (data.cellId === myCellId) {
      toastText = '🔴 적에게 점령당함';
      toastColor = '#ef4444';
      toastTimer = 38;
    }
  }
  scheduleRender();
});

channel.on(MSG.LASER_ROTATED, (data) => {
  if (!data) return;
  if (data.cellId === myCellId && data.dir) {
    myPrismDir = data.dir;
  }
  if (data.connected) {
    laserConnected = true;
  }
  if (data.activeCellId === myCellId) {
    if (data.connected) {
      sound.playLaserConnect();
    } else {
      sound.playPrismRotate();
    }
  }
  scheduleRender();
});

channel.on(MSG.GATE_TOGGLED, (data) => {
  if (!data) return;
  if (data.activeCellId === myCellId) {
    sound.playGateToggle(Boolean(data.isClosed));
    toastText = data.isClosed ? '🔒 문 닫힘' : '🔓 문 열림';
    toastColor = data.isClosed ? '#f87171' : '#34d399';
    toastTimer = 38;
  }
  scheduleRender();
});

channel.on(MSG.SWORD_BOUNCED, (data) => {
  if (!data) return;
  const isPlayerInThisRoom = Boolean(myCellId && latestTickData && latestTickData.activeCellId === myCellId);
  if (isPlayerInThisRoom) {
    sound.playSwordBounce(true);
    toastText = '💫 성검 그로기 — 지금 잡으세요';
    toastColor = '#facc15';
    toastTimer = 75;
  }
  scheduleRender();
});

channel.on(MSG.SWORD_DRAWN, (data) => {
  hasLegendarySword = true;
  if (!data || data.activeCellId === myCellId) {
    if (data && data.phase === 'absorbing') {
      sound.playLaserConnect();
    } else {
      sound.playSwordDraw();
      toastText = '🗡️ 성검 획득';
      toastColor = '#fef08a';
      toastTimer = 75;
    }
  }
  scheduleRender();
});

channel.on(MSG.BOSS_WARNING, (data) => {
  if (!data) return;
  const isPlayerInThisRoom = Boolean(myCellId && latestTickData && latestTickData.activeCellId === myCellId);
  if (isPlayerInThisRoom) {
    sound.playBossWarning();
    if (data.phase === 'search_start') {
      toastText = '🔓 결계 해제 — 보스를 찾아 공격하세요';
      toastColor = '#c084fc';
      toastTimer = 75;
    } else if (data.phase === 'teleport_barrage') {
      toastText = '🔥 보스 순간이동 — 탄막 회피';
      toastColor = '#f43f5e';
      toastTimer = 65;
    } else if (data.phase === 'timeout_barrage') {
      toastText = '⚠️ 시간 초과 — 탄막 회피';
      toastColor = '#f43f5e';
      toastTimer = 65;
    }
  }
  scheduleRender();
});

channel.on(MSG.BOSS_ATTACK, (data) => {
  if (!data) return;
  const isPlayerInThisRoom = Boolean(myCellId && latestTickData && latestTickData.activeCellId === myCellId);
  if (isPlayerInThisRoom && !data.silent) {
    sound.playBossExplosion();
  }
  scheduleRender();
});

channel.on(MSG.BOSS_HIT, (data) => {
  if (!data) return;
  const isPlayerInThisRoom = Boolean(myCellId && latestTickData && latestTickData.activeCellId === myCellId);
  if (isPlayerInThisRoom) {
    sound.playSwordSlash(Boolean(data.isDefeated));
    if (data.isDefeated) {
      toastText = '🏆 보스 처치';
      toastColor = '#facc15';
      toastTimer = 90;
    } else {
      toastText = `⚔️ 공격 적중 (남은 체력: ❤️ x ${data.hp})`;
      toastColor = '#fef08a';
      toastTimer = 70;
    }
  }
  scheduleRender();
});

channel.on(MSG.DOOR_LOCKED, (data) => {
  if (data.activeCellId === myCellId) {
    sound.playLocked();
    lockedAlertTimer = 45; // 화면에 잠김 알림 일시 점등 (약 1.5초)
    scheduleRender();
  }
});

channel.on(MSG.MONSTER_HIT, (data) => {
  if (data.activeCellId === myCellId) {
    sound.playMonsterHit();
  }
});

channel.on(MSG.SOUND_MUTE_SYNC, (data) => {
  sound.setMute(data.isMuted);
  scheduleRender();
});

// 3. 메인 렌더링 틱
channel.on(MSG.TICK, (data) => {
  if (!myCellId || isVictory) return;

  const isPlayerHere = (data.activeCellId === myCellId);
  const isMonsterHere = Boolean(data.monster && data.monster.cellId === myCellId);

  if (!isPlayerHere && keys.size > 0) {
    keys.clear();
  }

  if (lockedAlertTimer > 0) {
    lockedAlertTimer--;
  }
  if (toastTimer > 0) {
    toastTimer--;
  }

  latestTickData = data;
  if (data.stage) currentStage = data.stage;
  hasKey = !!data.hasKey;
  hasMapItem = !!data.hasMapItem;
  hasBootsItem = !!data.hasBootsItem;
  latestMonster = data.monster;

  if (currentStage === 1) {
    if (data.exitCellId === myCellId) isExitRoom = true;
    if (data.keyCellId === myCellId) isKeyRoom = true;
    if (data.goldenCellId === myCellId) {
      isGoldenRoom = true;
      if (data.goldenItemType) goldenItemType = data.goldenItemType;
    }
    if (data.goldenItemCollected !== undefined) {
      goldenItemCollected = !!data.goldenItemCollected;
    }
  } else {
    clearStage1RoomFlags();
    if (currentStage === 2) {
      if (data.flagOwners && data.flagOwners[myCellId]) {
        myFlagOwner = data.flagOwners[myCellId];
      }
    } else if (currentStage === 3) {
      laserSourceCellId = data.laserSourceCellId || laserSourceCellId;
      laserTargetCellId = data.laserTargetCellId || laserTargetCellId;
      laserConnected = !!data.laserConnected;
      if (data.prismDirs && data.prismDirs[myCellId]) {
        myPrismDir = data.prismDirs[myCellId];
      }
      if (Array.isArray(data.laserSegments)) {
        myLaserSegment = data.laserSegments.find(s => s.cellId === myCellId) || null;
      } else {
        myLaserSegment = null;
      }
    } else if (currentStage === 4) {
      hasLegendarySword = !!data.hasLegendarySword;
      latestFlyingSword = data.flyingSword || null;
      if (data.closedDoorsByCell && Array.isArray(data.closedDoorsByCell[myCellId])) {
        myClosedDoors = data.closedDoorsByCell[myCellId];
      } else {
        myClosedDoors = [];
      }
    } else if (currentStage === 5) {
      hasLegendarySword = !!data.hasLegendarySword;
      latestBoss = data.boss || null;
    }
  }

  if (isAudioHost) {
    sound.updateTension(data.monsterTension || 0);
  }

  if (data.doorTransition) {
    checkDoorTransitionEvent(data.doorTransition);
  }

  const presenceChanged = (isPlayerHere !== wasPlayerHere) || (isMonsterHere !== wasMonsterHere);
  wasPlayerHere = isPlayerHere;
  wasMonsterHere = isMonsterHere;

  // 다중 창(15개 이상) 최적화: 비활성 빈 방은 3틱(10Hz)마다 렌더링하고, 활성/중요 방은 30Hz 즉시 렌더링
  const isImportantRoom =
    isPlayerHere ||
    isMonsterHere ||
    presenceChanged ||
    stageTransition.active ||
    isExitRoom ||
    (isKeyRoom && !hasKey) ||
    (isGoldenRoom && !goldenItemCollected) ||
    currentStage === 2 ||
    currentStage === 3 ||
    currentStage === 4 ||
    currentStage === 5 ||
    hasActiveDoorTransition();
  if (isImportantRoom || (data.tickCount % 3 === 0)) {
    scheduleRender();
  }
});

// 4. 키보드 입력 및 동기적 window.open 실행
const keys = new Set();

function normalizeInputKey(e) {
  if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.key === 'ㅈ' || e.key === 'ㅉ') return 'w';
  if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') return 'a';
  if (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ㄴ') return 's';
  if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D' || e.key === 'ㅇ') return 'd';
  if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') return 'm';
  return e.key;
}

window.addEventListener('keydown', (e) => {
  const isM = e.code === 'KeyM' || e.key === 'm' || e.key === 'M' || e.key === 'ㅡ';
  const isU = e.code === 'KeyU' || e.key === 'u' || e.key === 'U' || e.key === 'ㅕ';

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) || isM) {
    e.preventDefault();
  }

  // M 키: 전술 미니맵 플로팅 PiP 즉시 열기 / 닫기 토글
  if (isM && !e.repeat) {
    togglePipMinimap(window, channel);
    return;
  }

  // U 키: 실시간 음소거 토글
  if (isU && !e.repeat) {
    const isMuted = sound.toggleMute();
    channel.send(MSG.SOUND_MUTE_SYNC, { isMuted });
    return;
  }

  // 승리 후 스페이스바 입력 시 모든 창 닫기 및 런처 복귀 (연타로 인한 즉시 스킵 방지를 위해 1.8초 보호 적용)
  if (e.key === ' ' && isVictory) {
    if (!e.repeat && (Date.now() - victoryTimestamp >= 1800)) {
      channel.send(MSG.CLOSE_ALL);
      window.close();
    }
    return;
  }

  // 문 열기 인터랙션 (자동 오픈이 팝업 차단되었을 때의 폴백 — 단, Stage 4에서는 [Space]가 철창 레버 전용이므로 방향키로만 폴백 실행)
  if (currentPrompt) {
    if (e.key === ' ' && currentStage !== 4) {
      executeDoorTransition(currentPrompt);
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
      executeDoorTransition(currentPrompt);
    }
  }

  const keyName = normalizeInputKey(e);
  if (!keys.has(keyName)) {
    keys.add(keyName);
    channel.send(MSG.INPUT, { keys: Array.from(keys) });
  }
});

window.addEventListener('keyup', (e) => {
  const keyName = normalizeInputKey(e);
  if (keys.has(keyName)) {
    keys.delete(keyName);
    channel.send(MSG.INPUT, { keys: Array.from(keys) });
  }
});

// 창 포커스 전환, 블러, 탭 가시성 전환 시 잔여 키 일괄 소거
const clearLocalKeys = () => {
  if (keys.size > 0) {
    keys.clear();
    channel.send(MSG.INPUT, { keys: [] });
  }
};

window.addEventListener('blur', clearLocalKeys);
window.addEventListener('focus', clearLocalKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearLocalKeys();
});

window.addEventListener('beforeunload', () => {
  sound.stopAmbient();
  if (typeof disposeMinimap === 'function') disposeMinimap();
  if (!isClosingByCascade) {
    channel.send(MSG.BYE, { winId });
  }
  channel.close();
});

// 승리(VICTORY) 처리 및 멀티스크린 연속 꽃가루
channel.on(MSG.VICTORY, (data) => {
  isVictory = true;
  victoryTimestamp = Date.now();
  keys.clear();
  sound.stopAmbient();
  document.body.classList.add('victory-flash');
  if (!data || !data.winnerWinId || data.winnerWinId === winId) {
    sound.playVictory();
  }

  if (!document.querySelector('.victory-modal')) {
    const modal = document.createElement('div');
    modal.className = 'victory-modal';
    const subTitleLine = (data && data.stage === 2)
      ? `<div style="font-size:13px; color:#6ee7b7; margin-bottom:8px; font-weight:600;">🟢 나: ${data.playerScore}칸 vs 🔴 적: ${data.monsterScore}칸</div>`
      : `<div style="font-size:13px; color:#fef08a; margin-bottom:8px; font-weight:600;">모든 스테이지 클리어</div>`;
    modal.innerHTML = `
      <div class="victory-icon">🏆</div>
      <h1 class="victory-modal-title">ALL STAGES CLEARED!</h1>
      ${subTitleLine}
      <div class="victory-modal-instruction" id="victory-space-hint" style="opacity:0.45;">잠시 후 [Space]를 눌러 모든 창을 닫을 수 있습니다...</div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
      const hintEl = document.getElementById('victory-space-hint');
      if (hintEl) {
        hintEl.style.opacity = '1';
        hintEl.textContent = 'Press [Space] to close all windows';
      }
    }, 1800);
  }

  const bounds = (data && data.globalBounds) ? data.globalBounds : {
    minTop: 0,
    maxBottom: window.screen.availHeight,
    minLeft: 0,
    maxRight: window.screen.availWidth,
    totalHeight: window.screen.availHeight
  };

  confetti = new MultiScreenConfetti(bounds);

  const myRect = (roomData && roomData.rect) ? roomData.rect : {
    left: window.screenX,
    top: window.screenY,
    width: dynamicW,
    height: dynamicH
  };

  const animateVictory = () => {
    if (!isVictory) return;

    drawRoom(ctx, roomData, null, {
      stage: currentStage,
      isGoldenRoom: (currentStage === 1 && isGoldenRoom),
      flagOwner: (currentStage === 2) ? myFlagOwner : null,
      hasLaserBeam: (currentStage === 3 && Boolean(myLaserSegment)),
      isLaserConnected: (currentStage === 3 && true),
      hasForgeAura: (currentStage === 4 && true),
      hasLegendarySword: (currentStage >= 4),
      swordAwakenProgress: 1
    });
    if (currentStage === 1 && isExitRoom) drawExitPortal(ctx, true);
    if (currentStage === 2) drawTerritoryFlag(ctx, myFlagOwner, false);
    if (currentStage === 3) {
      drawStage3LaserAndNode(ctx, {
        isSourceRoom: (myCellId === laserSourceCellId),
        isTargetRoom: (myCellId === laserTargetCellId),
        prismDir: myPrismDir,
        segment: myLaserSegment,
        laserConnected: true,
        isNearPrism: false
      });
    }
    if (currentStage === 4) {
      drawStage4ForgeAndSword(ctx, {
        myCellId,
        roomDoors: (roomData && Array.isArray(roomData.doors)) ? roomData.doors : [],
        closedDoors: myClosedDoors,
        nearestGateDir: null,
        isNearTrappedSword: false,
        flyingSword: latestFlyingSword,
        hasLegendarySword: true,
        swordAwakenProgress: 1
      });
    }
    drawDungeonLighting(ctx, null, {
      stage: currentStage,
      hasLaserBeam: (currentStage === 3 && Boolean(myLaserSegment)),
      isLaserConnected: (currentStage === 3),
      hasLegendarySword: (currentStage >= 4),
      swordAwakenProgress: 1
    });

    confetti.render(ctx, myRect);
    requestAnimationFrame(animateVictory);
  };
  requestAnimationFrame(animateVictory);
});

channel.on(MSG.CLOSE_ALL, () => {
  isClosingByCascade = true;
  sound.stopAmbient();
  disposeMinimap();
  window.close();
});
