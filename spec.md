# 브라우저 창 던전 크롤러 — 개발 기획서

> 이 문서를 그대로 코드 어시스턴트에게 전달해 단계별로 구현을 요청한다.
> 각 단계는 이전 단계의 산출물을 전제로 하므로 순서를 지킬 것.

## 0. 프로젝트 개요

작은 브라우저 창 하나가 게임의 방(room) 하나가 된다. 방의 벽 중 한쪽에 문이 있고, 문을 통과하면 그 방향에 실제 새 브라우저 창이 뜨면서 다음 방으로 이동한다. 여러 방에 흩어진 던전에서 깃발을 찾으면 클리어.

- **목표 기술**: Window Management API (다중 모니터 좌표 획득 및 창 배치), BroadcastChannel API (창 간 상태 동기화)
- **비목표**: 배포용 게임 완성도, 크로스 브라우저 지원, 모바일 대응
- **대상 브라우저**: Chromium 계열 (Chrome/Edge) 최신 버전
- **빌드 도구**: 없음. 정적 파일 + ES 모듈만 사용
- **서버**: `npx serve .` 로 로컬 실행 (secure context 확보 목적)

---

## 1. 기술 스택

| 영역          | 선택                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| 언어          | Vanilla JavaScript (ES2022), 타입 주석 없음                              |
| 모듈 시스템   | 네이티브 ES Modules (`<script type="module">`)                           |
| 렌더링        | `<canvas>` 2D context                                                    |
| 창 간 통신    | `BroadcastChannel`                                                       |
| 화면 정보     | `window.getScreenDetails()`, `screen.isExtended`, `screenschange` 이벤트 |
| 상태 관리     | 별도 라이브러리 없음. Master가 단일 진실 소스(SSOT)                      |
| 패키지 매니저 | 불필요 (의존성 없음). 로컬 서빙만 `npx serve` 사용                       |

---

## 2. 프로젝트 구조

```
window-dungeon/
├── package.json              # "scripts": { "start": "npx serve ." } 정도만
├── index.html                # 로비 (= Master) 진입점
├── room.html                 # 방 (= Replica) 진입점, 쿼리스트링으로 초기화
├── src/
│   ├── config.js             # 실측 후 채울 상수 (ROOM_W, ROOM_H 등)
│   ├── protocol.js           # 메시지 타입 상수 + 스키마 주석
│   ├── grid.js                # 좌표계 계산 (screen ↔ grid ↔ cellId)
│   ├── channel.js             # BroadcastChannel 래퍼 + RTT 계측
│   ├── master-worker.js        # 게임 루프 전담 Web Worker (물리/판정/tick 브로드캐스트)
│   ├── launcher.js             # 로비 메인 스레드 — worker와 통신, 화면 감지, 오버레이 초기화
│   ├── replica.js              # 방 전용 로직 (렌더링, 입력 중계, door open/focus)
│   ├── render.js                # 캔버스 드로잉 함수 모음 (공용)
│   ├── inspector.js             # 라이브 코드 인스펙터 오버레이
│   └── minimap.js                # 모니터/그리드 미니맵 오버레이
└── style.css                      # 공용 최소 스타일
```

> **왜 Master를 Worker로 분리하는가**: 캐릭터가 다른 방으로 이동하면 로비 창은 배경 탭이 된다. 메인 스레드의 `requestAnimationFrame`/`setInterval`은 배경 탭에서 강하게 스로틀링되지만(초당 1회 수준까지 저하), Web Worker 내부의 타이머는 탭 가시성과 무관하게 정상 주기로 동작한다. `BroadcastChannel`은 Worker 안에서도 그대로 사용 가능하므로 통신 프로토콜은 바뀌지 않고, 게임 루프의 실행 위치만 메인 스레드에서 Worker로 옮긴다. (무음 오디오로 스로틀링을 회피하는 방법도 있으나, Chrome 정책상 완전 무음은 예외 대상이 아니고 향후 버전에서 막힐 수 있는 비공식 편법이라 채택하지 않는다.)

---

## 3. 좌표계 및 상수

세 단계 좌표 공간을 명확히 구분한다.

