/**
 * Web Audio API 기반 레트로 신스 사운드 시스템
 * 외부 오디오 파일 다운로드 없이 브라우저 내장 Oscillator/GainNode로 0.001초 즉각 합성합니다.
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    let storedMute = false;
    try {
      storedMute = localStorage.getItem('wd_sound_muted') === 'true';
    } catch (e) {}
    this.isMuted = storedMute;
    this.masterGain = null;

    // 다크 앰비언트 BGM & 몬스터 접근 텐션(심장박동) 상태
    this.ambientNodes = null;
    this.tensionLevel = 0; // 0 (평온) ~ 1.0 (같은 방 추격)
    this.heartbeatTimer = null;
    this.lastBeatTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setMute(mute) {
    this.isMuted = !!mute;
    try {
      localStorage.setItem('wd_sound_muted', this.isMuted ? 'true' : 'false');
    } catch (e) {}
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.35, now, 0.04);
    }
  }

  /**
   * 0. 절차적 다크 앰비언트 배경음(Drone BGM) 및 몬스터 접근 텐션 루프 시작
   * - 저주파 드론(55Hz A1 + 82.4Hz E2 + 110Hz A2)과 저역통과 필터 LFO 호흡 모듈레이션
   * - 몬스터 인접(1칸 이내) 시 심장박동(Lub-Dub) 텐션 사운드 자동 페이드인
   */
  startAmbient() {
    this.init();
    if (!this.ctx || this.ambientNodes) return;

    const now = this.ctx.currentTime;

    const ambientGain = this.ctx.createGain();
    ambientGain.gain.setValueAtTime(0.001, now);
    // 기존(0.18) 대비 약 60% 수준으로 은은하게 낮춤
    ambientGain.gain.linearRampToValueAtTime(0.11, now + 1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(125, now);
    filter.Q.setValueAtTime(1.2, now);

    // 은은하게 숨 쉬는 LFO (약 7초 주기로 필터 컷오프 변조)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.14, now);
    lfoGain.gain.setValueAtTime(28, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // 드론 오실레이터 1: 깊은 베이스 (A1 = 55Hz, 저주파 부밍 완화를 위해 게인 축소)
    const osc1 = this.ctx.createOscillator();
    const osc1Gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55.0, now);
    osc1Gain.gain.setValueAtTime(0.28, now);

    // 드론 오실레이터 2: 어두운 5도 화음 패드 (E2 = 82.41Hz, 살짝 디튠)
    const osc2 = this.ctx.createOscillator();
    const osc2Gain = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(82.41, now);
    osc2.detune.setValueAtTime(4, now);
    osc2Gain.gain.setValueAtTime(0.22, now);

    // 드론 오실레이터 3: 불길한 텐션 서브옥타브/단2도 배음 (몬스터 접근 시 볼륨 증가)
    const tensionOsc = this.ctx.createOscillator();
    const tensionGain = this.ctx.createGain();
    tensionOsc.type = 'sawtooth';
    tensionOsc.frequency.setValueAtTime(116.54, now); // Bb2 (불협 긴장감)
    tensionGain.gain.setValueAtTime(0.0001, now);

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    tensionOsc.connect(tensionGain);

    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    tensionGain.connect(filter);

    filter.connect(ambientGain);
    ambientGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    tensionOsc.start(now);
    lfo.start(now);

    this.ambientNodes = {
      osc1,
      osc2,
      tensionOsc,
      lfo,
      filter,
      ambientGain,
      tensionGain
    };

    // 몬스터 접근 심장박동(Heartbeat) 체크 타이머
    this.lastBeatTime = performance.now();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ctx || this.isMuted || !this.ambientNodes) return;
      if (this.tensionLevel <= 0.05) return;

      const nowMs = performance.now();
      // 텐션이 높을수록(같은 방) 박동 주기가 빨라짐 (옆방: ~920ms, 같은 방: ~480~620ms)
      const intervalMs = this.tensionLevel >= 0.75
        ? Math.max(460, 720 - (this.tensionLevel - 0.75) * 900)
        : 920;

      if (nowMs - this.lastBeatTime >= intervalMs) {
        this.lastBeatTime = nowMs;
        this.playHeartbeatPulse(this.tensionLevel);
      }
    }, 80);
  }

  /**
   * 몬스터와의 거리에 따른 실시간 텐션(0.0 ~ 1.0) 반영
   */
  updateTension(level) {
    const clamped = Math.max(0, Math.min(1, Number(level) || 0));
    this.tensionLevel = clamped;
    if (!this.ctx || !this.ambientNodes) return;

    const now = this.ctx.currentTime;
    // 몬스터가 가까워질수록 불협 배음(Bb2)과 로우패스 필터 컷오프를 높여 긴장감 고조
    const targetTensionGain = clamped > 0 ? 0.025 + clamped * 0.14 : 0.0001;
    const targetCutoff = 125 + clamped * 95;

    this.ambientNodes.tensionGain.gain.setTargetAtTime(targetTensionGain, now, 0.25);
    this.ambientNodes.filter.frequency.setTargetAtTime(targetCutoff, now, 0.25);
  }

  /**
   * 몬스터 인접 시 "두근-두근(Lub-Dub)" 저음 심장박동 사운드 합성
   */
  playHeartbeatPulse(intensity = 0.5) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const peakGain = Math.min(0.48, 0.14 + intensity * 0.3);

    // 첫 번째 박동 (Lub: 68Hz -> 34Hz)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(68, now);
    osc1.frequency.exponentialRampToValueAtTime(34, now + 0.12);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(peakGain, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // 두 번째 박동 (Dub: 0.17초 뒤 56Hz -> 30Hz)
    const beat2 = now + 0.17;
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(56, beat2);
    osc2.frequency.exponentialRampToValueAtTime(30, beat2 + 0.11);
    gain2.gain.setValueAtTime(0.001, beat2);
    gain2.gain.linearRampToValueAtTime(peakGain * 0.72, beat2 + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, beat2 + 0.13);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(beat2);
    osc2.stop(beat2 + 0.14);
  }

  /**
   * 다크 앰비언트 BGM 및 텐션 루프 종료
   */
  stopAmbient() {
    this.tensionLevel = 0;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.ambientNodes) return;

    const nodes = this.ambientNodes;
    this.ambientNodes = null;

    try {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        nodes.ambientGain.gain.cancelScheduledValues(now);
        nodes.ambientGain.gain.setTargetAtTime(0.0001, now, 0.08);
        setTimeout(() => {
          try { nodes.osc1.stop(); } catch (e) {}
          try { nodes.osc2.stop(); } catch (e) {}
          try { nodes.tensionOsc.stop(); } catch (e) {}
          try { nodes.lfo.stop(); } catch (e) {}
        }, 250);
      }
    } catch (e) {}
  }

  /**
   * 1. 황금 열쇠 획득 사운드 (영롱한 아르페지오 신스)
   * C6 -> E6 -> G6 -> C7 고음 챠-리-링~
   */
  playKey() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const notes = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.36);
    });
  }

  /**
   * 2. 잠긴 탈출문 부딪힘 (둔탁한 금속 락 사운드)
   * 철-컹! (140Hz -> 80Hz 급격한 감쇠 사각파)
   */
  playLocked() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    
    // 첫 번째 클릭
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(140, now);
    osc1.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // 두 번째 둔탁한 금속 래치 (0.05초 뒤)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(180, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(70, now + 0.16);
    gain2.gain.setValueAtTime(0.4, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.17);
  }

  /**
   * 3. 탈출 포탈 개방 (웅장한 주파수 스윕 업 + 팡파레)
   */
  playPortalOpen() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.6);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.85);
  }

  /**
   * 4. 문 통과 / 공간 전이 워시 사운드
   */
  playDoorPass() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(550, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * 5. 몬스터 피격 사운드 (묵직한 넉백 충격음)
   */
  playMonsterHit() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * 6. 승리 사운드 (던전 분위기에 어울리는 신비로운 고대 포탈 개방 공명 + 크리스탈 차임 화음)
   */
  playVictory() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;

    // Layer 1: 따뜻하고 몽환적인 포탈 해방 화음 패드 (Cmaj9 공명: C4, G4, B4, D5)
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(320, now);
    padFilter.frequency.exponentialRampToValueAtTime(1200, now + 0.55);
    padFilter.frequency.exponentialRampToValueAtTime(480, now + 2.0);
    padFilter.connect(this.masterGain);

    const padFreqs = [261.63, 392.00, 493.88, 587.33];
    padFreqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((i - 1.5) * 4, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      osc.connect(gain);
      gain.connect(padFilter);
      osc.start(now);
      osc.stop(now + 2.05);
    });

    // Layer 2: 봉인이 풀리며 피어오르는 영롱한 크리스탈 차임 아르페지오 (Sine Bell)
    const chimes = [
      { f: 523.25, t: 0.04, d: 0.9, g: 0.10 },  // C5
      { f: 659.25, t: 0.14, d: 0.95, g: 0.10 }, // E5
      { f: 783.99, t: 0.24, d: 1.0, g: 0.11 },  // G5
      { f: 987.77, t: 0.35, d: 1.15, g: 0.11 }, // B5 (신비로운 Maj7 컬러)
      { f: 1174.66, t: 0.47, d: 1.35, g: 0.12 }, // D6
      { f: 1567.98, t: 0.60, d: 1.65, g: 0.13 }  // G6 (여운)
    ];

    chimes.forEach((note) => {
      const start = now + note.t;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(note.g, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.d);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + note.d + 0.03);
    });
  }
}

export const sound = new SoundSystem();
