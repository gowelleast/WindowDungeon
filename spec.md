# 브라우저 창 던전 크롤러 — 기술 스펙

> 이 문서는 **현재 구현된 코드 기준**의 스펙이다. 초기 기획서(단계별 구현 요청용)에서 실제 개발 과정을 거치며 바뀐 부분을 반영했다.
> 초기 기획과 달라진 주요 지점은 [11. 초기 기획 대비 변경점](#11-초기-기획-대비-변경점)에 정리한다.

## 0. 프로젝트 개요

작은 브라우저 창 하나가 게임의 방(room) 하나가 된다. 방의 벽에 문이 있고, 문 앞에서 Space를 누르면 그 방향에 실제 새 브라우저 창이 뜨면서 다음 방으로 이동한다. 여러 방에 흩어진 던전에서 깃발을 찾으면 클리어.

- **목표 기술**: Window Management API (다중 모니터 좌표 획득 및 창 배치), BroadcastChannel API (창 간 상태 동기화)
- **비목표**: 배포용 게임 완성도, 크로스 브라우저 지원, 모바일 대응
- **대상 브라우저**: Chromium 계열 (Chrome/Edge) 최신 버전
- **빌드 도구**: 없음. 정적 파일 + ES 모듈만 사용
- **서버**: `npm start` (= `npx serve .`) 로 로컬 실행 (secure context 확보 목적)

---

## 1. 기술 스택

| 영역          | 선택                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| 언어          | Vanilla JavaScript (ES2022), 타입 주석 없음                                                |
| 모듈 시스템   | 네이티브 ES Modules (`<script type="module">`, `new Worker(..., { type: 'module' })`)       |
| 렌더링        | `<canvas>` 2D context                                                                      |
| 창 간 통신    | `BroadcastChannel` (채널명 `dungeon-v1`)                                                   |
| 화면 정보     | `window.getScreenDetails()`, `screenschange` / `currentscreenchange` 이벤트                 |
| 게임 루프     | Dedicated Web Worker (`master-worker.js`) 내부 `setInterval`                                |
| 상태 관리     | 별도 라이브러리 없음. Master(Worker)가 단일 진실 소스(SSOT)                                |
| 패키지 매니저 | 게임 자체는 의존성 없음. 로컬 서빙만 `npx serve` 사용 (CI 봇은 `.github/scripts`에 별도)   |

---

## 2. 프로젝트 구조 및 실행 주체

```
window-dungeon/
├── package.json              # "scripts": { "start": "npx serve ." }
├── index.html                # Launcher (대시보드) 진입점 — 게임 시작/리셋, 미니맵, 인스펙터
├── room.html                 # 방(Replica) 진입점. 로비 방도 이 페이지를 winId=lobby로 연다
├── style.css                 # 공용 최소 스타일 (승리 플래시 등)
├── src/
│   ├── config.js             # 창 크기, tick 주기, 이동/반동 파라미터
│   ├── protocol.js           # 메시지 타입 상수
│   ├── grid.js               # 좌표계 계산 (screen ↔ grid ↔ cellId)
│   ├── channel.js            # BroadcastChannel 래퍼 (다중 핸들러, 로컬 emit, RTT 계측)
│   ├── master-worker.js      # 게임 루프 전담 Web Worker (물리/문/깃발 판정, tick 브로드캐스트)
│   ├── launcher.js           # Launcher 메인 스레드 — 화면 감지, 로비 팝업 열기, Worker 생성, 세션 정리
│   ├── replica.js            # 방 전용 로직 (렌더링, 입력 중계, window.open/focus)
│   ├── render.js             # 캔버스 드로잉 함수 모음 (방/플레이어/문 프롬프트)
│   ├── inspector.js          # 수신 패킷 로그 인스펙터 (Launcher)
│   └── minimap.js            # 모니터/그리드 미니맵 + 동기화 지표 (Launcher)
└── .github/                  # PR 역검증 CI 봇 (게임과 무관, 12장 참고)
```

실행 주체는 세 종류다.

```
index.html (Launcher, 메인 스레드)
 ├─ Web Worker = Master ── 게임 상태, 물리, 문/깃발 판정, 30Hz tick
 ├─ 미니맵 + 동기화 지표 (ping 발신 / RTT 계측)
 └─ 인스펙터 (수신 패킷 로그)
        │ BroadcastChannel "dungeon-v1"
   ┌────┴─────────┬──────────────┬─────────────┐
 room.html      room.html      room.html     ...   ← Replica: 렌더링 + 입력 중계 + window.open
 (winId=lobby)  (room-xxxxxxxx)
```

> **Launcher ≠ 로비 방**: `index.html`은 게임 화면이 아니라 대시보드다. "게임 시작"을 누르면 `room.html#winId=lobby` 팝업이 첫 번째 방(로비 셀)으로 열린다. 이후 모든 방은 같은 `room.html`을 쓴다.

> **왜 Master를 Worker로 분리하는가**: 캐릭터가 다른 방으로 이동하면 Launcher 창은 배경이 된다. 메인 스레드의 `requestAnimationFrame`/`setInterval`은 배경 탭에서 강하게 스로틀링되지만(초당 1회 수준까지 저하), Web Worker 내부의 타이머는 탭 가시성과 무관하게 정상 주기로 동작한다. `BroadcastChannel`은 Worker 안에서도 그대로 쓸 수 있으므로 통신 프로토콜은 바뀌지 않는다. (무음 오디오로 스로틀링을 회피하는 방법도 있으나 비공식 편법이라 채택하지 않았다.)

---

## 3. 좌표계 및 상수

세 단계 좌표 공간을 구분한다.

1. **Screen Space**: `getScreenDetails().screens[]`가 주는 물리 화면 좌표 (`availLeft/availTop/availWidth/availHeight`)
2. **Grid Space**: 각 화면을 `ROOM_OUTER_W × ROOM_OUTER_H` 셀로 좌상단부터 타일링. 셀 ID = `` `${screenLabel}:${gx},${gy}` ``
3. **Local Space**: 방 캔버스 내부 좌표 (`0 ~ ROOM_OUTER_W`, `0 ~ ROOM_OUTER_H`)

### 3.1 설정값 (`config.js`)

```js
export const CONFIG = {
  ROOM_OUTER_W: 480, // 맥북 1440px 가로에 3개 균등 분할 (1440 / 480 = 3)
  ROOM_OUTER_H: 400,
  CHROME_OVERHEAD_X: 0,  // 실측값 (현재 코드에서 미사용, 10장 참고)
  CHROME_OVERHEAD_Y: 63, // 실측값 (현재 코드에서 미사용, 10장 참고)
  TICK_HZ: 30, // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,  // 문서용. 실제 ping은 minimap.js의 1초 interval에서 발송
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8, // 미구현 (예약 값)
  SINGLE_SCREEN_ONLY: true, // Launcher가 위치한 단일 모니터만 맵으로 사용
  PLAYER_SPEED: 6, // 플레이어 기본 이동 속도 (px/tick)
  ENABLE_WALL_BOUNCE: true, // 벽 충돌 시 넉백 반동 적용 여부
  WALL_BOUNCE_STRENGTH: 2, // 충돌 순간 넉백 세기 (충돌 속도 대비 배수)
  WALL_BOUNCE_DECAY: 0.6, // 넉백 속도의 tick당 감쇠율
};
```

> **480px의 이유**: 초기엔 400×400이었으나, 1440px 폭 화면에서 3개(1200px) 뒤 240px 여백이 남아 창이 화면 끝에 붙지 않았다. 가로만 480px로 바꿔 3개가 화면 폭을 정확히 채우게 했다.

### 3.2 좌표 변환 함수 (`grid.js`)

```js
export function cellToScreenRect(screen, gx, gy, cfg) {
  return {
    left: screen.availLeft + gx * cfg.ROOM_OUTER_W,
    top: screen.availTop + gy * cfg.ROOM_OUTER_H,
    width: cfg.ROOM_OUTER_W,
    height: cfg.ROOM_OUTER_H,
  };
}

export function isCellValid(screen, gx, gy, cfg) { /* 셀 사각형이 화면 avail 영역 안에 완전히 들어가는지 */ }
export function cellId(screenLabel, gx, gy) { return `${screenLabel}:${gx},${gy}`; }
export function neighbors(screenLabel, gx, gy) { /* 상하좌우 그리드 좌표 (현재 미사용) */ }
```

### 3.3 인접 셀 계산 — 모니터 경계 넘기 (`master-worker.js` `getAdjacentCell`)

1. 같은 화면 안에서 `(gx±1, gy±1)`이 `isCellValid`를 통과하면 그 셀.
2. 화면을 벗어나면 **주된 방향(Dominant Axis)** 으로 인접 모니터를 찾는다: 각 모니터 중심 간 `dx`, `dy`를 비교해 `|dx| > |dy|`이면 좌/우, 아니면 상/하 관계로 판정하고, 이동 방향과 일치하는 모니터 중 중심 거리가 가장 가까운 것을 고른다.
3. 대상 모니터의 **반대편 가장자리 셀**로 매핑한다 (오른쪽 이동 → `gx = 0`, 왼쪽 → `gx = maxGx`, 아래 → `gy = 0`, 위 → `gy = maxGy`). 나머지 축은 절대 좌표를 대상 모니터 그리드로 환산 후 `[0, max]`로 클램프한다.
4. 매핑 결과가 유효하지 않으면 `null` (벽).

> 처음에는 "가상의 방 좌표가 다른 모니터 물리 영역에 겹치는지"로 판정했으나, macOS 메뉴바 오프셋이나 모니터 간 틈새 때문에 좌표가 허공에 빠지는 문제가 있어 위 방식으로 바꿨다.
> 기본값 `SINGLE_SCREEN_ONLY: true`에서는 `screens`에 현재 모니터 하나만 들어가므로 2·3단계는 동작하지 않는다.

---

## 4. 데이터 모델

```ts
// 타입 주석은 문서화 목적. 실제 코드는 순수 JS 객체.

interface ScreenRegion {
  label: string;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary: boolean;
}

// Master(Worker)의 cellMap: Map<cellId, Cell>. 창이 한 번이라도 열린(개척된) 셀만 들어간다.
interface Cell {
  id: string; // "screenLabel:gx,gy"
  screenLabel: string;
  gx: number;
  gy: number;
  doors: ("up" | "down" | "left" | "right")[]; // 생성 시 getAdjacentCell 기준으로 계산
  winId: string; // 이 셀을 표시하는 창 이름 ('lobby' 또는 'room-xxxxxxxx')
  rect: { left: number; top: number; width: number; height: number }; // 화면상 창 위치
}

interface PlayerState {
  cellId: string; // 캐릭터가 현재 있는 방
  lx: number; // 방 내부 로컬 x
  ly: number;
  vx: number; // 이번 tick 실제 이동 속도 (= 입력 속도 + 넉백)
  vy: number;
  kx: number; // 벽 반동 넉백 속도 (매 tick WALL_BOUNCE_DECAY로 감쇠)
  ky: number;
  speed: number; // CONFIG.PLAYER_SPEED
  radius: number; // 15
  facing: "up" | "down" | "left" | "right";
}
```

Master는 `screens`, `cellMap`, `player`, `flagCellId`, 현재 키 상태(`keys`)를 메모리에 들고 있는 단일 진실 소스다. 깃발 여부(`hasFlag`)는 셀에 저장하지 않고 `assign` 전송 시점에 `cell.id === flagCellId`로 계산한다. Replica는 자기 `assign` 정보, 최신 `tick`, 현재 문 프롬프트만 들고 렌더링한다.

---

## 5. 통신 프로토콜 (`protocol.js`)

채널명: `CONFIG.CHANNEL_NAME`. 모든 메시지 공통 형태: `{ type, from, t, ...payload }` (`from` = 발신 winId, `t` = `performance.now()`)

### 5.1 Replica → Master

| type          | payload                         | 설명                                                                   |
| ------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `hello`       | `{ winId }`                     | 로드 직후부터 `assign`을 받을 때까지 **100ms마다 반복** (Worker 기동 지연 대비) |
| `input`       | `{ keys: string[] }`            | keydown/keyup으로 키 상태가 바뀔 때마다, `blur` 시 빈 배열              |
| `doorConfirm` | `{ winId, dir, targetWinId }`   | 문 프롬프트 상태에서 Space 입력 시 (`window.open` 호출 직후)            |
| `pong`        | `{ pingId }`                    | `ping` 수신 시 `DungeonChannel`이 자동 응답                             |
| `bye`         | `{ winId }`                     | `beforeunload` 시                                                       |

### 5.2 Launcher → 전체

| type            | payload                           | 빈도                                                       |
| --------------- | --------------------------------- | ---------------------------------------------------------- |
| `screensUpdate` | `{ screens, currentScreenLabel }` | 게임 시작 시, `hello` 수신 시마다, `screenschange`/`currentscreenchange` 시 |
| `ping`          | `{ pingId }`                      | 1초마다 (`minimap.js`). RTT는 Launcher에서 계측             |

### 5.3 Master → 전체 (브로드캐스트, 각자 관련된 것만 필터링)

| type         | payload                                                        | 빈도 / 설명                                                                                 |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `assign`     | `{ ...Cell, hasFlag }`                                         | `hello` 수신 시. Replica는 `winId`가 자기 것일 때만 수락                                     |
| `tick`       | `{ activeCellId, lx, ly, facing, tickCount, debugTime }`       | `CONFIG.TICK_HZ` (승리 후 중단)                                                             |
| `doorPrompt` | `{ activeCellId, dir, willOpenNew, targetWinId, rect }`        | 문 접촉 상태가 바뀔 때 1회. 새 방이면 Master가 `targetWinId = 'room-' + uuid 8자리`를 생성  |
| `doorPrompt` | `{ activeCellId, clear: true }`                                | 문에서 벗어났을 때                                                                          |
| `victory`    | `{ winnerWinId }`                                              | 깃발 도달 시 1회                                                                            |
| `closeAll`   | `{}`                                                           | 승리 후 Space 입력, 또는 아무 창의 `bye` 수신 시                                             |

```js
// protocol.js
export const MSG = {
  HELLO: "hello",
  INPUT: "input",
  DOOR_CONFIRM: "doorConfirm",
  PONG: "pong",
  BYE: "bye",
  ASSIGN: "assign",
  TICK: "tick",
  DOOR_PROMPT: "doorPrompt",
  PING: "ping",
  SCREENS_UPDATE: "screensUpdate",
  VICTORY: "victory",
  CLOSE_ALL: "closeAll",
};
```

### 5.4 채널 래퍼 (`channel.js` `DungeonChannel`)

| 메서드                    | 설명                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `send(type, payload)`     | 공통 필드를 붙여 `postMessage`                                                                         |
| `on(type, handler)`       | 타입별 핸들러 등록 (**여러 개 허용**). 해제 함수를 반환                                                 |
| `onAny(handler)`          | 모든 수신 메시지 구독 (인스펙터용). 해제 함수를 반환                                                    |
| `emitLocal(type, payload)` | 같은 컨텍스트의 `on` 핸들러에만 전달. BroadcastChannel은 발신자 자신에게 메시지를 돌려주지 않기 때문 |
| `ping()`                  | `pingId`를 기록하고 `ping` 발송. `pong` 수신 시 `lastRtt`/`maxRtt` 갱신                                 |
| `msgPerSec`               | 1초 단위 수신 메시지 수                                                                                 |

---

## 6. 핵심 구현 제약 (반드시 지킬 것)

**① `window.open()`은 Master가 아니라, Space를 입력받은 Replica 자신이 호출한다.**
팝업은 동기적인 유저 제스처(keydown) 핸들러 안에서 열어야 차단되지 않는다. Master는 판단(새 방인지 기존 방인지, 열 위치 `rect`, 창 이름 `targetWinId`)만 `doorPrompt`로 내려주고, 실제 `window.open` 실행은 Replica가 한다.

**② `Window` 객체는 `BroadcastChannel`로 전달할 수 없다 (structured clone 불가).**
대신 창 이름을 주소로 쓴다. 새 창은 `window.open(url, targetWinId, features)`로 열어 두 번째 인자로 `window.name`이 정해지고, 각 방은 로드 시 `window.name = winId`를 다시 확정한다. 기존 방으로 돌아갈 때는 `window.open('', targetWinId)`가 같은 이름의 창 참조를 돌려주므로 `.focus()`로 앞으로 가져온다. 이 호출도 keydown 핸들러 안에서 동기 실행해 포커스 차단을 피한다.

이 두 제약을 합치면 **"새 방 열기"와 "기존 방으로 돌아가기"가 하나의 코드 경로**가 된다:

```
1. Master가 캐릭터-문 접촉 감지 → doorPrompt 브로드캐스트 (willOpenNew, targetWinId, rect)
2. 현재 방(Replica)이 "[Space] 키를 눌러 문 열기" 프롬프트 표시
3. 유저가 Space 입력 (이 핸들러 안에서 전부 동기 실행)
   → willOpenNew === true : window.open(`./room.html#winId=${targetWinId}`, targetWinId,
                                         `popup=yes,resizable=no,width=..,height=..,left=${rect.left},top=${rect.top}`)
   → willOpenNew === false: window.open('', targetWinId)?.focus()
   → doorConfirm { winId, dir, targetWinId } 전송