1. **Screen Space**: `getScreenDetails().screens[]`가 주는 물리 화면 좌표 (`availLeft/availTop/availWidth/availHeight`)
2. **Grid Space**: 각 화면을 `ROOM_W × ROOM_H` 셀로 타일링. 셀 ID = `` `${screenLabel}:${gx},${gy}` ``
3. **Local Space**: 방 캔버스 내부 좌표 (`0 ~ canvas.width`, `0 ~ canvas.height`)

### 3.1 사전 실측 (구현 전 필수, 단계 1에서 수행)

`config.js`의 아래 상수는 실측 전까지 placeholder로 두고, 단계 1 실행 결과로 채운다.

```js
// src/config.js
export const CONFIG = {
  ROOM_OUTER_W: 480, // 맥북 1440px 가로에 3개 균등 분할
  ROOM_OUTER_H: 400,
  CHROME_OVERHEAD_X: 0,
  CHROME_OVERHEAD_Y: 63,
  TICK_HZ: 30, // Master → Replica 브로드캐스트 빈도
  PING_HZ: 1,
  CHANNEL_NAME: "dungeon-v1",
  MAX_OPEN_ROOMS: 8, // 동시 개방 방 최대치 (메모리 보호)
  SINGLE_SCREEN_ONLY: true, // 메인 창이 위치한 단일 모니터만 맵으로 사용할지 여부
};
```

### 3.2 좌표 변환 함수 (`grid.js`)

```js
// gx, gy는 정수 그리드 좌표. screen은 ScreenDetailed 객체.
export function cellToScreenRect(screen, gx, gy, cfg) {
  return {
    left: screen.availLeft + gx * cfg.ROOM_OUTER_W,
    top: screen.availTop + gy * cfg.ROOM_OUTER_H,
    width: cfg.ROOM_OUTER_W,
    height: cfg.ROOM_OUTER_H,
  };
}

export function isCellValid(screen, gx, gy, cfg) {
  const r = cellToScreenRect(screen, gx, gy, cfg);
  return (
    r.left >= screen.availLeft &&
    r.top >= screen.availTop &&
    r.left + r.width <= screen.availLeft + screen.availWidth &&
    r.top + r.height <= screen.availTop + screen.availHeight
  );
}

export function cellId(screenLabel, gx, gy) {
  return `${screenLabel}:${gx},${gy}`;
}

export function neighbors(screenLabel, gx, gy) {
  return {
    up: { gx, gy: gy - 1 },
    down: { gx, gy: gy + 1 },
    left: { gx: gx - 1, gy },
    right: { gx: gx + 1, gy },
  };
}
```

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

interface Cell {
  id: string; // "screenLabel:gx,gy"
  screenLabel: string;
  gx: number;
  gy: number;
  doors: ("up" | "down" | "left" | "right")[];
  hasFlag: boolean;
  discovered: boolean; // 창이 열린 적 있는지
}

interface WindowRecord {
  winId: string; // crypto.randomUUID()
  cellId: string;
  windowRef: Window | null; // Master가 연 경우만 보유, 아니면 null
}

interface PlayerState {
  cellId: string; // 캐릭터가 현재 있는 방
  lx: number; // 방 내부 로컬 x
  ly: number;
  vx: number;
  vy: number;
  facing: "up" | "down" | "left" | "right";
}
```

Master가 위 네 가지를 메모리에 들고 있는 단일 진실 소스다. Replica는 자기 `assign` 정보와 최신 `tick`만 들고 렌더링만 한다.

---

## 5. 통신 프로토콜 (`protocol.js`)

채널명: `CONFIG.CHANNEL_NAME`. 모든 메시지 공통 형태: `{ type, from, t, ...payload }`

### Replica → Master

| type          | payload              | 설명                                  |
| ------------- | -------------------- | ------------------------------------- |
| `hello`       | `{ winId, cellId }`  | 창 로드 완료 시 1회                   |
| `input`       | `{ keys: string[] }` | keydown/keyup으로 키 상태 바뀔 때마다 |
| `doorConfirm` | `{ winId, dir }`     | 문 열기 키 입력 시                    |
| `pong`        | `{ pingId }`         | ping 응답                             |
| `bye`         | `{ winId }`          | `pagehide` 이벤트 시                  |

### Master → Replica (전체 브로드캐스트, 각자 자기 관련 것만 필터링)

| type         | payload                                                  | 빈도                                                                                                  |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `assign`     | `{ winId, cellId, gx, gy, doors, hasFlag, screenLabel }` | 배정/변경 시                                                                                          |
| `tick`       | `{ activeCellId, lx, ly, facing }`                       | `CONFIG.TICK_HZ`                                                                                      |
| `doorPrompt` | `{ targetWinId, dir, willOpenNew }`                      | 문 접촉 시. `willOpenNew`가 false면 `targetWinId`가 `window.open('', targetWinId)`의 name 인자로 쓰임 |
| `flagFound`  | `{ cellId }`                                             | 승리 시                                                                                               |
| `ping`          | `{ pingId }`                                             | `CONFIG.PING_HZ`                                                                                      |
| `screensUpdate` | `{ screens, currentScreenLabel }`                        | 화면 배치 변경 및 초기 동기화 시                                                                      |
| `victory`       | `{ winnerWinId }`                                        | 깃발 도달 시                                                                                          |
| `closeAll`      | `{}`                                                     | 승리 후 리셋 또는 비정상 종료 시 모든 방 정리                                                        |

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
  FLAG_FOUND: "flagFound",
  PING: "ping",
  SCREENS_UPDATE: "screensUpdate",
  VICTORY: "victory",
  CLOSE_ALL: "closeAll",
};
```

