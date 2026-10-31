# 🏰 Window Dungeon

> **작은 브라우저 창 하나가 던전의 방(Room) 하나가 되는 멀티 윈도우 공간 크롤러**

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

**Window Dungeon**은 브라우저 창(Window)을 게임 월드의 공간 단위로 활용하는 웹 테크 데모 게임입니다.  
플레이어가 방 안의 문에 다가가 `[Space]` 키를 누르면, 인접한 화면 좌표에 맞춰 브라우저 팝업 창이 배치되며 새로운 방으로 이어집니다.

던전 내부의 <strong>열쇠(🔑)</strong>를 획득한 뒤 <strong>탈출문(🚪)</strong>으로 이동해 <strong>포탈(🌀)</strong>을 개방하고 탈출하는 것이 목표입니다.  
열리지 않은 방들을 포함해 던전을 순찰하는 <strong>몬스터(👾)</strong>를 피해 이동해야 합니다.

![Shadow Monster Chase](assets/chase.png)

---

## ✨ 주요 기술 및 기능

### 1. 🚪 창 기반 방 구조 (Room as a Window)
* 각 방은 독립된 브라우저 팝업 창(`room.html`)으로 실행됩니다.
* 동/서/남/북 벽의 문을 통과할 때마다 화면 좌표를 계산해 새 창을 격자 그리드 위치에 배치합니다.
* 이미 방문했던 방으로 이동할 경우, 새 창을 열지 않고 기존 창으로 포커스를 전환합니다.

### 2. 🗺️ Window Management API 기반 동적 좌표계 (Dynamic Responsive Grid)
* Chromium의 `window.getScreenDetails()` API를 사용하여 모니터의 해상도와 가용 영역 좌표(`availLeft`, `availTop`, `availWidth`, `availHeight`)를 계산합니다.
* **해상도 기반 동적 그리드**: 화면 가로/세로 폭에 맞춰 열/행 수를 분할하여 1440px, FHD(1920px), QHD(2560px) 등 모니터 해상도에 맞게 그리드를 구성합니다.
* macOS 브라우저 상단 타이틀바 및 주소창 높이(`63px`)를 보정하여 창들이 겹치거나 잘리지 않도록 배치합니다.

### 3. 🌀 포탈 및 봉인 연출 (Portal & Seal System)
* **포탈 (Vortex)**: 열쇠 획득 시 탈출문에 포탈이 활성화되며, 나선 팔과 회전 리본, 중심부로 모이는 입자 효과를 Canvas 2D로 렌더링합니다.
* **봉인 상태**: 열쇠가 없을 때는 회전하는 8각 마법진과 룬 노드, 자물쇠(🔒) 아이콘으로 잠금 상태를 표시합니다.

### 4. 🔑 열쇠 및 탈출문 마킹 (Golden Key)
* 상하 부유 모션과 회전 서클, 파티클 효과를 가진 열쇠 오브젝트를 렌더링합니다.
* 열쇠를 얻기 전에 탈출문을 먼저 발견하더라도 미니맵에 탈출문(🚪) 위치가 기록되어, 열쇠 획득 후 위치를 확인할 수 있습니다.

### 5. 👾 백그라운드 몬스터 AI (Background Monster AI)
* **Web Worker 기반 시뮬레이션**: 브라우저 창이 열려 있지 않은 방을 포함해, Worker 코어가 1~2초 간격으로 몬스터의 인접 방 순찰(Wandering)을 처리합니다.
* 플레이어와 같은 방에 있거나 1칸 이내로 가까워지면 추적(Chasing) 모드로 전환되며, 충돌 시 넉백과 함께 2.5초간 무적 시간(점멸 효과)이 적용됩니다.

### 6. 📌 Document Picture-in-Picture 기반 미니맵
* **Always-on-Top 플로팅 창**: Chrome의 **Document Picture-in-Picture API**를 사용해 다른 창 위에 유지되는 미니맵 창을 제공합니다.
* `[M]` 키로 열고 닫을 수 있으며, 탐색한 던전 지형과 플레이어 위치, 탈출문(🚪), 열쇠(🔑), 몬스터(👾) 위치를 표시합니다.

### 7. 🔊 Web Audio API 사운드 및 음소거 동기화
* 외부 음원 파일 없이 Web Audio API 오실레이터로 효과음(열쇠 획득, 잠긴 문, 포탈 개방, 피격, 클리어)을 합성하여 재생합니다.
* `[U]` 키로 음소거(Mute)를 전환할 수 있으며, 새 창이 열리거나 창 간 이동 시에도 음소거 상태가 동기화됩니다.

