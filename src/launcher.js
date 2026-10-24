import { CONFIG, computeDynamicRoomSize } from './config.js';
import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { initMinimap } from './minimap.js';
import { initInspector } from './inspector.js';

let worker;
const myWinId = 'launcher';
window.name = myWinId;
const channel = new DungeonChannel(myWinId);

// 한 게임 세션 동안 등록한 구독/리스너의 정리 함수 목록.
// "게임 시작"을 다시 누를 때 이전 세션 것을 모두 해제해 핸들러·로그·screenschange 리스너 중복을 막습니다.
let sessionDisposers = [];

function disposeSession() {
  sessionDisposers.forEach((dispose) => dispose());
  sessionDisposers = [];
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

window.addEventListener('beforeunload', (e) => {
  if (worker) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.getElementById('btn-start').addEventListener('click', async () => {
  disposeSession();

  let screens = [];
  let currentScreenLabel = '';
  let left = 0;
  let top = 0;
  
  let details = null;
  if ('getScreenDetails' in window) {
    try {
      details = await window.getScreenDetails();
    } catch (err) {
      // 권한 거부 등으로 실패하면 단일 화면 폴백 모드로 진행
      console.warn('[Launcher] getScreenDetails() 실패, 단일 화면 폴백 모드로 전환:', err);
    }
  }

  // 화면 해상도에 맞춘 동적 방 크기(폭/높이) 계산 (여백 없이 꽉 채움)
  const targetScreenForSize = details ? details.currentScreen : {
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight
  };
  const { roomW, roomH } = computeDynamicRoomSize(targetScreenForSize.availWidth, targetScreenForSize.availHeight);
  CONFIG.ROOM_OUTER_W = roomW;
  CONFIG.ROOM_OUTER_H = roomH;

  if (details) {
    const formatScreen = (s) => ({
      label: s.label, availLeft: s.availLeft, availTop: s.availTop,
      availWidth: s.availWidth, availHeight: s.availHeight, isPrimary: s.isPrimary
    });

    const getTargetScreens = () => {
      if (CONFIG.SINGLE_SCREEN_ONLY) {
        return [formatScreen(details.currentScreen)];
      }
      return details.screens.map(formatScreen);
    };

    screens = getTargetScreens();
    currentScreenLabel = details.currentScreen.label;
    left = details.currentScreen.availLeft;
    top = details.currentScreen.availTop;
    
    const updateScreens = () => {
      // HELLO 재동기화 시에도 최신 배치를 보내도록 세션 상태를 함께 갱신
      screens = getTargetScreens();
      currentScreenLabel = details.currentScreen.label;
      const data = { screens, currentScreenLabel, roomW, roomH };
      channel.send(MSG.SCREENS_UPDATE, data);
      channel.emitLocal(MSG.SCREENS_UPDATE, data);
    };

    details.addEventListener('screenschange', updateScreens);
    details.addEventListener('currentscreenchange', updateScreens);
    sessionDisposers.push(() => {
      details.removeEventListener('screenschange', updateScreens);
      details.removeEventListener('currentscreenchange', updateScreens);
    });
  } else {
    screens = [{
      label: 'Fallback Screen', availLeft: 0, availTop: 0,
      availWidth: window.screen.availWidth, availHeight: window.screen.availHeight, isPrimary: true
    }];
    currentScreenLabel = 'Fallback Screen';
  }

  // 동기적 유저 제스처 내에서 첫 번째 팝업(로비 방) 열기
  // popup=yes 파라미터를 명시하여 탭이 아닌 무조건 팝업으로 열리게 강제합니다.
  const features = `popup=yes,resizable=no,width=${roomW},height=${roomH},left=${left},top=${top}`;
  const popup = window.open(`./room.html#winId=lobby&w=${roomW}&h=${roomH}`, 'lobby', features);
  if (!popup) {
    alert('브라우저에서 팝업이 차단되었습니다. 주소창 우측에서 팝업을 허용해주세요!');
    return;
  }

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('status').style.display = 'block';

  // 로그 및 버튼 초기화
  const logContainer = document.getElementById('inspector-log');
  if (logContainer) logContainer.innerHTML = '';
  document.getElementById('btn-reset').style.display = 'none';

  // 대시보드 컴포넌트 초기화
  sessionDisposers.push(initMinimap(channel));
  sessionDisposers.push(initInspector(channel));

  worker = new Worker('./src/master-worker.js', { type: 'module' });
  
  // Worker가 느리게 시작되는 경우를 대비해, 방(로비 포함)이 생성될 때마다 화면 정보를 확실히 동기화합니다.
  // BroadcastChannel은 자기 자신에게 메시지를 돌려주지 않으므로, 같은 창의 미니맵에는 emitLocal로 전달합니다.
  sessionDisposers.push(channel.on(MSG.HELLO, () => {
    const data = { screens, currentScreenLabel, roomW, roomH };
    channel.send(MSG.SCREENS_UPDATE, data);
    channel.emitLocal(MSG.SCREENS_UPDATE, data);
  }));
  
  // 만약을 위해 즉시 한번 쏴줌
  const data = { screens, currentScreenLabel, roomW, roomH };
  channel.send(MSG.SCREENS_UPDATE, data);

  sessionDisposers.push(channel.on(MSG.CLOSE_ALL, () => {
    disposeSession();
    // 세션 종료 시 시작 화면('새 던전 세션 시작')으로 즉시 자동 복귀
    document.getElementById('start-screen').style.display = 'block';
    document.getElementById('status').style.display = 'none';
    document.getElementById('btn-reset').style.display = 'none';
  }));
});

document.getElementById('btn-reset').addEventListener('click', () => {
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('status').style.display = 'none';
});
