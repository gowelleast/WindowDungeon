import { MSG } from './protocol.js';

let logContainer;

/** 인스펙터를 초기화하고, 정리(dispose) 함수를 반환합니다. */
export function initInspector(channel) {
  logContainer = document.getElementById('inspector-log');
  if (!logContainer) return () => {};

  // 시스템 기본 정보를 출력
  appendLog('System', `Inspector initialized. Listening on channel: ${channel.bc.name}`, '#4ade80');
  
  // 브로드캐스트 채널로 수신되는 모든 통신을 로그로 출력
  // (bc.onmessage를 래핑하면 재시작마다 래퍼가 중첩되어 로그가 중복되므로 onAny 구독 사용)
  return channel.onAny((data) => {
    // 너무 자주 오는 PING/PONG/TICK은 제외 (또는 축소 표기)
    if (data.type !== MSG.TICK && data.type !== MSG.PING && data.type !== MSG.PONG) {
      logPacket(data);
    }
  });
}

function logPacket(data) {
  let color = '#ccc';
  let formatted = '';

  switch (data.type) {
    case MSG.HELLO:
      color = '#60a5fa'; // Blue
      formatted = `[HELLO] Room <span style="color:#fff">${data.winId}</span> is knocking...`;
      break;
    case MSG.ASSIGN:
      color = '#f472b6'; // Pink
      formatted = `[ASSIGN] Worker created cell <span style="color:#fff">${data.id}</span> for <span style="color:#fff">${data.winId}</span>`;
      break;
    case MSG.DOOR_PROMPT:
      color = '#fbbf24'; // Yellow
      if (data.clear) {
        formatted = `[PROMPT_HIDE] Player stepped away from door.`;
      } else {
        formatted = `[PROMPT_SHOW] Door <span style="color:#fff">${data.dir}</span>. Next Window: <span style="color:#fff">${data.targetWinId}</span> (willOpenNew: ${data.willOpenNew})`;
      }
      break;
    case MSG.DOOR_CONFIRM:
      color = '#34d399'; // Emerald
      formatted = `[DOOR_CONFIRM] Player in <span style="color:#fff">${data.winId}</span> pressed Space!`;
      break;
    case MSG.VICTORY:
      color = '#facc15'; // Yellow
      formatted = `<span style="font-size: 16px; font-weight: bold; text-shadow: 0 0 5px #facc15;">[VICTORY] Flag found in <span style="color:#fff">${data.winnerWinId}</span>! 🏆</span>`;
      break;
    case MSG.SCREENS_UPDATE:
      color = '#a78bfa'; // Purple
      formatted = `[SCREENS_UPDATE] Received layout for <span style="color:#fff">${data.screens ? data.screens.length : 0}</span> monitors.`;
      break;
    case MSG.INPUT:
      color = '#9ca3af'; // Gray
      formatted = `[INPUT] Keys: [${data.keys.join(', ')}]`;
      break;
    default:
      const { type, from, t, ...payload } = data;
      formatted = `[${data.type}] ` + JSON.stringify(payload);
  }

  appendLog('Net', formatted, color);
}

function appendLog(source, htmlMessage, color) {
  if (!logContainer) return;
  
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  
  const div = document.createElement('div');
  div.style.marginBottom = '4px';
  div.innerHTML = `<span style="color: #666">[${time}]</span> <span style="color: ${color}; font-weight: bold;">[${source}]</span> ${htmlMessage}`;
  
  logContainer.appendChild(div);
  
  // 자동 스크롤
  logContainer.scrollTop = logContainer.scrollHeight;
}