---

## 6. 핵심 구현 제약 (반드시 지킬 것)

**① `window.open()`은 Master가 아니라, `doorConfirm`을 발생시킨 Replica 자신이 호출한다.**
유저 제스처(keydown)를 처리하는 이벤트 핸들러 안에서 동기적으로 호출해야 팝업 차단을 피한다. Master가 판단(새 방인지 기존 방인지)만 내려주고, 실제 `window.open` 실행은 Replica 쪽 코드가 담당하도록 설계한다.

**② `Window` 객체는 `BroadcastChannel`로 전달할 수 없다 (structured clone 불가).**
따라서 A방이 연 B방의 참조를 C방이 넘겨받아 포커스를 옮기는 건 애초에 불가능하다. 대신 각 방이 로드 시 `window.name = winId`로 자기 이름을 지정해두고, 포커스가 필요할 때 `window.open('', targetWinId)`를 호출한다 — 같은 이름의 창이 이미 열려 있으면 새로 만들지 않고 그 참조를 반환하므로, 이걸로 어떤 방에서든 어떤 방이든 이름으로 찾아 포커스를 옮길 수 있다. 이 호출도 `doorConfirm` 핸들러 안에서 동기적으로 실행하면 유저 제스처 컨텍스트를 유지하므로 `.focus()` 차단도 피한다.

이 두 제약을 합치면 **"새 방 열기"와 "기존 방으로 돌아가기"가 하나의 코드 경로**가 된다:

```
1. Master가 캐릭터-문 충돌 감지 → doorPrompt 브로드캐스트 (targetWinIdOrNull, willOpenNew 포함)
2. 현재 방(Replica)이 "[Space] 문 열기" UI 표시
3. 유저가 Space 입력 (이 이벤트가 유저 제스처, 아래는 전부 이 핸들러 안에서 동기 실행)
   → willOpenNew === true 이면: 새 winId 생성 → window.open(`room.html?winId=${newId}`, newId, features)
   → willOpenNew === false 이면: window.open('', targetWinId) 로 기존 창 참조를 받아 .focus() 호출
4. 새로 연 경우: 그 창이 로드되며 hello 전송 → Master가 assign 응답
5. Master가 캐릭터 cellId를 갱신, tick 브로드캐스트
```

**③ 모든 창이 자기 keydown/keyup을 무조건 Master로 중계한다.**
Master는 발신 창을 구분하지 않고 최신 키 상태를 캐릭터 조작에 그대로 적용한다 (캐릭터는 하나뿐이므로 입력 출처를 가릴 필요 없음). 이렇게 하면 유저가 어느 창을 클릭해 포커스가 옮겨가도 조작이 끊기지 않는다.

**④ Master 게임 루프는 Web Worker(`master-worker.js`)에서 돈다, 로비 메인 스레드가 아니다.**
캐릭터가 다른 방으로 이동하면 로비는 배경 탭이 되고, 메인 스레드의 타이머는 Chrome에 의해 초당 1회 수준까지 스로틀링될 수 있다. Worker 내부 타이머는 탭 가시성과 무관하게 정상 동작하므로, 물리 연산과 `tick` 브로드캐스트는 Worker가 전담하고 로비 메인 스레드(`master-ui.js`)는 Worker가 보내는 상태를 받아 렌더링만 한다.

