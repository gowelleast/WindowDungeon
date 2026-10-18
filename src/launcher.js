import { CONFIG } from './config.js';
import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { initMinimap } from './minimap.js';
import { initInspector } from './inspector.js';

let worker;
const myWinId = 'launcher';
window.name = myWinId;
const channel = new DungeonChannel(myWinId);

window.addEventListener('beforeunload', (e) => {
  if (worker) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.getElementById('btn-start').addEventListener('click', async () => {
  let screens = [];
  let currentScreenLabel = '';
  let left = 0;
  let top = 0;
  
  if ('getScreenDetails' in window) {
    const details = await window.getScreenDetails();

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
      const activeScreens = getTargetScreens();
      channel.send(MSG.SCREENS_UPDATE, { screens: activeScreens, currentScreenLabel: details.currentScreen.label });
    };

    details.addEventListener('screenschange', updateScreens);
    details.addEventListener('currentscreenchange', updateScreens);
  } else {
    screens = [{
      label: 'Fallback Screen', availLeft: 0, availTop: 0,
      availWidth: window.screen.availWidth, availHeight: window.screen.availHeight, isPrimary: true
    }];
    currentScreenLabel = 'Fallback Screen';
  }

  // 동기적 유저 제스처 내에서 첫 번째 팝업(로비 방) 열기
  // popup=yes 파라미터를 명시하여 탭이 아닌 무조건 팝업으로 열리게 강제합니다.
  const features = `popup=yes,resizable=no,width=${CONFIG.ROOM_OUTER_W},height=${CONFIG.ROOM_OUTER_H},left=${left},top=${top}`;
  window.open(`./room.html#winId=lobby`, 'lobby', features);

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('status').style.display = 'block';

  // 로그 및 버튼 초기화
  const logContainer = document.getElementById('inspector-log');
  if (logContainer) logContainer.innerHTML = '';
  document.getElementById('btn-reset').style.display = 'none';

  // 대시보드 컴포넌트 초기화
  initMinimap(channel);
  initInspector(channel);

  worker = new Worker('./src/master-worker.js', { type: 'module' });
  
  // Worker가 느리게 시작되는 경우를 대비해, 방(로비 포함)이 생성될 때마다 화면 정보를 확실히 동기화합니다.
  channel.on(MSG.HELLO, () => {
    const data = { screens, currentScreenLabel };
    channel.send(MSG.SCREENS_UPDATE, data);
    if (channel.handlers[MSG.SCREENS_UPDATE]) {
      channel.handlers[MSG.SCREENS_UPDATE](data);
    }
  });
  
  // 만약을 위해 즉시 한번 쏴줌
  const data = { screens, currentScreenLabel };
  channel.send(MSG.SCREENS_UPDATE, data);

  channel.on(MSG.CLOSE_ALL, () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    // 즉시 전환하지 않고 리셋 버튼 표시
    document.getElementById('btn-reset').style.display = 'block';
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('status').style.display = 'none';
});
