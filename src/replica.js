import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { drawRoom, drawPlayer, drawPrompt, drawFlag, drawDungeonLighting } from './render.js';
import { CONFIG } from './config.js';
import { MultiScreenConfetti } from './confetti.js';

// window.open의 두 번째 인자가 window.name으로 자동 설정되므로 이를 최우선으로 사용합니다.
const hashParams = new URLSearchParams(window.location.hash.substring(1));
let winId = window.name;
if (!winId || winId === '') {
  winId = hashParams.get('winId');
}
if (!winId) winId = 'room-' + Math.floor(Math.random() * 10000);

// 해상도에 맞춘 동적 방 크기(w, h) 적용
const dynamicW = parseInt(hashParams.get('w'), 10) || CONFIG.ROOM_OUTER_W;
const dynamicH = parseInt(hashParams.get('h'), 10) || CONFIG.ROOM_OUTER_H;
CONFIG.ROOM_OUTER_W = dynamicW;
CONFIG.ROOM_OUTER_H = dynamicH;

window.name = winId;
document.title = (winId === 'lobby') ? 'Window Dungeon — Lobby' : `Room: ${winId}`;

const channel = new DungeonChannel(winId);

const canvas = document.getElementById('game-canvas');
canvas.width = dynamicW;
canvas.height = dynamicH;
const ctx = canvas.getContext('2d');

let myCellId = null;
let roomData = null;
let currentPrompt = null;
let isVictory = false;
let confetti = null;

// 1. 인사 (핸드쉐이크)
// Worker가 완전히 초기화되기 전에 팝업이 뜰 수 있으므로, 응답을 받을 때까지 주기적으로 보냅니다.
let helloTimer = setInterval(() => {
  channel.send(MSG.HELLO, { winId });
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
    requestAnimationFrame(() => {
      drawRoom(ctx, roomData);
      if (roomData.hasFlag) drawFlag(ctx);
      drawDungeonLighting(ctx, null);
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

channel.on(MSG.TICK, (data) => {
  if (!myCellId || isVictory) return;

  requestAnimationFrame(() => {
    const isPlayerHere = (data.activeCellId === myCellId);
    
    // 1. 방 바닥, 벽, 문 렌더링
    drawRoom(ctx, roomData, isPlayerHere ? currentPrompt : null);
    
    // 2. 깃발 (황금 제단) 렌더링
    if (roomData && roomData.hasFlag) {
      drawFlag(ctx);
    }

    // 3. 플레이어 및 조명 렌더링
    if (isPlayerHere) {
      drawPlayer(ctx, data);
      drawDungeonLighting(ctx, data);
      if (currentPrompt) drawPrompt(ctx, currentPrompt);
    } else {
      drawDungeonLighting(ctx, null);
    }
  });
});

// 3. 키보드 입력 및 동기적 window.open 실행
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'm', 'M'].includes(e.key)) e.preventDefault();

  // 클리어 후 스페이스바 입력 시 모든 창 닫기 및 런처 복귀
  if (e.key === ' ' && isVictory) {
    channel.send(MSG.CLOSE_ALL);
    window.close();
    return;
  }

  if (e.key === ' ' && currentPrompt) {
    if (currentPrompt.willOpenNew) {
      const { targetWinId, rect } = currentPrompt;
      const w = rect.width || dynamicW;
      const h = rect.height || dynamicH;
      const features = `popup=yes,resizable=no,width=${w},height=${h},left=${rect.left},top=${rect.top}`;
      window.open(`./room.html#winId=${targetWinId}&w=${w}&h=${h}`, targetWinId, features);
    } else {
      const win = window.open('', currentPrompt.targetWinId);
      if (win) win.focus();
    }
    channel.send(MSG.DOOR_CONFIRM, { winId, dir: currentPrompt.dir, targetWinId: currentPrompt.targetWinId });
    currentPrompt = null;
    return;
  }

  if (!keys.has(e.key)) {
    keys.add(e.key);
    channel.send(MSG.INPUT, { keys: Array.from(keys) });
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.has(e.key)) {
    keys.delete(e.key);
    channel.send(MSG.INPUT, { keys: Array.from(keys) });
  }
});

window.addEventListener('blur', () => {
  if (keys.size > 0) {
    keys.clear();
    channel.send(MSG.INPUT, { keys: [] });
  }
});

window.addEventListener('beforeunload', () => {
  channel.send(MSG.BYE, { winId });
  channel.close();
});

channel.on(MSG.VICTORY, (data) => {
  isVictory = true;
  document.body.classList.add('victory-flash');
  
  if (!document.querySelector('.victory-modal')) {
    const modal = document.createElement('div');
    modal.className = 'victory-modal';
    modal.innerHTML = `
      <div class="victory-icon">🏆</div>
      <h1 class="victory-modal-title">VICTORY</h1>
      <div class="victory-modal-instruction">Press [Space] to close all windows</div>
    `;
    document.body.appendChild(modal);
  }

  // Window Management API 기반 연속 낙하 꽃가루 시뮬레이터 초기화
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

  // 승리 화면 및 연속 꽃가루 애니메이션 루프
  const animateVictory = () => {
    if (!isVictory) return;

    // 1. 방 바닥 및 오브젝트 기본 렌더링 유지
    drawRoom(ctx, roomData, null);
    if (roomData && roomData.hasFlag) drawFlag(ctx);
    drawDungeonLighting(ctx, null);

    // 2. 전역 좌표 기반 연속 낙하 꽃가루 렌더링
    confetti.render(ctx, myRect);

    requestAnimationFrame(animateVictory);
  };
  requestAnimationFrame(animateVictory);
});

channel.on(MSG.CLOSE_ALL, () => {
  window.close();
});