4. Master: 셀이 없으면 cellMap에 생성(winId = targetWinId), player.cellId 갱신,
           캐릭터를 반대편 문 앞(벽에서 radius + 35px)으로 배치, 넉백 초기화
5. 새 창이면: 로드 → hello 반복 → Master가 assign 응답 → 렌더링 시작
```

> winId는 `window.name` → URL 해시 `#winId=` → 랜덤 순으로 결정한다. 쿼리스트링(`?`) 대신 해시를 쓰는 이유는 `serve`의 리다이렉트 과정에서 쿼리가 유실되는 경우가 있었기 때문이다.

**③ 모든 창이 자기 keydown/keyup을 무조건 Master로 중계한다.**
Master는 발신 창을 구분하지 않고 최신 키 상태를 그대로 적용한다 (캐릭터는 하나뿐). 유저가 어느 창을 클릭해 포커스가 옮겨가도 조작이 끊기지 않는다. 창이 `blur`되면 키 상태를 비워 키가 눌린 채로 남는 것을 막는다.

**④ Master 게임 루프는 Web Worker(`master-worker.js`)에서 돈다.**
물리 연산과 `tick` 브로드캐스트는 Worker가 전담하고, Launcher 메인 스레드(`launcher.js`)는 Worker 생성·화면 정보 공급·대시보드만 담당한다.