**⑤ Master(Worker)는 로비 창이 열려 있는 동안만 존재한다.**
로비 탭/창을 닫으면 Worker도 함께 종료되어 게임이 끝난다 (의도된 동작). `beforeunload`로 실수 방지 경고를 건다.

---

## 7. 게임 로직

### 7.1 초기화

- 로비 로드 시 `getScreenDetails()` 권한 요청
- 거부되면 `screen.availWidth/Height` 기준 단일 화면 폴백 모드로 전환 (WM API 없이도 동작은 하게)
- 주 화면의 `(gx=0, gy=0)`을 로비 셀로 고정

### 7.2 문 계산

셀 `(gx, gy)`의 4방향 이웃 각각에 대해 `isCellValid()`를 통과하면 그 방향에 문을 생성. 화면 경계를 넘어가는 이웃은 인접 화면의 그리드로 재매핑을 시도 (없으면 벽).

### 7.3 깃발 배치

로비 진입 시, 도달 가능한 셀 집합(그리드 유효성 검사를 만족하는 셀들) 중 로비 셀을 제외하고 `Math.random()`으로 하나 선정.

### 7.4 승리 판정

캐릭터가 깃발 보유 셀에 진입하고 로컬 좌표가 깃발 위치와 겹치면 `flagFound` 브로드캐스트. 모든 창이 동시 플래시 연출.

### 7.5 창 종료 처리

`bye` 수신 시 해당 `cellId`를 `discovered: false`로 되돌림. 캐릭터가 그 방에 있었다면 로비 셀로 강제 이동.

---

## 8. UI 오버레이 (기능 요구사항)

로비 화면에 상시 표시:

- **미니맵** (`minimap.js`) — `screens[]`를 축소 렌더링, 화면별 label/해상도/DPR 표기, 그리드 위에 개척된 셀과 캐릭터 위치 오버레이
- **동기화 지표** — 연결된 창 수, 초당 메시지 수, ping RTT 평균/최대(ms)
- **코드 인스펙터** (`inspector.js`) — 주요 API 호출을 가로채 실행된 코드 형태로 로그 출력 (예: `getScreenDetails()`, `channel.postMessage(...)`, `window.open(...)`)

각 방(Replica) 화면에는 최소 UI만: 캔버스 + 문 접촉 시 뜨는 프롬프트.

---

## 9. 구현 단계 (코드 어시스턴트에게 순서대로 요청)

### 단계 1 — 실측 하네스

`index.html`에 버튼 하나: 클릭 시 `getScreenDetails()` 권한 요청 후 모든 화면 정보를 표로 출력. 동시에 `window.open('', '_blank', 'popup,width=200,height=150')`로 팝업을 열어 실제 `outerWidth/outerHeight/innerWidth/innerHeight`를 표시. 이 값으로 `config.js`의 `ROOM_OUTER_W/H`, `CHROME_OVERHEAD_X/Y`를 확정한다.

**완료 기준**: 화면 정보 표와 실측 팝업 크기가 콘솔/화면에 정확히 출력됨.

### 단계 2 — 좌표계 모듈

`grid.js`에 3장의 함수들(`cellToScreenRect`, `isCellValid`, `cellId`, `neighbors`)을 구현. 단위 테스트 없이, 브라우저 콘솔에서 몇 가지 좌표를 직접 호출해 값 확인.

**완료 기준**: 임의의 `(gx, gy)`에 대해 화면 경계를 벗어나면 `isCellValid`가 정확히 `false` 반환.

### 단계 3 — 통신 계층

`channel.js`에 `BroadcastChannel` 래퍼 작성: `send(type, payload)`, `on(type, handler)`. 내장 계측: 1Hz ping/pong으로 RTT 계산, 초당 메시지 카운트.

**완료 기준**: `room.html`을 두 개 이상 열어 서로 메시지가 오가는 것을 콘솔로 확인.

### 단계 4 — Master 코어 (Web Worker)

`master-worker.js`: 연결된 창 목록, 셀 맵, `PlayerState`를 소유. Worker 내부 `setInterval`로 `CONFIG.TICK_HZ` 물리 루프를 돌리고 `BroadcastChannel`로 `tick` 브로드캐스트 (Worker 안에서 채널을 열어도 동일하게 동작). 벽 충돌 및 문 접촉 판정 포함. `master-ui.js`는 이 Worker를 `new Worker('./src/master-worker.js', { type: 'module' })`로 띄우고, 로비 자신도 하나의 Replica처럼 입력을 Worker로 전달 + 렌더링만 담당.

