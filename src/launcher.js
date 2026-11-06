import { CONFIG, computeDynamicRoomSize } from './config.js';
import { DungeonChannel } from './channel.js';
import { MSG } from './protocol.js';
import { initMinimap } from './minimap.js';
import { initInspector } from './inspector.js';
import { sound } from './sound.js';

let worker;
const myWinId = 'launcher';
window.name = myWinId;
const channel = new DungeonChannel(myWinId);

// 모바일 기기 감지 (iOS, Android, 터치 전용 기기)
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  (window.matchMedia && window.matchMedia('(max-width: 768px)').matches && 'ontouchstart' in window);

if (isMobileDevice) {
  const mobileCard = document.getElementById('mobile-card');
  const startScreen = document.getElementById('start-screen');
  if (mobileCard && startScreen) {
    mobileCard.style.display = 'block';
    startScreen.style.display = 'none';
  }

  const btnCopy = document.getElementById('btn-copy-url');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const fb = document.getElementById('copy-feedback');
        if (fb) fb.style.display = 'block';
      } catch (e) {
        prompt('아래 주소를 복사해 노트북 Chrome에서 열어주세요:', window.location.href);
      }
    });
  }
} else {
  // 데스크톱 비호환 브라우저(Safari, Firefox 등 Window Management / Document PiP 미지원 환경) 감지
  const ua = navigator.userAgent || '';
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Brave|Whale/i.test(ua);
  const lacksWindowAPIs = !('getScreenDetails' in window) || !('documentPictureInPicture' in window);

  if (isFirefox || isSafari || lacksWindowAPIs) {
    const banner = document.getElementById('browser-warning-banner');
    const badge = document.getElementById('browser-warning-badge');
    const btnCopyBanner = document.getElementById('btn-copy-banner-url');

    if (badge) {
      const browserLabel = isSafari ? 'Safari' : isFirefox ? 'Firefox' : '비호환 브라우저';
      badge.textContent = `⚠️ ${browserLabel} 감지됨 — Chrome 권장`;
    }
    if (banner) {
      banner.style.display = 'flex';
    }
    if (btnCopyBanner) {
      btnCopyBanner.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          btnCopyBanner.textContent = '✅ 복사됨!';
          setTimeout(() => { btnCopyBanner.textContent = '📋 링크 복사'; }, 2000);
        } catch (e) {
          prompt('아래 주소를 복사해 데스크톱 Chrome에서 열어주세요:', window.location.href);
        }
      });
    }
  }
}

// 시작 카드 인터랙티브 스포트라이트 이벤트 바인딩
document.querySelectorAll('.start-card').forEach((card) => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  });
});

// 시작 화면('새 던전 세션 시작') 주변에 방이 생성되었다가 다음 방으로 넘어가는 앰비언트 연출
const phantomLayer = document.getElementById('phantom-rooms-layer');
const startScreenEl = document.getElementById('start-screen');
const PHANTOM_THEMES = [
  { icon: '🔑', label: 'STAGE 1 · 열쇠의 방' },
  { icon: '💠', label: 'STAGE 2 · 룬스톤 점령' },
  { icon: '💎', label: 'STAGE 3 · 룬스톤 오팔' },
  { icon: '🗡️', label: 'STAGE 3 · 성검의 방' },
  { icon: '✨', label: 'STAGE 4 · 성검 추적' },
  { icon: '👑', label: 'STAGE 5 · 보스전' }
];
let phantomThemeIdx = 0;
let lastSpawnDir = 'left';

function getDoorCoordsPercent(dir) {
  if (dir === 'left') return { left: '10%', top: '50%' };
  if (dir === 'right') return { left: '90%', top: '50%' };
  if (dir === 'up') return { left: '50%', top: '14%' };
  return { left: '50%', top: '86%' };
}

function spawnPhantomRoomCycle() {
  if (isMobileDevice || !phantomLayer || !startScreenEl) return;
  if (startScreenEl.style.display === 'none') return;

  // 좌/우 인접 방을 번갈아 생성하여 중앙 start-card 양옆으로 방이 이어지는 느낌 연출
  const spawnDir = lastSpawnDir === 'right' ? 'left' : 'right';
  lastSpawnDir = spawnDir;

  const entryDoor = spawnDir === 'right' ? 'left' : 'right';
  const possibleExits = [spawnDir, 'up', 'down'];
  const exitDoor = possibleExits[Math.floor(Math.random() * possibleExits.length)];
  const theme = PHANTOM_THEMES[phantomThemeIdx % PHANTOM_THEMES.length];
  phantomThemeIdx++;

  const roomHash = Math.random().toString(16).slice(2, 6);
  const mainDoorEl = document.getElementById(`card-door-${spawnDir}`);
  if (mainDoorEl) {
    mainDoorEl.classList.add('active');
  }

  const card = document.createElement('div');
  card.className = `phantom-room-card dir-${spawnDir}`;

  const startPos = getDoorCoordsPercent(entryDoor);
  const endPos = getDoorCoordsPercent(exitDoor);

  card.innerHTML = `
    <div class="phantom-win-header">
      <div class="phantom-win-dots"><span></span><span></span><span></span></div>
      <span>Room: room-${roomHash}</span>
      <span style="opacity:0.55;">30Hz</span>
    </div>
    <div class="phantom-room-body">
      <span class="phantom-room-door p-door-up"></span>
      <span class="phantom-room-door p-door-right"></span>
      <span class="phantom-room-door p-door-down"></span>
      <span class="phantom-room-door p-door-left"></span>
      <div class="phantom-room-center-badge">
        <div class="phantom-room-icon">${theme.icon}</div>
        <div class="phantom-room-label">${theme.label}</div>
      </div>
      <div class="phantom-adventurer" style="left: ${startPos.left}; top: ${startPos.top};"></div>
    </div>
  `;

  phantomLayer.appendChild(card);

  const advEl = card.querySelector('.phantom-adventurer');
  const exitDoorEl = card.querySelector(`.p-door-${exitDoor}`);

  // 1. 인접 방 카드 팝업 등장 및 모험가 이동 시작
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.classList.add('is-visible');
      if (advEl) {
        advEl.style.left = endPos.left;
        advEl.style.top = endPos.top;
      }
    });
  });

  setTimeout(() => {
    if (mainDoorEl) mainDoorEl.classList.remove('active');
  }, 550);

  // 2. 모험가가 다음 문에 도달하면 출구 문이 빛나며 다음 방으로 넘어가는 것처럼 퇴장
  setTimeout(() => {
    if (exitDoorEl) exitDoorEl.classList.add('is-exit-active');
  }, 1050);

  setTimeout(() => {
    card.classList.remove('is-visible');
    card.classList.add(`depart-${exitDoor}`);
  }, 1350);

  setTimeout(() => {
    if (card.parentNode) card.parentNode.removeChild(card);
  }, 1900);
}