**⑤ Master(Worker)는 Launcher 창이 열려 있는 동안만 존재한다.**
Launcher를 닫으면 Worker도 종료되어 게임이 끝난다 (의도된 동작). 게임 중에는 `beforeunload`로 실수 방지 경고를 건다.

**⑥ Launcher는 세션 단위로 구독을 정리한다.**
"게임 시작"을 누를 때마다 이전 세션의 채널 핸들러, 인스펙터 구독, 미니맵 interval, `screenschange` 리스너, Worker를 모두 해제한 뒤 새로 등록한다. (`launcher.js`의 `sessionDisposers`)

---

## 7. 게임 로직

### 7.1 초기화

- "게임 시작" 클릭 시 `getScreenDetails()` 권한 요청
  - API가 없거나 **권한 거부로 실패하면** `window.screen.availWidth/Height` 기반 단일 화면 폴백 (`label: 'Fallback Screen'`)
  - `SINGLE_SCREEN_ONLY`면 `details.currentScreen` 하나만 사용
- 같은 클릭 핸들러 안에서 로비 팝업(`room.html#winId=lobby`)을 현재 화면 좌상단에 연다
- Worker 생성 후 `screensUpdate` 전송. 로비 방의 `hello`를 받으면 Master가 현재 화면의 `(0, 0)` 셀을 로비 셀로 생성