### 8. 🎉 다중 윈도우 꽃가루 연출 (Cross-Window Confetti)
* 모니터의 전역 화면 좌표계(`globalBounds`)를 기준으로 파티클 위치를 계산합니다.
* 위쪽 창 아래로 벗어난 꽃가루 파티클이 아래쪽 창의 상단 좌표로 이어져 렌더링됩니다.

---

## 🎮 조작법 및 게임 규칙

| 키 | 동작 |
| :--- | :--- |
| `↑` `↓` `←` `→` 또는 `W` `A` `S` `D` | 캐릭터 4방향 이동 |
| `Space` | 문 열기 / 방 이동 (새로운 방 생성 및 이동) |
| `M` (또는 `ㅡ`) | Always-on-Top **미니맵** 열기 / 닫기 토글 |
| `U` (또는 `ㅕ`) | 사운드 음소거(Mute) 켜기 / 끄기 토글 |

* **게임 목표**: 방들을 탐색해 <strong>열쇠(🔑)</strong>를 찾은 뒤, <strong>탈출문(🚪)</strong>에 도달하여 <strong>포탈(🌀)</strong>로 진입합니다.
* **클리어 후**: 승리 화면에서 `Space`를 누르면 열려 있는 방 창들이 닫히고 로비 화면('새 던전 세션 시작')으로 돌아갑니다.
* **종료**: 로비 창을 닫으면 실행 중인 모든 하위 방 창이 함께 닫힙니다.

---

## 🏗️ 시스템 아키텍처

```
Lobby Window (Launcher)
 ├─ Web Worker (Master Core) ── 독립 30Hz 루프: 게임 물리, 충돌, 몬스터 AI, 문 판정
 ├─ 실시간 대시보드 ─────────── 모니터 그리드 매핑 & 메시지 RTT 지표
 └─ 시스템 인스펙터 ─────────── BroadcastChannel IPC 패킷 트래픽 모니터링
       │
       │ BroadcastChannel ("dungeon-v1")
       │
 ┌─────┴─────┬───────────┬───────────┐
Room        Room        Room        Room  ... (Replicas)
(로컬 Canvas 2D 렌더링 + 키보드 입력 Master 중계 + 동기적 window.open 팝업 제어)
```

---

## 📂 프로젝트 구조

```
window-dungeon/
├── index.html                # 로비 (Launcher) 진입점
├── room.html                 # 방 (Replica) 진입점
├── style.css                 # 스타일시트
├── spec.md                   # 기술 스펙 및 설계 문서
├── package.json              # 실행 스크립트 ("start": "npx serve .")
├── assets/                   # README용 스크린샷 이미지
│   ├── gameplay.png          # 멀티 윈도우 및 PiP 미니맵 인게임 스크린샷
│   ├── chase.png             # 몬스터 추적 스크린샷
│   └── launcher.png          # 로비 화면 스크린샷
└── src/
    ├── config.js             # 창 크기 및 게임 밸런스 설정
    ├── protocol.js           # BroadcastChannel IPC 메시지 프로토콜 정의
    ├── grid.js               # 물리 화면 ↔ 그리드 ↔ 로컬 좌표 변환
    ├── channel.js            # BroadcastChannel 통신 래퍼 및 RTT 계측
    ├── master-worker.js      # Web Worker 기반 게임 연산 코어
    ├── launcher.js           # 로비 메인 스레드 (모니터 감지, 대시보드 제어)
    ├── replica.js            # 방 창 클라이언트 로직 (창 오픈, 렌더 루프)
    ├── render.js             # Canvas 2D 렌더링 (포탈, 결계, 캐릭터, 몬스터)
    ├── sound.js              # Web Audio API 신스 사운드 및 음소거 처리
    ├── inspector.js          # 시스템 패킷 로그 인스펙터
    ├── minimap.js            # Document PiP 기반 미니맵
    └── confetti.js           # 다중 창 기준 꽃가루 파티클 시뮬레이션
```

---

## 🚀 시작하기

### 실행 환경 요구사항
* **Chromium 기반 브라우저**: Chrome 또는 Edge 최신 버전 (Window Management API 지원 필요)
* **Node.js**: 로컬 정적 웹 서버 실행용

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
   > 또는 `npx serve .` 명령어로 정적 파일을 호스팅합니다. (Window Management API 및 Document PiP는 Secure Context인 `localhost` 또는 `https` 환경에서만 동작합니다.)

3. **게임 시작**
   * 브라우저에서 `http://localhost:3000` (또는 터미널에 안내된 포트)으로 접속합니다.
   * 첫 접속 시 **팝업 허용** 및 **창 관리(Window Management) 권한**을 승인합니다.
   * **[⚔️ 게임 시작]** 버튼을 누르면 첫 번째 방 팝업 창이 열리며 게임이 시작됩니다.

---

## 📄 라이선스

This project is licensed under the MIT License.
