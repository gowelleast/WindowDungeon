import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { 
  drawRoom, 
  drawPlayer, 
  drawPrompt, 
  drawKey, 
  drawExitPortal, 
  drawMonster, 
  drawDungeonLighting, 
  drawHUD 
} from './render.js';
import { CONFIG } from './config.js';
import { MultiScreenConfetti } from './confetti.js';
import { sound } from './sound.js';
import { initMinimap, togglePipMinimap, closePipMinimap } from './minimap.js';

// window.open의 두 번째 인자가 window.name으로 자동 설정되므로 이를 최우선으로 사용합니다.
const hashParams = new URLSearchParams(window.location.hash.substring(1));
let winId = window.name;
if (!winId || winId === '') {
  winId = hashParams.get('winId');
}
if (!winId) winId = 'room-' + Math.floor(Math.random() * 10000);

// 해상도에 맞춘 동적 방 크기(w, h) 및 사운드 음소거 상태 동기화 적용
const dynamicW = parseInt(hashParams.get('w'), 10) || CONFIG.ROOM_OUTER_W;
const dynamicH = parseInt(hashParams.get('h'), 10) || CONFIG.ROOM_OUTER_H;
CONFIG.ROOM_OUTER_W = dynamicW;
CONFIG.ROOM_OUTER_H = dynamicH;

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
canvas.width = dynamicW;
canvas.height = dynamicH;
const ctx = canvas.getContext('2d');

let myCellId = null;
let roomData = null;
let currentPrompt = null;
let isVictory = false;
let confetti = null;

let isExitRoom = false;
let isKeyRoom = false;
let hasKey = false;
let latestMonster = null;
let lockedAlertTimer = 0;

// 유저 첫 클릭/인터랙션 시 오디오 컨텍스트 활성화
window.addEventListener('click', () => { sound.init(); }, { once: true });
window.addEventListener('keydown', () => { sound.init(); }, { once: true });

// 1. 인사 (핸드쉐이크 및 브라우저 창 오버헤드 실측값 동기화)
let helloTimer = setInterval(() => {
  const overheadY = window.outerHeight - window.innerHeight;
  const overheadX = window.outerWidth - window.innerWidth;
  channel.send(MSG.HELLO, { 
    winId,
    overheadY: (overheadY > 0) ? overheadY : undefined,
    overheadX: (overheadX > 0) ? overheadX : undefined
  });
}, 100);

// 2. 메시지 수신
channel.on(MSG.ASSIGN, (data) => {
  if (data.winId === winId) {
    if (helloTimer) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
    myCellId = data.id;
    roomData = data;
    isExitRoom = !!data.isExitRoom;
    isKeyRoom = !!data.isKeyRoom;
    hasKey = !!data.hasKey;
    if (data.isMuted !== undefined) {
      sound.setMute(data.isMuted);
    }

    requestAnimationFrame(() => {
      drawRoom(ctx, roomData);
      if (isExitRoom) drawExitPortal(ctx, hasKey);
      if (isKeyRoom && !hasKey) drawKey(ctx);
      drawDungeonLighting(ctx, null);
      drawHUD(ctx, hasKey, sound.isMuted);
    });
  }
});

channel.on(MSG.DOOR_PROMPT, (data) => {
  if (data.activeCellId === myCellId) {
    if (data.clear) {
      currentPrompt = null;
    } else {
      currentPrompt = data;
    }
  }
});

// 사운드 및 상호작용 피드백 이벤트
channel.on(MSG.KEY_COLLECTED, () => {
  hasKey = true;
  sound.playKey();
});

channel.on(MSG.DOOR_LOCKED, (data) => {
  if (data.activeCellId === myCellId) {
    sound.playLocked();
    lockedAlertTimer = 40; // 화면에 잠김 알림 일시 점등
  }
});

channel.on(MSG.MONSTER_HIT, (data) => {
  if (data.activeCellId === myCellId) {
    sound.playMonsterHit();
  }
});

channel.on(MSG.SOUND_MUTE_SYNC, (data) => {
  sound.setMute(data.isMuted);
});