**완료 기준**: 로비 캔버스 안에서 키보드로 캐릭터가 움직이고 벽에 막힘. 로비 탭을 백그라운드로 보내도(다른 탭 클릭) 콘솔에 찍히는 tick 타임스탬프 간격이 일정하게 유지됨 (이게 Worker 분리가 제대로 됐는지의 검증 포인트).

### 단계 5 — Replica 렌더러

`replica.js`: 로드 시 `window.name = winId` 설정 후 `hello` 전송. `assign` 수신 후 캔버스에 벽/문/깃발 렌더링. `tick` 수신해 캐릭터 렌더링. 자기 창의 keydown/keyup을 전부 `input`으로 전송.

**완료 기준**: `room.html?winId=...`를 열면 자기 방 모양이 올바르게 그려짐.

### 단계 6 — 문 통과 시퀀스

6장의 시퀀스를 정확히 구현하되 두 경로 모두 확인한다: (a) 새 방으로 나가는 경우 — `window.open()`이 `doorConfirm` 키 입력 핸들러 안에서 동기적으로 실행되는지, (b) 이미 열려 있던 방으로 돌아가는 경우 — `window.open('', targetWinId)`로 기존 창 참조를 정확히 받아와 `.focus()`가 실제로 창을 앞으로 가져오는지.

**완료 기준**: (a) 문에 닿아 Space를 누르면 새 창이 인접 위치에 정확히 열리고 캐릭터가 반대편 문 앞에 나타남. (b) 이미 방문한 방향으로 다시 문을 열면 새 창이 뜨지 않고 기존 창이 최상단으로 포커스됨.

### 단계 7 — 오버레이

`minimap.js`, `inspector.js`를 로비에 통합. 8장의 요구사항대로.

**완료 기준**: 화면 조작마다 미니맵이 갱신되고, 인스펙터에 실제 호출 로그가 흐름.

### 단계 8 — 마감

`screenschange` 이벤트로 그리드 재계산, `flagFound` 승리 연출, 창 종료(`bye`) 처리, 권한 거부 시 폴백 모드.

**완료 기준**: 모니터 연결/해제 시 그리드가 갱신되고, 깃발 도달 시 모든 열린 창이 동시에 반응.

---

## 10. 알려진 제약 및 대응

| 제약                                                                                    | 대응                                                                                                                                    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 창 생성 지연 200~300ms                                                                  | 전환 시 짧은 페이드 연출로 체감 지연 완화                                                                                               |
| Chrome 최소 창 크기 클램프                                                              | 단계 1 실측값을 `ROOM_OUTER_W/H` 하한으로 사용                                                                                          |
| 팝업 차단 설정                                                                          | 실행 전 localhost 팝업 허용 필요 (문서에 안내 문구 추가)                                                                                |
| 권한 거부                                                                               | `screen.availWidth/Height` 기반 단일 화면 폴백                                                                                          |
| `file://` 실행 시 BroadcastChannel 불안정                                               | 반드시 `npx serve`로 localhost 서빙                                                                                                     |
| 동시 개방 창 다수 시 메모리                                                             | `CONFIG.MAX_OPEN_ROOMS` 초과 시 가장 오래된 방 자동 닫기 (선택 구현)                                                                    |
| 백그라운드 탭 스로틀링 (로비가 배경으로 갈 때)                                          | 6장 ④ — Master 루프를 Web Worker로 분리해 회피. Worker는 탭 가시성과 무관하게 정상 주기로 동작함 (무음 오디오 편법은 비공식이라 미채택) |
| 팝업이 탭으로 강제 열림                                                                 | Chrome 기본 설정엔 없는 동작이며 특정 확장 프로그램/기업 정책이 있어야 발생. 발생 확률 낮은 제약으로 인지하고 넘어감                    |
| `window.focus()`가 유저 제스처 밖에서 막힘 + Window 참조는 BroadcastChannel로 전달 불가 | 6장 ② — `window.name`을 창 주소로 써서 `window.open('', targetWinId)`로 참조를 획득, `doorConfirm` 핸들러 안에서 동기 호출              |
