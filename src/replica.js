import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { drawRoom, drawPlayer, drawPrompt } from './render.js';
import { CONFIG } from './config.js';

// window.open의 두 번째 인자가 window.name으로 자동 설정되므로 이를 최우선으로 사용합니다.
let winId = window.name;
if (!winId || winId === '') {
  // 수동 접속 시 redirect로 ? 쿼리가 유실되는 것을 막기 위해 # 해시 사용
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  winId = hashParams.get('winId');
}
if (!winId) winId = 'room-' + Math.floor(Math.random() * 10000);

window.name = winId;
document.title = (winId === 'lobby') ? 'Window Dungeon - Lobby' : `Room: ${winId}`;

const channel = new DungeonChannel(winId);

const canvas = document.getElementById('game-canvas');
canvas.width = CONFIG.ROOM_OUTER_W;
canvas.height = CONFIG.ROOM_OUTER_H;
const ctx = canvas.getContext('2d');

let myCellId = null;
let roomData = null;
let currentPrompt = null;

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
    requestAnimationFrame(() => drawRoom(ctx, roomData));
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
  if (!myCellId) return;

  requestAnimationFrame(() => {
    drawRoom(ctx, roomData);
    
    if (roomData && roomData.hasFlag) {
      ctx.font = '60px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩', CONFIG.ROOM_OUTER_W / 2, CONFIG.ROOM_OUTER_H / 2);
    }

    if (data.activeCellId === myCellId) {
      drawPlayer(ctx, data);
      if (currentPrompt) drawPrompt(ctx, currentPrompt);
    }
  });
});

// 3. 키보드 입력 및 동기적 window.open 실행
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();

  if (e.key === ' ' && currentPrompt) {
    if (currentPrompt.willOpenNew) {
      const { targetWinId, rect } = currentPrompt;
      const features = `popup=yes,resizable=no,width=${CONFIG.ROOM_OUTER_W},height=${CONFIG.ROOM_OUTER_H},left=${rect.left},top=${rect.top}`;
      window.open(`./room.html#winId=${targetWinId}`, targetWinId, features);
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
  document.body.classList.add('victory-flash');
  const h1 = document.createElement('h1');
  h1.innerHTML = `🎉 VICTORY! 🎉<br><span style="font-size: 20px">Winner: ${data.winnerWinId}</span><br><br><span style="font-size: 14px; font-weight: normal; color: #ccc;">Press Space to close all rooms</span>`;
  h1.style.position = 'absolute';
  h1.style.top = '50%';
  h1.style.left = '50%';
  h1.style.transform = 'translate(-50%, -50%)';
  h1.style.color = '#fff';
  h1.style.textShadow = '0 0 20px #facc15';
  h1.style.textAlign = 'center';
  h1.style.pointerEvents = 'none';
  document.body.appendChild(h1);
});

channel.on(MSG.CLOSE_ALL, () => {
  window.close();
});