// 3. 메인 렌더링 틱
channel.on(MSG.TICK, (data) => {
  if (!myCellId || isVictory) return;

  const isPlayerHere = (data.activeCellId === myCellId);
  if (!isPlayerHere && keys.size > 0) {
    keys.clear();
  }

  hasKey = data.hasKey;
  latestMonster = data.monster;
  if (data.exitCellId === myCellId) isExitRoom = true;
  if (data.keyCellId === myCellId) isKeyRoom = true;

  requestAnimationFrame(() => {
    // 1. 방 바닥, 벽, 문 렌더링
    drawRoom(ctx, roomData, isPlayerHere ? currentPrompt : null);

    // 2. 고대 탈출문 렌더링
    if (isExitRoom) {
      drawExitPortal(ctx, hasKey);
    }

    // 3. 황금 열쇠 렌더링 (아직 안 먹었을 때만)
    if (isKeyRoom && !hasKey) {
      drawKey(ctx);
    }

    // 4. 그림자 몬스터 렌더링 (몬스터가 이 방에 있을 때)
    if (latestMonster && latestMonster.cellId === myCellId) {
      drawMonster(ctx, latestMonster);
    }

    // 5. 플레이어 및 다이나믹 조명 렌더링
    if (isPlayerHere) {
      drawPlayer(ctx, data);
      drawDungeonLighting(ctx, data);
      if (currentPrompt) drawPrompt(ctx, currentPrompt);
    } else {
      drawDungeonLighting(ctx, null);
    }

    // 6. 상단 HUD (열쇠 상태 및 사운드 안내)
    drawHUD(ctx, hasKey, sound.isMuted);
  });
});

// 4. 키보드 입력 및 동기적 window.open 실행
const keys = new Set();
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

  // 승리 후 스페이스바 입력 시 모든 창 닫기 및 런처 복귀
  if (e.key === ' ' && isVictory) {
    channel.send(MSG.CLOSE_ALL);
    window.close();
    return;
  }

  // 문 열기 인터랙션
  if (e.key === ' ' && currentPrompt) {
    keys.clear();
    channel.send(MSG.INPUT, { keys: [] });

    sound.playDoorPass();

    let actualRect = null;

    if (currentPrompt.willOpenNew) {
      const { targetWinId, rect, dir } = currentPrompt;
      const w = Math.round((rect && rect.width) || dynamicW);
      const h = Math.round((rect && rect.height) || dynamicH);

      // 현재 방 창의 실제 화면 좌표 및 물리 크기 측정
      const curX = (typeof window.screenX === 'number' && !isNaN(window.screenX)) ? window.screenX : (window.screenLeft || 0);
      const curY = (typeof window.screenY === 'number' && !isNaN(window.screenY)) ? window.screenY : (window.screenTop || 0);
      const curW = window.outerWidth || w;
      const curH = window.outerHeight || h;

      // Master가 화면 해상도에 맞춰 균등 분할 계산한 정규 N*M 그리드 좌표(rect)를 최우선 적용 (화면 여백 및 겹침 방지)
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
      window.open(`./room.html#winId=${targetWinId}&w=${w}&h=${h}&muted=${sound.isMuted ? 1 : 0}`, targetWinId, features);
    } else {
      const win = window.open('', currentPrompt.targetWinId);
      if (win) win.focus();
    }
    channel.send(MSG.DOOR_CONFIRM, { 
      winId, 
      dir: currentPrompt.dir, 
      targetWinId: currentPrompt.targetWinId,
      actualRect
    });
    currentPrompt = null;
    return;
  }

  const keyName = isM ? 'm' : e.key;
  if (!keys.has(keyName)) {
    keys.add(keyName);
    channel.send(MSG.INPUT, { keys: Array.from(keys) });
  }
});

window.addEventListener('keyup', (e) => {
  const isM = e.code === 'KeyM' || e.key === 'm' || e.key === 'M' || e.key === 'ㅡ';
  const keyName = isM ? 'm' : e.key;
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
  if (typeof disposeMinimap === 'function') disposeMinimap();
  channel.send(MSG.BYE, { winId });
  channel.close();
});

// 승리(VICTORY) 처리 및 멀티스크린 연속 꽃가루
channel.on(MSG.VICTORY, (data) => {
  isVictory = true;
  document.body.classList.add('victory-flash');
  sound.playVictory();
  
  if (!document.querySelector('.victory-modal')) {
    const modal = document.createElement('div');
    modal.className = 'victory-modal';
    modal.innerHTML = `
      <div class="victory-icon">🏆</div>
      <h1 class="victory-modal-title">DUNGEON CLEARED!</h1>
      <div class="victory-modal-instruction">Press [Space] to close all windows</div>
    `;
    document.body.appendChild(modal);
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
    width: canvas.width,
    height: canvas.height
  };

  const animateVictory = () => {
    if (!isVictory) return;

    drawRoom(ctx, roomData, null);
    if (isExitRoom) drawExitPortal(ctx, true);
    drawDungeonLighting(ctx, null);

    confetti.render(ctx, myRect);
    requestAnimationFrame(animateVictory);
  };
  requestAnimationFrame(animateVictory);
});

channel.on(MSG.CLOSE_ALL, () => {
  window.close();
});