### 7.2 이동 및 벽 충돌

- 입력: 방향키 또는 WASD. 대각선은 정규화. 이동 속도 `PLAYER_SPEED` px/tick
- 벽 두께 20px. 이동 범위는 각 축 `[20 + radius, ROOM_OUTER - 20 - radius]`로 클램프
- **넉백 반동** (`ENABLE_WALL_BOUNCE`)
  - 실제 이동 속도 = 입력 속도 + 넉백 속도(`kx`, `ky`)
  - 직전 tick에 벽에 닿아 있지 않다가 **이번 tick에 새로 부딪힌 경우에만**, 벽 반대 방향으로 `|충돌 속도| × WALL_BOUNCE_STRENGTH`의 넉백을 준다
  - 넉백은 매 tick `WALL_BOUNCE_DECAY` 배로 감쇠하고, 0.1 미만이면 0으로 처리
  - **문 구멍 앞에서는 반동하지 않는다** (문은 벽이 아니며, 반동하면 문 프롬프트 범위를 벗어나기 때문)
  - 문을 통과하면 넉백을 초기화

### 7.3 문 계산 및 접촉 판정

- 셀 생성 시 4방향 각각 `getAdjacentCell()`(3.3)이 `null`이 아니면 그 방향에 문을 만든다
- 문 폭 80px, 각 벽의 중앙에 위치
- 캐릭터가 벽에서 10px(`triggerMargin`) 이내이고 문 폭 안에 있으면 접촉으로 보고, 접촉 방향이 바뀔 때만 `doorPrompt`를 보낸다
- 목적지 셀이 `cellMap`에 이미 있으면 `willOpenNew: false` + 기존 `winId`, 없으면 `willOpenNew: true` + 새 `winId`

