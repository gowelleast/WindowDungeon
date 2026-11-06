# 브라우저 창 던전 크롤러 — 기술 스펙

> 이 문서는 **현재 구현된 코드 기준**의 기술 스펙이다. 초기 프로토타입 기획에서 실제 개발·리팩토링 과정을 거치며 완성된 5-스테이지 아키텍처와 변경 사항을 반영했다.
> 초기 기획과 달라진 주요 지점은 [11. 초기 기획 대비 변경점](#11-초기-기획-대비-변경점)에 정리한다.

## 0. 프로젝트 개요

작은 브라우저 창 하나가 게임의 방(room) 하나가 된다. 방의 벽에 문이 있고, 방향키(또는 WASD)로 문턱에 닿으면 이동 키 입력이 부여한 **Transient User Activation**을 활용해 그 방향에 실제 새 브라우저 창이 자동으로 열리면서 다음 방으로 이동한다.

게임은 총 **5개의 연속 스테이지(5-Stage Progression)**로 구성되며, 각 스테이지 클리어 시 현재 방을 제외한 이전 방 창들이 개척 순서대로 도미노처럼 닫히고(**Sequential Window Cascade**) 남은 방에서 곧바로 다음 스테이지가 시작된다.

1. **Stage 1 (미궁 탈출)**: 순찰하는 몬스터(👾)를 피해 **열쇠(🔑)**와 **황금방 아이템(🗺️ 지도 / 👢 신발)**을 획득한 뒤 **탈출문(🚪)**을 열어 이동.
2. **Stage 2 (영역 점령전)**: 제한 시간 내에 방들을 돌아다니며 중앙 **깃발(🏳️)**을 `[Space]`로 점령해 적 몬스터보다 많은 방을 **내 영토(🟢)**로 확보.
3. **Stage 3 (성검 활성)**: 어두운 방들 사이로 **발사대(⚡)**와 **프리즘(💎)**을 `[Space]`로 회전시켜, 열린 창들을 관통하는 빛을 **성검(🗡️)** 제단에 연결해 성검을 활성화.
4. **Stage 4 (성검 포획)**: 밝아진 맵에서 방과 방 사이를 날아다니는 **성검(🗡️)**을 문 앞 `[Space]` **문 레버(🔒)**로 막아 **그로기(💫)** 상태로 만든 뒤 포획. 검을 잡는 순간 맵과 배경의 밝음이 성검으로 흡수되며 다시 어두워짐.
5. **Stage 5 (보스전)**: 5초간 **탄막 회피(`barrage`)** 후, 결계가 풀리면 방들을 탐색해 **보스(👑)**에게 `[Space]` **공격**을 가하는 추격전(`searching` ➔ `hit` ➔ 순간이동 루프)을 통해 보스(HP 3)를 처치하면 최종 클리어.

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
| 렌더링        | `<canvas>` 2D context (High-DPI `devicePixelRatio` 스케일링 + 스테이지 테마별 정적 방 레이어 오프스크린 캐싱) |
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
├── index.html                # Launcher (대시보드) 진입점 — 게임 시작/리셋, 인접 방 프리뷰 연출, 미니맵, 인스펙터
├── room.html                 # 방(Replica) 진입점. 로비 방도 이 페이지를 winId=lobby로 연다
├── style.css                 # 공용 스타일시트 (런처, 인접 방 팬텀 카드 애니메이션, 승리 모달, PiP 미니맵 등)
├── src/
│   ├── config.js             # 창 크기, 동적 그리드 분할(computeDynamicRoomSize), tick 주기, 물리/몬스터 파라미터
│   ├── protocol.js           # 메시지 타입 상수
│   ├── grid.js               # 좌표계 계산 (screen ↔ grid ↔ cellId, parseCellId, getSlotSize)
│   ├── channel.js            # BroadcastChannel 래퍼 (다중 핸들러, 로컬 emit, RTT 계측)
│   ├── master-worker.js      # 게임 루프 전담 Web Worker (5-Stage 물리/문/몬스터/성검/보스 AI, 30Hz tick 브로드캐스트)
│   ├── launcher.js           # Launcher 메인 스레드 — 화면 감지, 인접 방 프리뷰 스포너, 로비 팝업 열기, Worker 생성
│   ├── replica.js            # 방 전용 로직 (rAF 코얼레싱 렌더링, 입력 중계, 자동 window.open/focus, 스테이지 전환)
│   ├── render.js             # 캔버스 드로잉 (스테이지별 바닥/조명, 캐릭터, 열쇠/유물, 깃발, 레이저/성검, 마왕, HUD)
│   ├── sound.js              # Web Audio API 절차적 효과음, 다크 앰비언트 드론 BGM, 몬스터 접근 심장박동 합성
│   ├── confetti.js           # 멀티스크린 전역 좌표계 기반 승리 꽃가루 시뮬레이션
│   ├── inspector.js          # 수신 패킷 로그 인스펙터 (Launcher)
│   └── minimap.js            # 모니터/그리드 미니맵 + Document PiP 전술 레이더 + 동기화 지표
└── .github/                  # GitHub Pages 자동 배포(deploy.yml) 및 PR 역검증 CI 봇
```

실행 주체는 세 종류다.

```
index.html (Launcher, 메인 스레드)
 ├─ Web Worker = Master ── 5-Stage 게임 상태, 물리, 몬스터/비행 성검/심연의 마왕 AI 판정, 30Hz tick
 ├─ 다크 앰비언트 BGM & 몬스터 접근 심장박동 오디오 스트림 (창 전환 시에도 끊김 없이 유지)
 ├─ 미니맵 + 동기화 지표 (ping 발신 / RTT 계측) + Document PiP 미니맵 호스팅
 └─ 인스펙터 (수신 패킷 로그)
        │ BroadcastChannel "dungeon-v1"
   ┌────┴─────────┬──────────────┬─────────────┐
 room.html      room.html      room.html     ...   ← Replica: 렌더링 + 입력 중계 + 자동 window.open
 (winId=lobby)  (room-xxxxxxxx)
```

> **Launcher ≠ 로비 방**: `index.html`은 게임 화면이 아니라 대시보드다 (`min-width: 760px; min-height: 640px; overflow: hidden` 및 중앙 `.start-card` 옆에 동적 생성되는 `.phantom-room-card` 프리뷰 애니메이션 포함). "게임 시작"을 누르면 `room.html#winId=lobby` 팝업이 첫 번째 방(로비 셀)으로 열린다. 이후 모든 방은 같은 `room.html`을 쓴다.

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
  speed: number; // 기본 6, 바람의 신발 획득 시 7.8 (+30%)
  radius: number; // 15
  facing: "up" | "down" | "left" | "right";
  stunTimer: number;         // 피격 시 일시 스턴 틱 카운터
  invulnerableTimer: number; // 피격 후 무적 시간 틱 카운터
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

interface FlyingSwordState {
  cellId: string | null;
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  angle: number;
  state: "awakening" | "flying" | "groggy" | "trapped";
  passedCenter: boolean;
  targetDir: "up" | "down" | "left" | "right" | null;
  awakeningTimer: number;
  groggyTimer: number; // 닫힌 철창 충돌 시 84틱(2.8초) 스턴 카운트다운
  lastEnteredFrom: "up" | "down" | "left" | "right" | null;
  lastBouncedDir: "up" | "down" | "left" | "right" | null;
}

interface BossState {
  cellId: string | null;
  lx: number;
  ly: number;
  hp: number;    // 초기 3
  maxHp: number; // 3
  state: "barrage" | "searching" | "hit" | "dying";
  barrageCellId: string | null; // 현재 5초 탄막 결계가 작동 중인 방 ID
  actionTimer: number;          // 탄막(150틱=5초), 피격 경직(24틱), 소멸(52틱) 타이머
  searchTimer: number;          // 보스 수색 제한 시간 (330틱=11초)
  bullets: Array<{ x: number; y: number; vx: number; vy: number; r: number; color: string }>;
  slashEffect: { cellId: string; x: number; y: number; angle: number; timer: number; maxTimer: number } | null;
}
```

Master는 `currentStage` (`1 ~ 5`), `screens`, `cellMap`, `player`, `monster`, Stage 1 엔티티(`keyCellId`, `exitCellId`, `goldenCellId`, `hasKey`, `hasMapItem`, `hasBootsItem`), Stage 2 영토 맵(`flagOwners`, `stage2TimeLeft`), Stage 3 레이저 퍼즐(`laserSourceCellId`, `laserTargetCellId`, `prismDirs`, `laserSegments`, `laserConnected`), Stage 4 성검 & 철창(`closedGates`, `flyingSword`, `hasLegendarySword`, `swordAwakenTimer`), Stage 5 최종 보스(`boss`)를 메모리에 들고 있는 단일 진실 소스(SSOT)다.

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
| `bye`         | `{ winId }`                                       | `beforeunload` 시 (단, 스테이지 전환 `CLOSE_ROOM`으로 닫히는 창은 제외)                   |

### 5.2 Launcher / Replica 양방향 제어

| type            | payload                                                     | 설명                                                                              |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `screensUpdate` | `{ screens, currentScreenLabel, roomW, roomH, slotW, slotH }` | 게임 시작 시, `hello` 수신 시마다, `screenschange`/`currentscreenchange` 시       |
| `ping`          | `{ pingId }`                                                | 1초마다 (`minimap.js`). RTT는 Launcher 및 PiP 미니맵에서 계측                     |
| `soundMuteSync` | `{ isMuted }`                                               | `[U]` 키 또는 런처 음소거 버튼 클릭 시 모든 창과 Master의 음소거 상태 동기화      |
| `pipClose`      | `{}`                                                        | 방 창에서 `[M]` 키로 Launcher가 띄운 PiP 미니맵을 원격 종료할 때                  |
| `pipState`      | `{ isOpen }`                                                | PiP 미니맵 열림/닫힘 상태 공유                                                    |

### 5.3 Master → 전체 (브로드캐스트)

| type              | payload                                                                                              | 설명                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `assign`          | `{ ...Cell, stage, isExitRoom, isKeyRoom, isGoldenRoom, flagOwner, prismDir, closedDoors, ... }`     | `hello`, `doorConfirm`, 스테이지 전환 완료 시 즉시 전송                              |
| `tick`            | `{ stage, activeCellId, lx, ly, hasKey, hasMapItem, hasBootsItem, flagOwners, laserSegments, closedDoorsByCell, flyingSword, boss, monster, ... }` | `CONFIG.TICK_HZ` (30Hz)                                                              |
| `doorPrompt`      | `{ activeCellId, dir, willOpenNew, targetWinId, rect }` / `{ activeCellId, clear: true }`            | 플레이어가 열린 문턱(`20px` 라인)에 도달했을 때 전송                                 |
| `stageTransition` | `{ phase: 'start' \| 'complete', fromStage, toStage, activeCellId, activeWinId }`                    | 스테이지 전환 시작(페이드아웃) 및 이전 창 정리 후 새 스테이지 개시(페이드인) 알림    |
| `closeRoom`       | `{ targetWinId, cellId, closedCount, totalClosing }`                                                 | 스테이지 전환 시 개척 순서대로 이전 방 창을 160ms 간격으로 하나씩 닫는 명령          |
| `keyCollected`    | `{ activeCellId }`                                                                                   | Stage 1 황금 열쇠 획득 시                                                            |
| `itemCollected`   | `{ activeCellId, itemType, hasMapItem, hasBootsItem }`                                               | Stage 1 황금방 패시브 유물(`map` 또는 `boots`) 획득 시                               |
| `doorLocked`      | `{ activeCellId }`                                                                                   | Stage 1 열쇠 미소지 상태로 탈출문 접근 시 (1.5초 쿨다운)                             |
| `flagCaptured`    | `{ cellId, owner, activeCellId }`                                                                    | Stage 2 깃발 점령 시 (`player` 또는 `monster`)                                       |
| `laserRotated`    | `{ cellId, dir, connected, activeCellId }`                                                           | Stage 3 프리즘 회전 또는 빛을 잃은 성검에 레이저 연결 성공 시                        |
| `gateToggled`     | `{ cellId, dir, isClosed, activeCellId }`                                                            | Stage 4 문 옆 철창 레버 개폐 시 (또는 성검 그로기 해제 시 철창 돌파)                 |
| `swordBounced`    | `{ cellId, isTrapped, isGroggy, activeCellId }`                                                      | Stage 4 고속 비행 성검이 닫힌 철창에 부딪혀 스턴/그로기에 빠졌을 때                  |
| `swordDrawn`      | `{ cellId, activeCellId }`                                                                           | Stage 4 그로기 상태의 전설의 성검 포획 성공 시                                       |
| `bossWarning`     | `{ phase: 'search_start' \| 'teleport_barrage' \| 'timeout_barrage', activeCellId }`                 | Stage 5 탄막 결계 해제(수색 시작) 또는 보스 순간이동/시간초과 탄막 재발동 알림       |
| `bossAttack`      | `{ activeCellId, silent }`                                                                           | Stage 5 심연 포탈 탄막 발사 시                                                       |
| `bossHit`         | `{ fromCellId, bossCellId, hp, maxHp, isDefeated, activeCellId }`                                    | Stage 5 성검 참격으로 심연의 마왕 타격 성공 시                                       |
| `monsterHit`      | `{ activeCellId }`                                                                                   | 몬스터 또는 보스 탄막 충돌 피격 시                                                   |
| `victory`         | `{ winnerWinId, stage, playerScore, monsterScore, globalBounds, startTime }`                         | Stage 5 최종 보스 격파 시 1회                                                        |
| `closeAll`        | `{}`                                                                                                 | 승리 후 Space 입력(1.8초 보호 후), 또는 일반 플레이 중 방 창 강제 종료 시            |

---

## 6. 핵심 구현 제약 및 해결 방식

**① 이동 키의 Transient User Activation을 활용한 자동 문 통과 (`executeDoorTransition`)**
브라우저는 사용자 상호작용 없이 호출된 `window.open`을 차단하지만, 키보드(`keydown`) 입력 시 약 5초간 유지되는 **Transient User Activation**(`navigator.userActivation.isActive`)을 부여한다. 플레이어가 방향키/WASD를 눌러 문턱까지 걸어가는 입력 자체가 유효한 User Activation을 활성화하므로, `doorPrompt` 수신 즉시 별도의 Space 키 입력 없이 `window.open` 또는 `window.open('', targetWinId).focus()`를 실행한다.

**② 스테이지 전환 시 도미노 창 닫힘(Sequential Window Cascade)과 생존 방 재사용 (`startStageTransition`)**
스테이지를 클리어했을 때 모든 창을 닫고 다시 열면 브라우저 팝업 차단 정책에 걸릴 수 있다. 이를 해결하기 위해 **현재 플레이어가 위치한 마지막 방(`survivingCell`)은 닫지 않고 페이드아웃 상태로 유지**한 채, 이전에 열었던 방들(`cellMap` 삽입 순서)만 `160ms` 간격으로 `MSG.CLOSE_ROOM`을 보내 순차적으로 닫는다. 이때 닫히는 창들이 보내는 `BYE` 메시지가 전체 종료(`CLOSE_ALL`)를 유발하지 않도록 `closingWinIds`와 `isClosingByCascade` 플래그로 보호하며, 모든 이전 창이 닫힌 뒤 살아남은 방을 새 스테이지의 시작 방으로 즉시 전환한다.

**③ 스테이지별 정적 방 레이어 오프스크린 캐싱 및 다이나믹 라이팅 (`render.js`)**
`getStaticRoomCanvas(W, H, themeKey)`를 통해 스테이지별 바닥 테마를 오프스크린 캔버스에 베이킹하여 매 프레임 고속 복사한다:
- **Stage 1 & Stage 5 (`default`)**: 클래식 다크 석재 타일(`#14171d`)과 기본 랜턴 어둠(`0.75`).
- **Stage 2 (`stage2-tactical`)**: 청회색 슬레이트 전술 타일(`#161b24`), 점선 전술 구역 테두리, 중앙 컴퍼스 크로스라인.
- **Stage 3 (`stage3-dark`)**: 칠흑의 흑요석 바닥(`#0b0d12`)과 가장 깊은 어둠(`0.88`) 위에 크로스 윈도우 레이저 광선이 지나가는 경로만 강렬하게 밝혀지는 조명 대비.
- **Stage 4 (`stage4-bright`)**: 성검의 부활로 모든 스테이지 중 가장 밝은 황금빛 성소 타일(`#333b4d`)과 밝은 조명으로 시작하며, 플레이어가 성검을 포획하는 순간(`hasLegendarySword === true`) 방 전체의 밝은 빛이 성검의 위치 `(sx, sy)`로 수축·흡수(`swordAwakenProgress: 0 ➔ 1`)되며 다시 어두운 던전으로 돌아간다.

---

## 7. 5-스테이지 게임 로직 상세

### 7.1 Stage 1 — 미궁 탈출 & 황금방 아이템 (`generateDungeonEntities`)
- 거리 1~2 방에 **[탈출문(`exitCellId`)]**, **[열쇠(`keyCellId`)]**, 그리고 겹치지 않는 방에 **[황금방(`goldenCellId`)]**을 배치한다.
- 황금방에서는 전 스테이지 내내 유지되는 패시브 아이템 중 하나가 등장한다:
  - `🗺️ 지도 (map)`: 미니맵에 미개척 방 전체 구조, 목표 방 위치, 그리고 미개척 방을 배회하는 적/성검의 실시간 위치를 영구 공개.
  - `👢 신발 (boots)`: 플레이어 이동 속도를 영구히 **+30%** 증가 (`6 ➔ 7.8 px/tick`).
- 열쇠를 획득해 탈출문에 도달하면 도미노 창 닫힘 연출과 함께 Stage 2로 진입한다.

### 7.2 Stage 2 — 룬스톤 & 오팔 점령전 (`findBestStage2Dir`)
- 모든 방 중앙에 고대 **룬스톤과 오팔(`neutral`)**이 배치된다. 플레이어는 룬스톤 근처에서 `[Space]`를 눌러 **내 룬스톤(`💠 player`)**으로 점령하며, 점령된 오팔은 Stage 3에서 사용될 레이저 광선 빛(청록·황금)으로 눈부시게 빛난다.
- Stage 2의 몬스터는 플레이어 추격 대신 BFS 최단 경로(`findBestStage2Dir`)를 계산해 미점령 방들의 중앙 룬스톤을 빠르게 점령(`🔴 monster`)하며, 적이 점령한 오팔은 검붉고 어두운 색으로 침식된다.
- 제한 시간(`방 개수 + 5초`, 최대 20초, 동점/열세 시 서든데스 `OVERTIME`) 종료 시 플레이어 점령 방 수가 더 많으면 Stage 3로 진입한다.

### 7.3 Stage 3 — 크로스 윈도우 레이저 & 빛을 잃은 성검 부활 (`computeLaserPath`)
- Stage 2에서 깨어난 **룬스톤과 오팔(💎)**을 이용해 레이저를 굴절·증폭하는 퍼즐 스테이지다. 시작 방 중앙의 **에너지 발사대(⚡)**에서 레이저가 발사되며, 각 방 중앙의 **룬스톤 오팔(💎)** 앞에서 `[Space]`를 누르면 그 방에 실제로 존재하는 출입문 방향으로만 광선이 회전한다.
- **핵심 규칙**: 인접한 방의 브라우저 창이 실제로 열려 있어야만(`cellMap.has(nextId)`) 레이저가 창 너머로 통과한다. 창이 닫혀 있으면 문턱에서 스파크를 내며 막힌다.
- 거리 2 이상 떨어진 목표 방의 갈라진 고대 석조 제단에 꽂힌 **빛을 잃은 성검(🗡️)**에 레이저가 도달하면, 회색 석화 상태였던 성검이 빛을 흡수하며 황금빛 성검으로 부활하고 Stage 4로 진입한다.

### 7.4 Stage 4 — 도망치는 자아 성검 포획작전 (`updateFlyingSwordAI`)
- 부활한 성검(🗡️)이 자아를 얻고 열린 문들을 통과하며 방에서 방으로 고속 비행(`SWORD_FLY_SPEED = 7.2`)한다. 플레이어가 다른 방에 있더라도 성검은 독립적으로 방 입구 ➔ 방 중앙 ➔ 다음 문 경로로 쉬지 않고 이동한다.
- 플레이어는 각 방의 문 옆 **기계식 철창 레버** 앞에서 `[Space]`를 눌러 문을 철창(`🔒`)으로 닫거나 열 수 있다. 닫힌 문은 플레이어, 몬스터, 성검 모두 통과할 수 없다.
- 고속 비행하던 성검이 닫힌 철창에 부딪히면 튕겨 나오며 약 2.8초(`84틱`) 동안 **스턴/그로기(`groggy` / `trapped`)** 상태에 빠져 별을 흘리며 멈춘다. (그로기 시간이 끝날 때까지 방치하면 성검이 다시 깨어나 열린 문으로 도주하며, 모든 문이 닫혀 있었다면 충격파로 철창 하나를 강제로 열고 탈출한다.)
- 그로기 상태인 성검에게 다가가거나 `[Space]`를 누르면 성검을 손에 넣으며, 맵 전체의 밝은 빛이 성검 속으로 흡수된 뒤 Stage 5로 진입한다.

### 7.5 Stage 5 — 심연의 마왕 최종 보스전 (`updateStage5BossAI`)
- 시작 방에 진입하자마자 **1차 탄막 피하기 페이즈(`barrage`, 5초 = 150틱)**가 발동된다:
  - 현재 방의 모든 문이 붉은 심연 결계로 봉쇄되고, 방의 네 모서리 심연 포탈에서 조준 확산탄과 회전 나선 탄막이 쏟아진다.
- 5초간 탄막을 버텨내면 결계가 해제되고 **보스 수색 & 성검 참격 페이즈(`searching`, 제한 시간 11초 = 330틱)**가 시작된다:
  - 플레이어는 열린 문들을 통해 방들을 돌아다니며 은신한 **심연의 마왕(👑, HP 3)**을 찾는다.
  - 마왕이 있는 방에 들어가 마왕 근처에서 `[Space]`를 누르면 황금빛 **성검 참격**이 작렬하며 마왕의 체력을 1 깎는다.
  - 참격을 맞은 마왕(`hit`)은 다른 방으로 순간이동하며, 플레이어가 서 있는 방에 즉시 다음 5초 탄막 결계(`barrage`)를 발동시킨다. (보스 체력이 줄어들수록 탄막 발사 주기와 탄속이 빨라진다.)
  - 만약 11초(`searchTimer <= 0`) 동안 마왕을 찾지 못해 시간이 초과되면, 플레이어의 현재 방에서 다시 탄막 결계가 발동된다.
- 총 3회의 성검 참격으로 마왕의 체력을 0으로 만들면 대폭발 연출(`dying`)과 함께 전 모니터에 승리 꽃가루(`MultiScreenConfetti`)가 쏟아진다.

---

## 8. UI 및 플랫폼 가드

### 8.1 플랫폼/브라우저 가드 및 런처 인접 방 연출 (`index.html`, `launcher.js`)
- **모바일 접속 시**: 스마트폰/태블릿 감지 시 시작 화면 대신 데스크톱 Chrome 안내 카드(`#mobile-card`)와 URL 복사 버튼을 표시한다.
- **데스크톱 비호환 브라우저(Safari / Firefox) 접속 시**: 상단에 `⚠️ Safari/Firefox 감지됨 — Chrome 권장` 배너(`#browser-warning-banner`)와 링크 복사 버튼을 노출한다.
- **메인 런처 인접 방 프리뷰 애니메이션 (`initLauncherAdjacentRoomAnimation`)**: 시작 화면(`.start-card`) 양옆에 동일한 크기의 `.phantom-room-card`가 주기적으로 생성되어, 미니 모험가가 방을 가로질러 다음 방 문으로 넘어가는 애니메이션을 보여주며 스크롤바가 생기지 않도록 `overflow: hidden` 및 최소 크기(`760×640px`)가 적용되어 있다.

### 8.2 Always-on-Top 전술 미니맵 (`minimap.js`)
- 게임 중 `[M]`(또는 `ㅡ`) 키를 누르면 `documentPictureInPicture.requestWindow({ width: 350, height: 260 })`를 통해 OS 최상단 플로팅 미니맵을 열고 닫는다.
- 스테이지별로 개척된 방, 플레이어(`🟢`), 탈출문/열쇠/황금방(Stage 1), 영토 소유 색상(Stage 2), 레이저 궤적 및 성검 제단(Stage 3), 닫힌 철창 및 비행 성검(Stage 4), 탄막 결계 및 마왕 위치(Stage 5)를 실시간 표시한다.

---

## 9. 구현 현황

| 항목                                                          | 상태   | 비고                                                       |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| 해상도 맞춤형 동적 그리드 타일링 (`computeDynamicRoomSize`)   | 완료   | `CHROME_OVERHEAD_Y` 실측 보정 포함                         |
| 통신 계층 + RTT/메시지 수 계측 (`channel.js`)                 | 완료   |                                                            |
| 5-스테이지 진행 시스템 & 도미노 창 닫힘(Cascade) 전환 연출    | 완료   | Stage 1 ~ Stage 5 연속 진행 및 생존 방 재사용              |
| 스테이지별 배경 테마 베이킹 & 다이나믹 라이팅 (`render.js`)   | 완료   | Stage 3 칠흑+레이저 조명, Stage 4 성소+성검 빛 흡수 포함   |
| Stage 1 황금방 유물 시스템 (`🗺️ 고대 지도`, `👢 바람의 신발`)| 완료   | 전 스테이지 영구 패시브 유지                               |
| Stage 2 영역 점령전 & BFS 영토 확장 몬스터 AI                 | 완료   | 서든데스 `OVERTIME` 포함                                   |
| Stage 3 크로스 윈도우 레이저 & 빛을 잃은 성검 부활 퍼즐       | 완료   | 열린 창 관통 판정 및 석화 성검 각성 연출                   |
| Stage 4 도망치는 자아 성검 AI & 기계식 철창 레버/그로기 포획  | 완료   | 그로기 타이머 자동 해제 및 전방향 철창 봉쇄 시 돌파 포함   |
| Stage 5 심연의 마왕 탄막 결계 & 방 수색 성검 참격 보스전      | 완료   | 5초 탄막 회피 ➔ 11초 방 수색 & 참격 ➔ 순간이동 루프        |
| Document PiP 전술 미니맵 (`[M]` 토글) + 패킷 인스펙터         | 완료   |                                                            |
| Web Audio API 효과음 + 다크 앰비언트 BGM + 심장박동 텐션음    | 완료   | `[U]` 키 및 런처 버튼 전역 음소거 동기화                   |
| 멀티스크린 연속 승리 꽃가루 (`confetti.js`)                   | 완료   |                                                            |
| 런처 인접 방 팬텀 카드 애니메이션 & 모바일/브라우저 가드      | 완료   |                                                            |

---

## 10. 알려진 제약 및 대응

| 제약                                                                                    | 대응 / 현황                                                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 팝업은 유저 활성화(User Activation)가 살아있을 때만 열림                                | 방향키/WASD 이동 입력이 부여하는 5초간의 Transient User Activation을 활용해 문 도달 즉시 자동 오픈              |
| 스테이지 전환 시 새 창을 열면 팝업 차단에 걸릴 위험                                     | 클리어 순간 플레이어가 서 있는 방 창은 닫지 않고 남겨두어 다음 스테이지의 시작 방으로 재사용                    |
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
| 단순 깃발(🚩) 찾기 단일 스테이지                              | **5-스테이지 서사형 진행** (미궁 탈출 ➔ 영역 점령전 ➔ 레이저 성검 부활 ➔ 도망치는 성검 포획 ➔ 마왕 결전)|
| 스테이지/세션 전환 시 전체 리셋                               | 현재 방만 남기고 이전 방들이 개척 순서대로 도미노처럼 닫히는 **Sequential Window Cascade** 연출        |
| 단일 바닥/조명 스타일                                         | 스테이지별 고유 바닥 타일과 조명 연출 (Stage 3 칠흑+레이저, Stage 4 밝은 성소+성검 빛 흡수 등)         |
| 메인 런처에만 존재하는 미니맵 (팝업에 가려짐)                 | Document Picture-in-Picture API 기반 Always-on-Top 플로팅 전술 레이더 (`[M]` 토글)                     |
| 무음(사운드 없음)                                             | Web Audio API 오실레이터 기반 전 스테이지 효과음 + 다크 앰비언트 드론 BGM + 심장박동 텐션 사운드       |
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
