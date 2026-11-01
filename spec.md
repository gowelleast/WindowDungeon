# 브라우저 창 던전 크롤러 — 기술 스펙

> 이 문서는 **현재 구현된 코드 기준**의 기술 스펙이다. 초기 프로토타입 기획에서 실제 개발·리팩토링 과정을 거치며 완성된 아키텍처와 변경 사항을 반영했다.
> 초기 기획과 달라진 주요 지점은 [11. 초기 기획 대비 변경점](#11-초기-기획-대비-변경점)에 정리한다.

## 0. 프로젝트 개요

작은 브라우저 창 하나가 게임의 방(room) 하나가 된다. 방의 벽에 문이 있고, 방향키(또는 WASD)로 문턱에 닿으면 이동 키 입력이 부여한 **Transient User Activation**을 활용해 그 방향에 실제 새 브라우저 창이 자동으로 열리면서 다음 방으로 이동한다. 미지의 방들을 순찰하는 그림자 몬스터(👾)를 피해 **황금 열쇠(🔑)**를 획득한 뒤 **잠긴 탈출문(🚪)**을 열어 탈출하면 클리어.

- **플레이 링크**: [https://gowelleast.github.io/WindowDungeon/](https://gowelleast.github.io/WindowDungeon/)
- **목표 기술**: Window Management API (모니터 해상도/좌표 획득 및 동적 그리드 창 배치), BroadcastChannel API (창 간 초저지연 상태 동기화), Document Picture-in-Picture API (Always-on-Top 전술 미니맵), Web Audio API (오실레이터 기반 절차적 사운드/배경음 합성)
- **대상 브라우저**: 데스크톱 Chromium 계열 (Chrome/Edge) 최신 버전 (모바일 및 Safari/Firefox 접속 시 안내 카드/배너 노출)
- **빌드 도구**: 없음. 정적 파일 + ES 모듈만 사용
- **서버**: `npm start` (= `npx serve .`) 로 로컬 실행 또는 GitHub Pages(`https`) 정적 호스팅 (Secure Context 확보 목적)

---

## 1. 기술 스택

| 영역          | 선택                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| 언어          | Vanilla JavaScript (ES2022), 타입 주석 없음                                                |
| 모듈 시스템   | 네이티브 ES Modules (`<script type="module">`, `new Worker(..., { type: 'module' })`)       |
| 렌더링        | `<canvas>` 2D context (High-DPI `devicePixelRatio` 스케일링 + 정적 방 레이어 오프스크린 캐싱) |
| 창 간 통신    | `BroadcastChannel` (채널명 `dungeon-v1`)                                                   |
| 화면 정보     | `window.getScreenDetails()`, `screenschange` / `currentscreenchange` 이벤트                 |
| 플로팅 미니맵 | `window.documentPictureInPicture.requestWindow()` (`[M]` 키 온디맨드 토글)                  |
| 오디오 합성   | `AudioContext` / `OscillatorNode` / `BiquadFilterNode` (외부 음원 파일 없음)               |
| 게임 루프     | Dedicated Web Worker (`master-worker.js`) 내부 30Hz `setInterval`                          |
| 상태 관리     | 별도 라이브러리 없음. Master(Worker)가 단일 진실 소스(SSOT)                                |
| 패키지 매니저 | 게임 자체는 런타임 의존성 없음. 로컬 서빙만 `npx serve` 사용                               |

---

## 2. 프로젝트 구조 및 실행 주체

```
window-dungeon/
├── package.json              # "scripts": { "start": "npx serve ." }
├── index.html                # Launcher (대시보드) 진입점 — 게임 시작/리셋, 미니맵, 인스펙터, 브라우저/모바일 가드
├── room.html                 # 방(Replica) 진입점. 로비 방도 이 페이지를 winId=lobby로 연다
├── style.css                 # 공용 스타일시트 (런처, 승리 모달, PiP 미니맵, 경고 배너 등)
├── src/
│   ├── config.js             # 창 크기, 동적 그리드 분할(computeDynamicRoomSize), tick 주기, 물리/몬스터 파라미터
│   ├── protocol.js           # 메시지 타입 상수
│   ├── grid.js               # 좌표계 계산 (screen ↔ grid ↔ cellId, parseCellId, getSlotSize)
│   ├── channel.js            # BroadcastChannel 래퍼 (다중 핸들러, 로컬 emit, RTT 계측)
│   ├── master-worker.js      # 게임 루프 전담 Web Worker (물리/문/열쇠/탈출문/몬스터 AI, 30Hz tick 브로드캐스트)
│   ├── launcher.js           # Launcher 메인 스레드 — 화면 감지, 로비 팝업 열기, Worker 생성, 앰비언트 BGM/텐션 제어
│   ├── replica.js            # 방 전용 로직 (rAF 코얼레싱 렌더링, 입력 중계, 자동 window.open/focus)
│   ├── render.js             # 캔버스 드로잉 (정적 방 캐시, 치비 캐릭터, 열쇠, 포탈/결계, 몬스터, 문 전환 이펙트, HUD)
│   ├── sound.js              # Web Audio API 절차적 효과음, 다크 앰비언트 드론 BGM, 몬스터 접근 심장박동 합성
│   ├── confetti.js           # 멀티스크린 전역 좌표계 기반 승리 꽃가루 시뮬레이션
│   ├── inspector.js          # 수신 패킷 로그 인스펙터 (Launcher)
│   └── minimap.js            # 모니터/그리드 미니맵 + Document PiP 전술 레이더 + 동기화 지표
└── .github/                  # GitHub Pages 자동 배포(deploy.yml) 및 PR 역검증 CI 봇
```

실행 주체는 세 종류다.

```
index.html (Launcher, 메인 스레드)
 ├─ Web Worker = Master ── 게임 상태, 물리, 문/열쇠/탈출문/몬스터 AI 판정, 30Hz tick
 ├─ 다크 앰비언트 BGM & 몬스터 접근 심장박동 오디오 스트림 (창 전환 시에도 끊김 없이 유지)
 ├─ 미니맵 + 동기화 지표 (ping 발신 / RTT 계측) + Document PiP 미니맵 호스팅
 └─ 인스펙터 (수신 패킷 로그)
        │ BroadcastChannel "dungeon-v1"
   ┌────┴─────────┬──────────────┬─────────────┐
 room.html      room.html      room.html     ...   ← Replica: 렌더링 + 입력 중계 + 자동 window.open
 (winId=lobby)  (room-xxxxxxxx)
```

> **Launcher ≠ 로비 방**: `index.html`은 게임 화면이 아니라 대시보드다. "게임 시작"을 누르면 `room.html#winId=lobby` 팝업이 첫 번째 방(로비 셀)으로 열린다. 이후 모든 방은 같은 `room.html`을 쓴다.

> **왜 Master를 Worker로 분리하는가**: 캐릭터가 다른 방으로 이동하면 Launcher 창은 배경이 된다. 메인 스레드의 `requestAnimationFrame`/`setInterval`은 배경 탭에서 강하게 스로틀링되지만(초당 1회 수준까지 저하), Web Worker 내부의 타이머는 탭 가시성과 무관하게 정상 주기로 동작한다. `BroadcastChannel`은 Worker 안에서도 그대로 쓸 수 있으므로 통신 프로토콜은 바뀌지 않는다.

---

## 3. 좌표계 및 동적 그리드 상수

세 단계 좌표 공간을 구분한다.

1. **Screen Space**: `getScreenDetails().screens[]`가 주는 물리 화면 좌표 (`availLeft/availTop/availWidth/availHeight`)
2. **Grid Space**: 각 화면을 `ROOM_SLOT_W × ROOM_SLOT_H` 물리 슬롯 단위로 좌상단부터 균등 타일링. 셀 ID = `` `${screenLabel}:${gx},${gy}` ``
3. **Local Space**: 방 캔버스 내부 콘텐츠 좌표 (`0 ~ ROOM_OUTER_W`, `0 ~ ROOM_OUTER_H`)

### 3.1 설정값 및 동적 방 크기 계산 (`config.js`)

```js
export const CONFIG = {
  ROOM_OUTER_W: 480,
  ROOM_OUTER_H: 337,
  ROOM_SLOT_W: 480,
  ROOM_SLOT_H: 400,
  CHROME_OVERHEAD_X: 0,
  CHROME_OVERHEAD_Y: 63, // Chrome macOS 팝업 실측 오버헤드 (타이틀바 28px + 주소표시줄 35px)
  TICK_HZ: 30,           // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8,     // 예약 값
  SINGLE_SCREEN_ONLY: true, // 메인 창이 위치한 단일 모니터만 맵으로 사용할지 여부
  PLAYER_SPEED: 6,          // 플레이어 기본 이동 속도 (px/tick)
  ENABLE_WALL_BOUNCE: true, // 벽 충돌 시 탄성 반동 적용 여부
  WALL_BOUNCE_STRENGTH: 2,  // 충돌 순간 넉백 세기 (충돌 속도 대비 배수)
  WALL_BOUNCE_DECAY: 0.6,   // 넉백 속도의 tick당 감쇠율
  MONSTER_SPEED: 2.5,       // 몬스터 추적 속도 (px/tick)
  MONSTER_WANDER_SPEED: 1.5 // 몬스터 평상시 순찰 속도 (px/tick)
};
```

- **`computeDynamicRoomSize(availWidth, availHeight)`**:
  - 모니터 가용 가로폭(`availWidth`)에 따라 열 수(`cols`: 2~5열)를 결정하고 `slotW = Math.floor(availWidth / cols)`를 계산한다.
  - 모니터 가용 세로폭(`availHeight`)에 따라 행 수(`rows`: 1~4행)를 결정하고 `slotH = Math.floor(availHeight / rows)`를 계산한다.
  - `window.open`의 `height`는 내부 뷰포트 기준이므로 브라우저 상단바 오버헤드(`CHROME_OVERHEAD_Y = 63px`)를 뺀 `roomH = slotH - overheadY`로 열어 상하 창 간 겹침을 방지한다. 또한 첫 팝업 생성 후 `window.outerHeight - window.innerHeight` 실측값을 `hello` 패킷으로 Master에 전달해 오버헤드를 동적으로 보정한다.

### 3.2 좌표 변환 함수 (`grid.js`)

```js
export function getSlotSize(cfg) {
  const slotW = cfg.ROOM_SLOT_W || cfg.ROOM_OUTER_W;
  const slotH = cfg.ROOM_SLOT_H || (cfg.ROOM_OUTER_H + (cfg.CHROME_OVERHEAD_Y || 0));
  return { slotW, slotH };
}

export function cellToScreenRect(screen, gx, gy, cfg) {
  const { slotW, slotH } = getSlotSize(cfg);
  return {
    left: screen.availLeft + gx * slotW,
    top: screen.availTop + gy * slotH,
    width: cfg.ROOM_OUTER_W,
    height: cfg.ROOM_OUTER_H,
  };
}

export function isCellValid(screen, gx, gy, cfg) { /* 슬롯 사각형이 화면 avail 영역 안에 들어가는지 */ }
export function cellId(screenLabel, gx, gy) { return `${screenLabel}:${gx},${gy}`; }
export function parseCellId(id) { /* "screenLabel:gx,gy" → { screenLabel, gx, gy } */ }
```

### 3.3 인접 셀 계산 — 모니터 경계 넘기 (`master-worker.js` `getAdjacentCell`)

1. 같은 화면 안에서 `(gx±1, gy±1)`이 `isCellValid`를 통과하면 그 셀.
2. 화면을 벗어나면 **주된 방향(Dominant Axis)** 으로 인접 모니터를 찾는다: 각 모니터 중심 간 `dx`, `dy`를 비교해 `|dx| > |dy|`이면 좌/우, 아니면 상/하 관계로 판정하고, 이동 방향과 일치하는 모니터 중 중심 거리가 가장 가까운 것을 고른다.
3. 대상 모니터의 **반대편 가장자리 셀**로 매핑한다.
4. 매핑 결과가 유효하지 않으면 `null` (벽).

---

## 4. 데이터 모델

```ts
interface ScreenRegion {
  label: string;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary: boolean;
}

interface Cell {
  id: string; // "screenLabel:gx,gy"
  screenLabel: string;
  gx: number;
  gy: number;
  doors: ("up" | "down" | "left" | "right")[];
  winId: string; // 'lobby' 또는 'room-xxxxxxxx'
  rect: { left: number; top: number; width: number; height: number };
}

interface PlayerState {
  cellId: string;
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  speed: number;
  radius: number; // 15
  facing: "up" | "down" | "left" | "right";
  stunTimer: number;         // 몬스터 피격 시 일시 스턴 틱 카운터 (14틱 ≈ 0.45초)
  invulnerableTimer: number; // 피격 후 무적 시간 틱 카운터 (75틱 = 2.5초)
}

interface MonsterState {
  cellId: string | null;
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  speed: number;
  wanderSpeed: number;
  radius: number; // 16
  state: "wandering" | "chasing";
  facing: "up" | "down" | "left" | "right";
  targetDir: "up" | "down" | "left" | "right" | null;
  passedCenter: boolean;
  lastEnteredFrom: "up" | "down" | "left" | "right" | null;
}
```

Master는 `screens`, `cellMap`, `player`, `monster`, `keyCellId`, `exitCellId`, `hasKey`, `isMuted`, 현재 키 상태(`keys`)를 메모리에 들고 있는 단일 진실 소스(SSOT)다.

---

## 5. 통신 프로토콜 (`protocol.js`)

채널명: `CONFIG.CHANNEL_NAME` (`"dungeon-v1"`). 모든 메시지 공통 형태: `{ type, from, t, ...payload }`.

### 5.1 Replica → Master

| type          | payload                                           | 설명                                                                                      |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `hello`       | `{ winId, overheadY, overheadX }`                 | 로드 직후 즉시(`0ms`) 및 `assign`을 받을 때까지 **40ms마다 반복**                         |
| `input`       | `{ keys: string[] }`                              | keydown/keyup으로 키 상태가 바뀔 때마다, `blur`/`focus`/`visibilitychange` 시 빈 배열     |
| `doorConfirm` | `{ winId, dir, targetWinId, actualRect }`         | 문 통과(`window.open` / `focus`) 실행 직후 전송                                           |
| `pong`        | `{ pingId }`                                      | `ping` 수신 시 `DungeonChannel`이 자동 응답                                               |
| `bye`         | `{ winId }`                                       | `beforeunload` 시                                                                         |

### 5.2 Launcher / Replica 양방향 제어

| type            | payload                                                     | 설명                                                                              |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `screensUpdate` | `{ screens, currentScreenLabel, roomW, roomH, slotW, slotH }` | 게임 시작 시, `hello` 수신 시마다, `screenschange`/`currentscreenchange` 시       |
| `ping`          | `{ pingId }`                                                | 1초마다 (`minimap.js`). RTT는 Launcher 및 PiP 미니맵에서 계측                     |
| `soundMuteSync` | `{ isMuted }`                                               | `[U]` 키 또는 런처 음소거 버튼 클릭 시 모든 창과 Master의 음소거 상태 동기화      |
| `pipClose`      | `{}`                                                        | 방 창에서 `[M]` 키로 Launcher가 띄운 PiP 미니맵을 원격 종료할 때                  |
| `pipState`      | `{ isOpen }`                                                | PiP 미니맵 열림/닫힘 상태 공유                                                    |

### 5.3 Master → 전체 (브로드캐스트)

| type           | payload                                                                                              | 설명                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `assign`       | `{ ...Cell, isExitRoom, isKeyRoom, hasKey, isMuted, doorTransition }`                                | `hello` 및 `doorConfirm` 수신 시 즉시 전송                                           |
| `tick`         | `{ activeCellId, lx, ly, vx, vy, facing, isStunned, isInvulnerable, hasKey, exitCellId, keyCellId, exitDiscovered, keyDiscovered, monsterTension, doorTransition, monster, tickCount, debugTime }` | `CONFIG.TICK_HZ` (30Hz)                                                              |
| `doorPrompt`   | `{ activeCellId, dir, willOpenNew, targetWinId, rect }` / `{ activeCellId, clear: true }`            | 플레이어가 문턱(`20px` 라인)에 도달했을 때 전송                                      |
| `keyCollected` | `{ activeCellId }`                                                                                   | 황금 열쇠 획득 시 1회                                                                |
| `doorLocked`   | `{ activeCellId }`                                                                                   | 열쇠 미소지 상태로 탈출문 접근 시 (1.5초 쿨다운)                                     |
| `monsterHit`   | `{ activeCellId }`                                                                                   | 몬스터 충돌 피격 시                                                                  |
| `victory`      | `{ winnerWinId, globalBounds, startTime }`                                                           | 열쇠 소지 후 탈출문 진입 시 1회                                                      |
| `closeAll`     | `{}`                                                                                                 | 승리 후 Space 입력, 또는 아무 창의 `bye` 수신 시                                     |

---

## 6. 핵심 구현 제약 및 해결 방식

**① 이동 키의 Transient User Activation을 활용한 자동 문 통과 (`executeDoorTransition`)**
브라우저는 사용자 상호작용 없이 호출된 `window.open`을 차단하지만, 키보드(`keydown`) 입력 시 약 5초간 유지되는 **Transient User Activation**(`navigator.userActivation.isActive`)을 부여한다. 플레이어가 방향키/WASD를 눌러 문턱까지 걸어가는 입력 자체가 유효한 User Activation을 활성화하므로, `doorPrompt` 수신 즉시 별도의 Space 키 입력 없이 `window.open` 또는 `window.open('', targetWinId).focus()`를 실행한다. (만약 팝업이 차단된 경우에만 안내 프롬프트를 렌더링하고 Space 키 폴백을 허용한다.)

**② `Window` 객체는 `BroadcastChannel`로 전달할 수 없다 (structured clone 불가).**
창 이름(`window.name = winId`)을 주소로 사용한다. 새 창은 `window.open(url, targetWinId, features)`로 열고, 기존 방으로 돌아갈 때는 `window.open('', targetWinId).focus()`로 포커스를 전환한다.

**③ 신규 팝업 오픈 시 하얀 플래시(White Flash) 제거**
`room.html`에 인라인 다크 배경(`#090a0d`)을 지정하고, `replica.js` 로드 즉시 동기적으로 첫 번째 `renderFrame()`을 호출하며, `hello`를 `0ms` 즉시 발송 + Master가 `doorConfirm` 직후 `assign`을 선발송하여 창이 뜨는 첫 프레임부터 던전 그래픽이 렌더링되게 했다.

**④ 정적 방 레이어 오프스크린 캐싱 및 HiDPI 대응 (`render.js`)**
매 프레임 반복되는 바닥 석재 타일, 비네팅, 3D 흑요석 외곽 벽은 `getStaticRoomCanvas(W, H)`를 통해 오프스크린 캔버스에 1회만 베이킹하고 매 프레임 `ctx.drawImage`로 복사한다. 또한 `setupHiDPICanvas`를 통해 `devicePixelRatio`를 반영하여 레티나 디스플레이에서도 텍스트와 그래픽이 선명하게 출력된다.

---

## 7. 게임 로직

### 7.1 던전 엔티티 배치 (`generateDungeonEntities`)
- 로비 셀 `(0, 0)`에서 BFS로 도달 가능한 전체 가상 그리드 셀을 탐색한다.
- 시연 및 플레이 템포에 맞춰 거리 1~2인 방 중 무작위 두 곳에 각각 **[잠긴 탈출문(`exitCellId`)]**과 **[황금 열쇠(`keyCellId`)]**를 분리 배치한다.
- **[그림자 몬스터(`monster`)]**는 시작 직후 로비 기습을 방지하기 위해 거리 2 이상 떨어진 방에 배치하고 3초(90틱) 대기 후 순찰을 시작한다.

### 7.2 이동, 문턱 진입 및 벽 충돌
- 입력: 방향키, `WASD`, 또는 한글 자판 `ㅈㅁㄴㅇ` (영문 전환 없이 동일 동작).
- 외곽 벽 두께 20px. 일반 벽 구간에서는 `[20 + radius, ROOM_OUTER - 20 - radius]`로 클램프하고 탄성 넉백(`ENABLE_WALL_BOUNCE`)을 적용한다.
- **문턱 진입 허용**: 폭 80px의 문이 뚫려 있는 구간(`isAtDoorOpening`)에서는 넉백을 발생시키지 않으며, 외곽 벽 안쪽 `16px`까지 걸어 들어갈 수 있게 허용한다.
- **문 통과 판정**: 캐릭터가 문턱(`20px` 라인)에 도달하고 해당 문 방향으로 이동 중일 때 `doorPrompt`를 발송한다. 다음 방으로 넘어갈 때는 반대편 문틀 바로 앞(`24px`, 중앙 정렬)에 배치되며, 출발 창과 도착 창 양쪽 문에서 가벼운 빛 줄기 전환 이펙트(`drawDoorTransitionEffects`)가 재생된다.

### 7.3 백그라운드 몬스터 AI (`updateMonsterAI`)
- 몬스터는 창이 열려 있지 않은 방에서도 쿨다운 순간이동 없이 **방 입구 → 방 중앙(`passedCenter`) → 목표 문(`getDoorPosition`)** 순서로 매 틱 실제 좌표를 이동한 뒤 인접 방으로 넘어간다.
- 플레이어와 같은 방이거나 인접한 방(거리 1)에 있으면 `chasing` 상태가 되어 플레이어 방과 연결된 문을 향해 이동하고, 같은 방에서는 플레이어를 직접 추격한다.
- 충돌 시 플레이어에게 넉백 + 0.45초 스턴(`stunTimer = 14`) + 2.5초 무적 프레임(`invulnerableTimer = 75`)을 부여하고, 몬스터도 1.5초(`attackCooldown = 45`)간 경직된다.

### 7.4 사운드 및 다크 앰비언트/텐션 시스템 (`sound.js`)
- Launcher에서 게임 시작 시 저주파 드론(55Hz A1 + 82.41Hz E2 + 로우패스 필터 LFO) 기반의 은은한 다크 앰비언트 배경음(`startAmbient`)을 재생한다.
- 매 틱 계산되는 `monsterTension`(`0` ~ `1.0`)에 따라 몬스터가 옆방 또는 같은 방에 접근하면 불협 배음과 심장박동(`playHeartbeatPulse`, Lub-Dub) 사운드가 자동으로 페이드인된다.
- 열쇠 획득(`playKey`), 잠긴 문(`playLocked`), 문 이동(`playDoorPass`), 피격(`playMonsterHit`), 승리(`playVictory`, Cmaj9 포탈 공명 패드 + 크리스탈 차임 아르페지오) 효과음을 오실레이터로 즉각 합성한다.

---

## 8. UI 및 플랫폼 가드

### 8.1 플랫폼/브라우저 가드 (`index.html`, `launcher.js`)
- **모바일 접속 시**: 스마트폰/태블릿 감지 시 시작 화면 대신 데스크톱 Chrome 안내 카드(`#mobile-card`)와 URL 복사 버튼을 표시한다.
- **데스크톱 비호환 브라우저(Safari / Firefox) 접속 시**: `getScreenDetails` 또는 `documentPictureInPicture` 미지원 브라우저 감지 시 상단에 `⚠️ Safari/Firefox 감지됨 — Chrome 권장` 배너(`#browser-warning-banner`)와 링크 복사 버튼을 노출한다.

### 8.2 Always-on-Top 전술 미니맵 (`minimap.js`)
- 게임 중 `[M]`(또는 `ㅡ`) 키를 누르면 `documentPictureInPicture.requestWindow({ width: 350, height: 260 })`를 통해 OS 최상단 플로팅 미니맵을 열고 닫는다.
- 모니터별 동적 슬롯 크기(`slotW`, `slotH`)를 반영하여 개척된 방, 플레이어(`🟢`), 발견된 탈출문(`🚪`/`🔒`), 열쇠(`🔑`), 실시간 이동 중인 몬스터(`👾`) 위치와 하단 범례를 렌더링한다.

---

## 9. 구현 현황

| 항목                                                          | 상태   | 비고                                                       |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| 해상도 맞춤형 동적 그리드 타일링 (`computeDynamicRoomSize`)   | 완료   | `CHROME_OVERHEAD_Y` 보정 포함                              |
| 통신 계층 + RTT/메시지 수 계측 (`channel.js`)                 | 완료   |                                                            |
| Master 코어 (Worker 30Hz 루프, 물리/문/열쇠/탈출문/몬스터 AI) | 완료   |                                                            |
| Replica 렌더러 (HiDPI + 오프스크린 정적 방 캐시 + rAF 코얼레싱)| 완료   |                                                            |
| 이동 키 기반 심리스 자동 문 통과 + 크로스 윈도우 전환 이펙트  | 완료   | 팝업 차단 시에만 Space 폴백 프롬프트 표시                  |
| Document PiP 전술 미니맵 (`[M]` 토글) + 패킷 인스펙터         | 완료   |                                                            |
| Web Audio API 효과음 + 다크 앰비언트 BGM + 몬스터 심장박동    | 완료   | `[U]` 키 및 런처 버튼 전역 음소거 동기화                   |
| 멀티스크린 연속 승리 꽃가루 (`confetti.js`)                   | 완료   |                                                            |
| 모바일 가드 카드 & 데스크톱 Safari/Firefox 안내 배너          | 완료   |                                                            |
| GitHub Pages 자동 배포 파이프라인 (`.github/workflows/deploy.yml`) | 완료 |                                                            |

---

## 10. 알려진 제약 및 대응

| 제약                                                                                    | 대응 / 현황                                                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 팝업은 유저 활성화(User Activation)가 살아있을 때만 열림                                | 방향키/WASD 이동 입력이 부여하는 5초간의 Transient User Activation을 활용해 문 도달 즉시 자동 오픈              |
| `window.focus()`가 유저 제스처 밖에서 막힘 + Window 참조는 BroadcastChannel로 전달 불가 | `window.name`을 주소로 써서 `window.open('', targetWinId).focus()`로 참조 획득 및 포커스 이동                   |
| 백그라운드 탭 스로틀링 (Launcher가 배경으로 갈 때)                                      | Master 루프를 Web Worker로 분리하고, 연속 앰비언트 오디오를 Launcher에 호스팅하여 스로틀링 완전 회피            |
| 신규 팝업 오픈 순간의 하얀 화면 깜빡임(White Flash)                                     | `room.html` 인라인 다크 배경 + 동기 초기 렌더링 + `0ms` 즉시 `hello` 및 `assign` 선발송으로 제거                |
| 창 간 포커스 이동 시 이전 창에 키 입력이 남는 고스트 키(Ghost Key) 현상                 | 방 이동, `blur`, `focus`, `visibilitychange`, 비활성 방 틱마다 입력 버퍼를 강제 초기화                          |
| 한글 IME 상태에서 영문 단축키 미인식                                                    | `e.code`(`KeyW/A/S/D/M/U`) 및 한글 자모(`ㅈㅁㄴㅇ`, `ㅡ`, `ㅕ`) 양방향 매핑                                     |

---

## 11. 초기 기획 대비 변경점

| 초기 기획                                                     | 실제 구현                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 고정 400×400 방 크기                                          | 모니터 해상도 및 브라우저 상단바 오버헤드(63px)에 맞춘 동적 균등 분할 (`computeDynamicRoomSize`)       |
| 문 앞에서 `[Space]` 키를 눌러야만 방 이동                     | 이동 키의 Transient User Activation을 활용해 문턱 도달 즉시 자동으로 새 창 오픈 및 방 이동             |
| 단순 깃발(🚩) 찾기 단일 목표                                  | 황금 열쇠(🔑) 획득 ➔ 봉인된 고대 탈출문(🚪) 개방 + 백그라운드 연속 순찰/추격 몬스터(👾) AI            |
| 몬스터 방 간 타이머 순간이동                                  | 미개척 방에서도 실제로 방 입구 ➔ 중앙 ➔ 목표 문까지 걸어서 이동하는 연속 패스파인딩                    |
| 메인 런처에만 존재하는 미니맵 (팝업에 가려짐)                 | Document Picture-in-Picture API 기반 Always-on-Top 플로팅 전술 레이더 (`[M]` 토글)                     |
| 무음(사운드 없음)                                             | Web Audio API 오실레이터 기반 효과음 + 다크 앰비언트 드론 BGM + 몬스터 접근 심장박동 사운드            |
| 단일 창 내부에서만 보이는 클리어 연출                         | 모니터 전체 전역 좌표계를 관통해 위 창에서 아래 창으로 이어져 떨어지는 멀티스크린 꽃가루(`confetti.js`)|

---

## 12. 부록 — PR 역검증 CI 봇 (`.github/`)

게임과 별개로, PR 작성자가 자기 변경을 이해하고 있는지 확인하는 GitHub Actions 봇이 들어 있다.

- **트리거**: `pull_request`(opened/synchronize/reopened), PR에 달린 `issue_comment`
- **PR 이벤트**: Gemini가 diff를 보고 사소한 변경(문서/포맷/소규모 상수 등)인지 판정
  - 사소함 → 자동 승인 댓글 + commit status `success` + APPROVE 리뷰
  - 실질 변경 → commit status `pending` + 코드 확인 질문 1~2개 댓글
- **댓글 이벤트**: PR 작성자 본인의 답글만 채점. 통과 시 `success` + APPROVE, 미흡 시 `failure`
- 작성자 답변은 `<author_answer>` 태그로 감싸 신뢰할 수 없는 데이터로 취급하도록 지시한다 (프롬프트 인젝션 완화)
- 필요한 시크릿: `GEMINI_API_KEY` (모델 기본값 `gemini-2.5-pro`, 404 시 후보 모델로 폴백)