if (!isMobileDevice) {
  setTimeout(spawnPhantomRoomCycle, 600);
  setInterval(spawnPhantomRoomCycle, 2400);
}

// 런처 사운드 토글 버튼 바인딩 및 전역 동기화
const btnLauncherMute = document.getElementById('btn-launcher-mute');
function updateMuteButtonUI(isMuted) {
  if (btnLauncherMute) {
    btnLauncherMute.textContent = isMuted ? '🔇 사운드 OFF' : '🔊 사운드 ON';
  }
}

if (btnLauncherMute) {
  updateMuteButtonUI(sound.isMuted);
  btnLauncherMute.addEventListener('click', () => {
    sound.init();
    const isMuted = sound.toggleMute();
    updateMuteButtonUI(isMuted);
    channel.send(MSG.SOUND_MUTE_SYNC, { isMuted });
  });
}

channel.on(MSG.SOUND_MUTE_SYNC, (data) => {
  sound.setMute(data.isMuted);
  updateMuteButtonUI(data.isMuted);
});

// 한 게임 세션 동안 등록한 구독/리스너의 정리 함수 목록.
let sessionDisposers = [];

function disposeSession() {
  sound.stopAmbient();
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

  // 화면 해상도에 맞춘 동적 방 크기(폭/높이) 계산 (주소창/상태표시줄 오버헤드 63px 완벽 포함)
  const targetScreenForSize = details ? details.currentScreen : {
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight
  };
  const { roomW, roomH, slotW, slotH } = computeDynamicRoomSize(targetScreenForSize.availWidth, targetScreenForSize.availHeight);
  CONFIG.ROOM_OUTER_W = roomW;
  CONFIG.ROOM_OUTER_H = roomH;
  CONFIG.ROOM_SLOT_W = slotW;
  CONFIG.ROOM_SLOT_H = slotH;

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
      const data = { screens, currentScreenLabel, roomW, roomH, slotW, slotH };
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
    const sLeft = (window.screen && window.screen.availLeft !== undefined) ? window.screen.availLeft : 0;
    const sTop = (window.screen && window.screen.availTop !== undefined) ? window.screen.availTop : 0;
    screens = [{
      label: 'Fallback Screen',
      availLeft: sLeft,
      availTop: sTop,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      isPrimary: true
    }];
    currentScreenLabel = 'Fallback Screen';
    left = sLeft;
    top = sTop;
  }

  // 동기적 유저 제스처 내에서 첫 번째 팝업(로비 방) 열기
  // popup=yes 파라미터를 명시하여 탭이 아닌 무조건 팝업으로 열리게 강제합니다.
  const features = `popup=yes,resizable=no,width=${roomW},height=${roomH},left=${left},top=${top}`;
  const popup = window.open(`./room.html#winId=lobby&w=${roomW}&h=${roomH}&muted=${sound.isMuted ? 1 : 0}`, 'lobby', features);
  if (!popup) {
    alert('브라우저에서 팝업이 차단되었습니다. 주소창 우측에서 팝업을 허용해주세요!');
    return;
  }

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('status').style.display = 'block';

  document.getElementById('btn-reset').style.display = 'none';

  // 대시보드 컴포넌트 초기화 (공간 미니맵 & 보유 아이템창)
  sessionDisposers.push(initMinimap(channel));
  sessionDisposers.push(initInspector(channel));

  // 다크 앰비언트 배경음(Drone BGM) 시작 및 몬스터 인접 텐션(심장박동) 실시간 연동
  sound.startAmbient();
  sessionDisposers.push(channel.on(MSG.TICK, (tickData) => {
    sound.updateTension(tickData.monsterTension || 0);
  }));
  sessionDisposers.push(channel.on(MSG.VICTORY, () => {
    sound.stopAmbient();
  }));

  worker = new Worker('./src/master-worker.js', { type: 'module' });
  
  // Worker가 느리게 시작되는 경우를 대비해, 방(로비 포함)이 생성될 때마다 화면 정보를 확실히 동기화합니다.
  // BroadcastChannel은 자기 자신에게 메시지를 돌려주지 않으므로, 같은 창의 미니맵에는 emitLocal로 전달합니다.
  sessionDisposers.push(channel.on(MSG.HELLO, () => {
    const data = { screens, currentScreenLabel, roomW, roomH, slotW, slotH };
    channel.send(MSG.SCREENS_UPDATE, data);
    channel.emitLocal(MSG.SCREENS_UPDATE, data);
  }));
  
  // 만약을 위해 즉시 한번 쏴줌
  const data = { screens, currentScreenLabel, roomW, roomH, slotW, slotH };
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
