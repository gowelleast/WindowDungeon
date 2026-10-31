import { MSG } from './protocol.js';

let logContainer;
const MAX_LOG_ENTRIES = 150;

/** 인스펙터를 초기화하고, 정리(dispose) 함수를 반환합니다. */
export function initInspector(channel) {
  logContainer = document.getElementById('inspector-log');
  if (!logContainer) return () => {};

  // 시스템 기본 정보를 출력
  appendLog('SYS', `Inspector listening on channel: <strong>${channel.bc.name}</strong>`, '#34d399');
  
  // 브로드캐스트 채널로 수신되는 모든 통신을 로그로 출력
  return channel.onAny((data) => {
    // 너무 빈번한 PING/PONG/TICK은 제외
    if (data.type !== MSG.TICK && data.type !== MSG.PING && data.type !== MSG.PONG) {
      logPacket(data);
    }
  });
}

function logPacket(data) {
  let color = '#94a3b8';
  let formatted = '';

  switch (data.type) {
    case MSG.HELLO:
      color = '#38bdf8'; // Sky Blue
      formatted = `<span style="color:#7dd3fc">[HELLO]</span> Room <code class="log-code">${data.winId}</code> is knocking...`;
      break;
    case MSG.ASSIGN:
      color = '#f472b6'; // Pink
      formatted = `<span style="color:#f472b6">[ASSIGN]</span> Cell <code class="log-code">${data.id}</code> allocated for <strong>${data.winId}</strong>`;
      break;
    case MSG.DOOR_PROMPT:
      color = '#fbbf24'; // Amber
      if (data.clear) {
        formatted = `<span style="color:#64748b">[PROMPT_HIDE]</span> Player stepped away from door.`;
      } else {
        formatted = `<span style="color:#fbbf24">[DOOR_PROMPT]</span> Dir: <strong>${data.dir.toUpperCase()}</strong> → Target: <code class="log-code">${data.targetWinId}</code> (new: ${data.willOpenNew})`;
      }
      break;
    case MSG.DOOR_CONFIRM:
      color = '#34d399'; // Emerald
      formatted = `<span style="color:#34d399">[DOOR_CONFIRM]</span> [SPACE] Triggered in <strong>${data.winId}</strong> (Dir: ${data.dir})`;
      break;
    case MSG.KEY_COLLECTED:
      color = '#fde047'; // Yellow
      formatted = `<span style="color:#fde047">[KEY_COLLECTED]</span> 🔑 Key acquired in <code class="log-code">${data.activeCellId}</code>`;
      break;
    case MSG.DOOR_LOCKED:
      color = '#f87171'; // Red
      formatted = `<span style="color:#f87171">[DOOR_LOCKED]</span> 🔒 Exit portal locked in <code class="log-code">${data.activeCellId}</code>`;
      break;
    case MSG.MONSTER_HIT:
      color = '#ef4444'; // Red
      formatted = `<span style="color:#ef4444">[MONSTER_HIT]</span> 👾 Player hit in <code class="log-code">${data.activeCellId}</code>`;
      break;
    case MSG.VICTORY:
      color = '#facc15'; // Gold
      formatted = `<span style="color:#facc15; font-weight: bold;">[VICTORY] 🏆 Dungeon cleared in ${data.winnerWinId}!</span>`;
      break;
    case MSG.SCREENS_UPDATE:
      color = '#c084fc'; // Purple
      formatted = `<span style="color:#c084fc">[SCREENS_UPDATE]</span> Layout refreshed for <strong>${data.screens ? data.screens.length : 0}</strong> display(s).`;
      break;
    case MSG.INPUT:
      color = '#64748b'; // Slate
      formatted = `<span style="color:#94a3b8">[INPUT]</span> Keys: [${data.keys.join(', ')}]`;
      break;
    default:
      const { type, from, t, ...payload } = data;
      formatted = `[${data.type}] ` + JSON.stringify(payload);
  }

  appendLog('NET', formatted, color);
}

function appendLog(source, htmlMessage, color) {
  if (!logContainer) return;
  
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-source" style="color: ${color};">${source}</span> ${htmlMessage}`;
  
  logContainer.appendChild(div);

  // 최대 개수 유지 (메모리 보호)
  while (logContainer.children.length > MAX_LOG_ENTRIES) {
    logContainer.removeChild(logContainer.firstChild);
  }
  
  // 자동 스크롤
  logContainer.scrollTop = logContainer.scrollHeight;
}
