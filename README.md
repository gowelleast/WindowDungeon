# 🏰 Window Dungeon

> **작은 브라우저 창 하나가 던전의 방(Room) 하나가 되는 실험적인 멀티 윈도우 던전 크롤러**

![Room Gameplay](assets/gameplay.png)

[![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript%20(ES2022)-F7DF1E?logo=javascript&logoColor=black)](#)
[![HTML5 Canvas](https://img.shields.io/badge/Rendering-HTML5%20Canvas-E34F26?logo=html5&logoColor=white)](#)
[![Web Workers](https://img.shields.io/badge/Concurrency-Web%20Workers-4285F4)](#)
[![Window Management API](https://img.shields.io/badge/Screen-Window%20Management%20API-00C7B7)](#)
[![BroadcastChannel API](https://img.shields.io/badge/IPC-BroadcastChannel%20API-FF6F00)](#)
[![Document Picture-in-Picture API](https://img.shields.io/badge/Always--on--Top-Document%20PiP%20API-8B5CF6)](#)
[![Web Audio API](https://img.shields.io/badge/Audio-Web%20Audio%20API-10B981)](#)

---

## 💡 프로젝트 소개

**Window Dungeon**은 브라우저 창(Window) 자체를 게임의 물리적 월드로 활용하는 웹 게임입니다.  
플레이어가 방 안의 문에 다가가 `[Space]` 키를 누르면, 인접한 모니터 화면 좌표에 맞춰 **실제 브라우저 팝업 창이 부드럽게 열리며** 다음 방으로 연결됩니다.  

던전 어딘가에 있는 **황금 열쇠(🔑)**를 찾아 획득한 후, 굳게 닫힌 **고대 탈출문(🚪🔒)**으로 귀환하여 포탈을 열면 클리어됩니다.  
아직 열리지 않은 미지의 가상 방들을 순찰하는 **그림자 몬스터(👾)**를 피해 탈출하세요!

![Launcher Dashboard](assets/launcher.png)

---

## ✨ 핵심 기술 및 특징

### 1. 🚪 창이 곧 방이다 (Room as a Window)
* 각 방은 독립된 팝업 창(`room.html`)으로 실행됩니다.
* 동/서/남/북 벽의 문을 통과할 때마다 해당 방향의 화면 좌표를 계산하여 새 창을 정확히 스냅하듯 띄웁니다.
* 이미 방문했던 방으로 돌아갈 경우, 새 창을 띄우지 않고 기존 창으로 매끄럽게 포커스를 전환합니다.

### 2. 🗺️ Window Management API 기반 동적 좌표계 (Dynamic Responsive Grid)
* 최신 Chromium의 `window.getScreenDetails()` API를 사용하여 모니터의 물리적 해상도, 절대 좌표(`availLeft`, `availTop`)를 획득합니다.
* **해상도 맞춤형 동적 그리드**: 최소 너비(`minWidth: 400px`)를 만족하면서 화면 가로폭(`availWidth`)을 여백 없이 정확히 분할할 최적의 열/행 수를 자동 계산합니다.
  - 맥북 1440px(3열), FHD 1920px(4열), QHD 2560px(5열) 등 어떤 모니터에서도 우측에 남는 여백(0px) 없이 화면에 완벽하게 스냅됩니다.

### 3. 🔑 황금 열쇠 & 잠긴 고대 탈출문 (Key & Portal System)
* **미니맵 연계 시연의 정수**: 열쇠보다 탈출문을 먼저 발견하면 **미니맵 레이더에 탈출문(🚪) 위치가 영구 마킹**되어, 미지의 방에서 열쇠를 얻은 뒤 미니맵을 보며 탈출문으로 길을 찾아갈 수 있습니다.
* 열쇠 없이 문에 다가가면 둔탁한 락 사운드(`철컹!`)와 함께 잠김 경고가 뜨고, 열쇠 소지 시 찬란한 황금빛 포탈이 열리며 탈출에 성공합니다.

### 4. 👾 백그라운드 순찰 & 추적 몬스터 AI (Background Monster AI)
* **Web Worker Master의 위력**: 실제 브라우저 창이 열려 있지 않은 미지의 가상 방에서도 Worker 내부에서 1~2초마다 인접 방을 자율 순찰(Wandering)합니다.
* `M` 키로 PiP 미니맵을 띄우면 아직 열리지 않은 어둠의 방에서 붉은 점(`👾`)이 꿈틀거리며 이동하는 모습이 레이더에 포착됩니다.
* 플레이어와 같은 방이거나 1칸 이내로 좁혀지면 추적(Chasing) 모드로 전환되며, 부딪히면 넉백 피격과 1초 스턴이 발생합니다.

### 5. 🔊 Web Audio API 기반 레트로 신스 사운드 시스템
* 외부 오디오 파일 다운로드 없이 브라우저 내장 오실레이터 합성기로 0.001초 즉각 반응하는 8-bit 효과음을 제공합니다.
* 열쇠 획득(아르페지오 챠링~), 잠긴 문 충돌(철컹!), 포탈 개방(웅장한 주파수 스윕), 몬스터 피격, 승리 팡파레를 포함하며, `[U]` 키로 실시간 음소거가 가능합니다.

### 6. 📌 Document Picture-in-Picture 기반 전술 플로팅 미니맵
* **Always-on-Top 플로팅 레이더**: Chrome 111+의 최신 **Document Picture-in-Picture API**를 적용하여 OS 최상단에 항상 떠 있는 플로팅 미니맵 윈도우를 제공합니다.
* **공간 효율적 모드 토글 (`M` 키)**:
  - **축소 뱃지 모드** (`250 × 68px`): 게임 시작 시 방해되지 않는 작은 지도 이모지 뱃지 형태로 대기합니다.
  - **확장 레이더 모드** (`280 × 200px`): `[M]` 키를 누르면 실시간 캔버스가 장착되며 전체 던전 개척 지형, 탈출문(🚪), 열쇠(🔑), 몬스터(👾)가 표시됩니다.

### 7. 🎉 멀티스크린/멀티윈도우 연속 축하 꽃가루 (Cross-Window Confetti)
* 모니터들의 전역 절대 화면 좌표계(`globalBounds`)를 기반으로 결정론적 꽃가루 물리 시뮬레이션을 동기화합니다.
* 위쪽 방의 바닥을 뚫고 지나간 꽃가루가 아래쪽 방의 천장으로 단 1px의 오차 없이 이어져 떨어지는 환상적인 다차원 연출을 제공합니다.

---

## 🎮 조작법 & 게임 규칙

| 키 | 동작 |
| :--- | :--- |
| `↑` `↓` `←` `→` 또는 `W` `A` `S` `D` | 캐릭터 4방향 이동 |
| `Space` | 문 열기 / 방 이동 인터랙션 (탈출문 개방) |
| `M` (또는 `ㅡ`) | 전술 플로팅 미니맵 토글 (축소 뱃지 ↔ 확장 레이더) |
| `U` (또는 `ㅕ`) | 사운드 음소거(Mute) 토글 |

* **목표**: 미지의 방들을 개척하여 **황금 열쇠(🔑)**를 얻고, **잠긴 탈출문(🚪)**으로 가서 탈출하세요!
* **클리어 후**: 승리 화면에서 `Space`를 누르면 열린 모든 방 창이 자동으로 정리되고 메인 화면('새 던전 세션 시작')으로 즉시 자동 복귀합니다.
* **종료**: 로비 창을 닫거나 아무 방 창을 닫으면 게임 세션이 안전하게 종료됩니다.

---

## 🏗️ 시스템 아키텍처

```
Lobby Window (Launcher)
 ├─ Web Worker (Master) ── 게임 상태, 물리 충돌, 문 판정, 30Hz Tick 루프
 ├─ 실시간 미니맵 ──────── 모니터 그리드 배치 및 개척된 방 실시간 렌더링
 └─ 시스템 인스펙터 ────── 창 간 통신 프로토콜 로그 & RTT 지표
       │
       │ BroadcastChannel ("dungeon-v1")
       │
 ┌─────┴─────┬───────────┬───────────┐
Room        Room        Room        Room  ... (Replicas)
(로컬 캔버스 렌더링 + 키보드 입력 Master로 중계 + 동기적 window.open)
```

---

## 📂 프로젝트 구조

```
window-dungeon/
├── index.html                # 로비 (Launcher) 진입점
├── room.html                 # 방 (Replica) 진입점
├── style.css                 # 공용 스타일시트
├── spec.md                   # 상세 개발 기획서 및 기술 스펙
├── package.json              # 실행 스크립트 ("start": "npx serve .")
├── assets/                   # README 문서용 캡처 이미지
└── src/
    ├── config.js             # 창 크기 및 게임 파라미터 설정
    ├── protocol.js           # BroadcastChannel 메시지 타입 정의
    ├── grid.js               # 물리 화면 ↔ 그리드 ↔ 로컬 좌표 변환
    ├── channel.js            # BroadcastChannel 통신 래퍼 & RTT 계측
    ├── master-worker.js      # Web Worker 기반 게임 연산 코어
    ├── launcher.js           # 로비 메인 스레드 (모니터 감지, 대시보드)
    ├── replica.js            # 방 창 클라이언트 로직 (입력/렌더링)
    ├── render.js             # 2D 캔버스 드로잉 함수 모음
    ├── inspector.js          # 실시간 시스템 로그 인스펙터
    ├── minimap.js            # 모니터/그리드 실시간 미니맵
    └── confetti.js           # Window Management API 기반 연속 꽃가루 시뮬레이션
```

---

## 🚀 시작하기

### 실행 환경 요구사항
* **Chromium 기반 브라우저**: Chrome 또는 Edge 최신 버전 (Window Management API 지원 필요)
* Node.js (로컬 정적 웹 서버 실행용)

### 실행 단계

1. **저장소 클론**
   ```bash
   git clone https://github.com/gowelleast/WindowDungeon.git
   cd WindowDungeon
   ```

2. **로컬 서버 실행**
   ```bash
   npm start
   ```
   > 또는 `npx serve .` 명령어로 정적 파일을 호스팅합니다. (Window Management API는 Secure Context인 `localhost` 또는 `https` 환경에서만 동작합니다.)

3. **게임 시작**
   * 브라우저에서 `http://localhost:3000` (또는 터미널에 표시된 포트)으로 접속합니다.
   * 첫 접속 시 **팝업 허용** 및 **화면 정보(Window Management) 권한**을 승인합니다.
   * **[게임 시작]** 버튼을 누르면 첫 번째 방(Lobby) 팝업 창이 열리며 게임이 시작됩니다.

---

## 📄 라이선스

This project is licensed under the MIT License.
