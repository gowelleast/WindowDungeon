import { CONFIG } from './config.js';
import { MSG } from './protocol.js';

export class DungeonChannel {
  constructor(winId) {
    this.winId = winId;
    this.bc = new BroadcastChannel(CONFIG.CHANNEL_NAME);
    // type -> Set<handler>. 한 채널을 여러 모듈(launcher/minimap 등)이 공유하므로 타입당 여러 핸들러를 허용합니다.
    this.handlers = new Map();
    // 모든 수신 메시지를 받는 탭 (인스펙터 로깅용)
    this.anyHandlers = new Set();
    
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

      // 3. 전체 탭 핸들러 → 타입별 핸들러 순으로 호출
      for (const h of this.anyHandlers) h(data);
      this.#dispatch(data);
    };

    // 1초마다 초당 메시지 수(msg/sec) 갱신 및 만료된 ping 정리
    this.metricTimer = setInterval(() => {
      this.msgPerSec = this.msgCount;
      this.msgCount = 0;
      const now = performance.now();
      for (const [id, start] of this.pendingPings) {
        if (now - start > 5000) this.pendingPings.delete(id);
      }
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

  /** 핸들러 등록. 해제 함수를 반환합니다. */
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  /** 타입과 무관하게 수신되는 모든 메시지를 구독. 해제 함수를 반환합니다. */
  onAny(handler) {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  /**
   * BroadcastChannel은 발신자 자신에게는 메시지를 돌려주지 않으므로,
   * 같은 컨텍스트의 리스너에게도 전달이 필요할 때 사용합니다. (onAny 탭은 호출하지 않음)
   */
  emitLocal(type, payload = {}) {
    this.#dispatch({ type, from: this.winId, t: performance.now(), ...payload });
  }

  #dispatch(data) {
    const set = this.handlers.get(data.type);
    if (!set) return;
    for (const h of [...set]) h(data);
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
