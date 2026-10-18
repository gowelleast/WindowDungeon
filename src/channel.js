import { CONFIG } from './config.js';
import { MSG } from './protocol.js';

export class DungeonChannel {
  constructor(winId) {
    this.winId = winId;
    this.bc = new BroadcastChannel(CONFIG.CHANNEL_NAME);
    this.handlers = {};
    
    // 계측용
    this.msgCount = 0;
    this.msgPerSec = 0;
    this.lastRtt = 0;
    this.maxRtt = 0;
    this.pendingPings = new Map();

    this.bc.onmessage = (event) => {
      this.msgCount++;
      const data = event.data;
      if (!data || !data.type) return;

      // 1. 자동 Ping 응답 처리 (Replica 등 수신 측)
      if (data.type === MSG.PING) {
        this.send(MSG.PONG, { pingId: data.pingId });
      } 
      // 2. Pong 수신 시 RTT 계산 (Master 등 발신 측)
      else if (data.type === MSG.PONG) {
        const start = this.pendingPings.get(data.pingId);
        if (start) {
          const rtt = performance.now() - start;
          this.lastRtt = rtt;
          if (rtt > this.maxRtt) this.maxRtt = rtt;
          this.pendingPings.delete(data.pingId);
        }
      }

      // 3. 등록된 커스텀 핸들러 호출
      const handler = this.handlers[data.type];
      if (handler) {
        handler(data);
      }
    };

    // 1초마다 초당 메시지 수(msg/sec) 갱신
    this.metricTimer = setInterval(() => {
      this.msgPerSec = this.msgCount;
      this.msgCount = 0;
    }, 1000);
  }

  send(type, payload = {}) {
    this.bc.postMessage({
      type,
      from: this.winId,
      t: performance.now(),
      ...payload
    });
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  // Master 전용 ping 발송 함수
  ping() {
    const pingId = crypto.randomUUID();
    this.pendingPings.set(pingId, performance.now());
    this.send(MSG.PING, { pingId });
  }

  close() {
    clearInterval(this.metricTimer);
    this.bc.close();
  }
}