### 7.4 깃발 배치

로비 셀 생성 시 로비에서 `getAdjacentCell`로 BFS를 돌려 도달 가능한 셀 집합(로비 제외)을 구하고, 그중 하나를 `Math.random()`으로 고른다. 깃발은 방 중앙에 그린다.

### 7.5 승리 판정

캐릭터가 깃발 셀에 있고 방 중앙과의 거리가 `radius + 20` 미만이면 `victory`를 브로드캐스트하고 tick을 멈춘다. 모든 열린 방에 승리 오버레이가 동시에 뜬다. 이후 Space 입력 시 Master가 `closeAll`을 보내 모든 방이 `window.close()`하고, Launcher는 Worker를 종료하고 "메인으로 돌아가기" 버튼을 표시한다.

### 7.6 창 종료 처리

어느 방 창이든 닫히면(`bye`) **게임 세션 전체를 종료**한다: Master가 `closeAll`을 브로드캐스트해 남은 방을 모두 닫고, Launcher는 리셋 버튼을 띄운다. (개별 방만 되돌리는 복구 로직은 없다.)

### 7.7 화면 배치 변경

`screenschange`/`currentscreenchange` 시 Launcher가 최신 `screens`로 `screensUpdate`를 다시 보내고, Master는 이후 계산되는 인접 셀/문에 새 배치를 쓴다. **이미 생성된 셀의 `doors`/`rect`는 다시 계산하지 않는다.**

