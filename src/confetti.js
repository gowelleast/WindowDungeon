/**
 * Window Management API 기반 멀티스크린/멀티윈도우 연계 축하 꽃가루(Confetti) 시뮬레이션
 * 
 * - 모든 팝업 창이 공유하는 전역 절대 좌표계(globalBounds)를 기준으로 시뮬레이션됩니다.
 * - 동일한 시드(Seed) 기반 결정론적 난수를 사용하여 모든 창에서 동일한 꽃가루 위치를 계산합니다.
 * - 꽃가루가 위쪽 창의 바닥을 벗어나면, 아래쪽 창의 천장으로 자연스럽게 이어져 떨어집니다.
 */

const CONFETTI_COLORS = [
  '#fbbf24', // 황금색
  '#f59e0b', // 앰버
  '#38bdf8', // 스카이블루
  '#06b6d4', // 시안
  '#ec4899', // 핑크
  '#f43f5e', // 로즈
  '#a855f7', // 퍼플
  '#10b981', // 에메랄드
  '#34d399', // 민트
  '#ffffff', // 순백
];

// 결정론적 LCG (Linear Congruential Generator) 난수 생성기
function makePRNG(seed = 1234567) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class MultiScreenConfetti {
  /**
   * @param {Object} globalBounds 전역 화면 및 방 범위 { minTop, maxBottom, minLeft, maxRight, totalHeight }
   * @param {number} particleCount 총 꽃가루 개수 (기본 180개)
   */
  constructor(globalBounds, particleCount = 180) {
    this.minTop = globalBounds.roomsMinTop ?? globalBounds.minTop ?? 0;
    this.maxBottom = globalBounds.roomsMaxBottom ?? globalBounds.maxBottom ?? 1080;
    this.minLeft = globalBounds.minLeft ?? 0;
    this.maxRight = globalBounds.maxRight ?? 1920;
    
    // 유효 낙하 전체 높이 (최소 800px 보장)
    this.totalHeight = Math.max(800, this.maxBottom - this.minTop + 100);
    this.totalWidth = Math.max(1000, this.maxRight - this.minLeft);

    const prng = makePRNG(9876543);
    this.particles = [];

    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        id: i,
        // 전역 가로 위치 비율 (0 ~ 1)
        xPct: prng(),
        // 전역 세로 시작 오프셋
        yOffset: prng() * this.totalHeight,
        // 낙하 속도 (px/s)
        speedY: 200 + prng() * 180,
        // 좌우 흔들림 주기 및 진폭
        wobbleSpeed: 2.5 + prng() * 3.0,
        wobbleAmp: 18 + prng() * 24,
        // 3D 회전 속도
        rotSpeed: 3 + prng() * 6,
        rotOffset: prng() * Math.PI * 2,
        // 크기 및 색상
        sizeW: 8 + prng() * 7,
        sizeH: 5 + prng() * 5,
        color: CONFETTI_COLORS[Math.floor(prng() * CONFETTI_COLORS.length)]
      });
    }

    this.startPerformanceTime = performance.now();
  }

  /**
   * 현재 방 창(Room Window)의 화면 영역에 해당하는 꽃가루만 필터링하여 렌더링
   * @param {CanvasRenderingContext2D} ctx 
   * @param {Object} roomRect 창의 실제 전역 화면 좌표 { left, top, width, height }
   */
  render(ctx, roomRect) {
    const elapsed = (performance.now() - this.startPerformanceTime) / 1000;
    const roomLeft = roomRect.left;
    const roomTop = roomRect.top;
    const roomW = roomRect.width || ctx.canvas.width;
    const roomH = roomRect.height || ctx.canvas.height;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // 전역 Y 좌표 계산: 위에서 아래로 순환 낙하
      const currentGlobalY = this.minTop - 50 + ((p.yOffset + p.speedY * elapsed) % this.totalHeight);

      // 전역 X 좌표 계산: 미세한 바람 및 좌우 펄럭임
      const wobble = Math.sin(elapsed * p.wobbleSpeed + p.id) * p.wobbleAmp;
      const currentGlobalX = this.minLeft + p.xPct * this.totalWidth + wobble;

      // 현재 창 캔버스 기준의 로컬 좌표로 변환
      const localX = currentGlobalX - roomLeft;
      const localY = currentGlobalY - roomTop;

      // 현재 창 경계 내(여백 25px 포함)에 있는 꽃가루만 렌더링
      if (localX >= -25 && localX <= roomW + 25 && localY >= -25 && localY <= roomH + 25) {
        ctx.save();
        ctx.translate(localX, localY);
        
        // 3D 공중 회전 효과 (scaleX를 주기적으로 뒤집어 종이가 펄럭이는 입체감 부여)
        const flip = Math.cos(elapsed * p.wobbleSpeed * 1.4 + p.id);
        ctx.rotate(p.rotOffset + elapsed * p.rotSpeed);
        ctx.scale(flip, 1);

        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;

        ctx.fillRect(-p.sizeW / 2, -p.sizeH / 2, p.sizeW, p.sizeH);
        ctx.restore();
      }
    }
  }
}