---

## 8. UI

### 8.1 Launcher (`index.html`)

- 시작 화면: 권한 안내 + "게임 시작" 버튼
- 게임 중: "게임 서버 실행 중" 상태 표시, 창을 닫으면 게임이 끝난다는 경고
- **미니맵** (`minimap.js`) — `screens[]`를 축소 렌더링 (label, Primary 여부, 해상도), 개척된 셀, 캐릭터 위치
- **동기화 지표** — 개척된 방 수, ping RTT(ms), 초당 수신 메시지 수
- **시스템 인스펙터** (`inspector.js`) — Launcher가 수신한 채널 패킷 로그 (`tick`/`ping`/`pong` 제외, 타입별 색상)
- 세션 종료 시 "메인으로 돌아가기" 버튼

### 8.2 방 (`room.html`)

- 캔버스만 표시: 벽, 문 구멍, 깃발(🚩), 캐릭터(원 + 바라보는 방향 선)
- 문 접촉 시 프롬프트: "[Space] 키를 눌러 문 열기" + "(새로운 방을 발견합니다)" 또는 "(이미 열려있는 방으로 포커스 이동)"
- 승리 시 플래시 효과 + "VICTORY" 오버레이

---

## 9. 구현 현황

| 항목                                         | 상태      | 비고                                                           |
| -------------------------------------------- | --------- | -------------------------------------------------------------- |
| 좌표계 모듈 (`grid.js`)                      | 완료      |                                                                |
| 통신 계층 + RTT/메시지 수 계측               | 완료      | ping은 Launcher(미니맵)가 발신                                 |
| Master 코어 (Worker 루프, 벽/문/깃발 판정)   | 완료      |                                                                |
| Replica 렌더러 / 입력 중계                   | 완료      |                                                                |
| 문 통과 시퀀스 (새 방 / 기존 방 포커스)      | 완료      |                                                                |
| 미니맵 · 지표 · 인스펙터                     | 완료      | 인스펙터는 API 호출이 아니라 수신 패킷을 로그로 보여준다       |
| 넉백 벽 반동                                 | 완료      |                                                                |
| 권한 거부 / 미지원 시 단일 화면 폴백          | 완료      |                                                                |
| 다중 모니터 인접 셀 매핑                     | 완료      | 기본값 `SINGLE_SCREEN_ONLY: true`라 기본 설정에선 비활성       |
| 화면 배치 변경 시 기존 셀 재계산              | 미구현    | 7.7                                                            |
| 개별 방 종료 시 부분 복구                    | 미구현    | 현재는 세션 전체 종료 (7.6)                                    |
| `MAX_OPEN_ROOMS` 초과 시 오래된 방 정리       | 미구현    | 설정값만 존재                                                  |
| `CHROME_OVERHEAD_X/Y` 반영한 창 배치          | 미구현    | 10장 참고                                                      |

---

## 10. 알려진 제약 및 대응

| 제약                                                                                    | 대응 / 현황                                                                                                                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 팝업은 동기 유저 제스처 안에서만 열림                                                   | 6장 ① — 자동으로 열지 않고 Space 키 핸들러 안에서 `window.open`                                                             |
| `window.focus()`가 유저 제스처 밖에서 막힘 + Window 참조는 BroadcastChannel로 전달 불가 | 6장 ② — `window.name`을 주소로 써서 `window.open('', targetWinId)`로 참조 획득                                               |
| 백그라운드 탭 스로틀링 (Launcher가 배경으로 갈 때)                                      | 6장 ④ — Master 루프를 Web Worker로 분리                                                                                     |
| Worker/창 기동 순서가 보장되지 않음                                                     | Replica는 `assign`을 받을 때까지 `hello`를 100ms마다 재전송, Launcher는 `hello`마다 `screensUpdate`를 다시 보냄              |
| 첫 로비 팝업은 `await getScreenDetails()` 뒤에 열림                                     | Chrome의 일시적 유저 활성화(약 5초) 안에 열리면 문제 없지만, 권한 프롬프트에서 오래 머물면 팝업이 차단될 수 있음             |
| `window.open`의 `width/height`는 콘텐츠 영역 크기                                       | 실제 창 높이는 타이틀바만큼(`CHROME_OVERHEAD_Y` ≈ 63px) 커서 세로로 붙은 방끼리 일부 겹칠 수 있음. 현재 미보정              |
| 창 생성 지연 200~300ms                                                                  | 별도 연출 없음                                                                                                              |
| 팝업 차단 설정                                                                          | 실행 전 localhost 팝업 허용 필요 (Launcher 화면에 안내 문구)                                                                |
| `file://` 실행 시 BroadcastChannel 불안정                                               | 반드시 `npx serve`로 localhost 서빙                                                                                         |
| 팝업이 탭으로 강제 열림                                                                 | `popup=yes`를 명시. 특정 확장/기업 정책이 있을 때만 발생하는 낮은 확률의 제약으로 인지                                       |

---

## 11. 초기 기획 대비 변경점

| 초기 기획                                                     | 실제 구현                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html` = 로비(Master 진입점), 로비 자체가 게임 방       | `index.html` = Launcher 대시보드. 로비는 `room.html#winId=lobby` 팝업                        |
| 로비 메인 스레드 파일명 `master-ui.js`                        | `launcher.js`                                                                               |
| `room.html?winId=...` (쿼리스트링)                            | `room.html#winId=...` (해시) + `window.open` 두 번째 인자로 `window.name` 지정               |
| Replica가 새 winId 생성                                       | Master가 `doorPrompt`에서 `targetWinId`와 열 위치 `rect`까지 결정해 내려줌                   |
| `hello`는 로드 시 1회                                         | `assign` 수신 전까지 100ms마다 재전송                                                        |
| ping은 Master가 발신                                          | Launcher(미니맵)가 1초마다 발신, RTT도 Launcher에서 계측                                     |
| `flagFound` 메시지                                            | `victory` 메시지로 일원화 (`flagFound` 제거)                                                 |
| `bye` 시 해당 셀만 `discovered: false`로 되돌리고 로비로 이동 | 세션 전체 종료 (`closeAll`)                                                                 |
| `Cell.discovered`, `Cell.hasFlag`, `WindowRecord`             | `cellMap`에 개척된 셀만 저장, `winId`/`rect` 보유. `hasFlag`는 `assign` 시 계산               |
| 화면 경계 넘기: 좌표 겹침 판정                                | Dominant Axis 기반 인접 모니터 탐색 + 반대편 가장자리 매핑 (3.3)                              |
| 방 크기 400×400                                               | 480×400                                                                                     |
| 인스펙터: 주요 API 호출을 가로채 코드 형태로 로그             | 수신 채널 패킷 로그                                                                          |
| 승리 후 처리 미정                                             | Space → `closeAll` → 모든 방 닫기, Launcher에 리셋 버튼                                      |

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
