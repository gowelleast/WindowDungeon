import { MSG } from './protocol.js';

const TOTAL_SLOTS = 3;

const ITEM_DEFINITIONS = {
  key: {
    id: 'key',
    icon: '🔑',
    name: '황금 열쇠',
    theme: 'item-gold',
    getBadge: (stage) => (stage > 1 ? '사용 완료' : '보유 중'),
    desc: '잠긴 탈출 포탈의 봉인을 해제하여 다음 스테이지로 나아갈 수 있게 해줍니다.'
  },
  map: {
    id: 'map',
    icon: '🗺️',
    name: '탐험가의 지도',
    theme: 'item-cyan',
    getBadge: () => '패시브 적용 중',
    desc: '미니맵에 아직 개척하지 않은 전체 방 구조와 주요 목표의 위치를 밝혀줍니다.'
  },
  boots: {
    id: 'boots',
    icon: '👢',
    name: '신속의 신발',
    theme: 'item-emerald',
    getBadge: () => '이동속도 +30%',
    desc: '발걸음이 가벼워져 캐릭터의 이동 속도가 30% 증가합니다.'
  },
  sword: {
    id: 'sword',
    icon: '🗡️',
    name: '전설의 성검',
    theme: 'item-mythic',
    getBadge: () => '장착 중 · [SPACE] 공격',
    desc: '성소의 빛을 흡수해 각성한 성검입니다. 보스에게 다가가 [Space]로 참격을 가합니다.'
  }
};

/**
 * 보유 아이템(인벤토리) 패널을 초기화하고, 정리(dispose) 함수를 반환합니다.
 */
export function initInspector(channel) {
  const container = document.getElementById('inventory-list');
  const subtitleEl = document.getElementById('inventory-subtitle');
  if (!container) return () => {};

  const state = {
    stage: 1,
    hasKey: false,
    hasMapItem: false,
    hasBootsItem: false,
    hasLegendarySword: false
  };

  let lastStateKey = '';
  const knownItemIds = new Set();

  function renderInventory() {
    const stateKey = `${state.stage}|${state.hasKey}|${state.hasMapItem}|${state.hasBootsItem}|${state.hasLegendarySword}`;
    if (stateKey === lastStateKey) return;
    lastStateKey = stateKey;

    const acquired = [];
    if (state.hasKey) acquired.push(ITEM_DEFINITIONS.key);
    if (state.hasMapItem) acquired.push(ITEM_DEFINITIONS.map);
    if (state.hasBootsItem) acquired.push(ITEM_DEFINITIONS.boots);
    if (state.hasLegendarySword) acquired.push(ITEM_DEFINITIONS.sword);

    if (subtitleEl) {
      subtitleEl.textContent = `${acquired.length}개 보유`;
    }

    const slotCount = Math.max(TOTAL_SLOTS, acquired.length);
    const cardsHtml = [];

    for (let i = 0; i < slotCount; i++) {
      const item = acquired[i];
      if (item) {
        const isNewlyAcquired = !knownItemIds.has(item.id);
        knownItemIds.add(item.id);
        const badgeText = item.getBadge(state.stage);
        const isUsedKey = item.id === 'key' && state.stage > 1;

        cardsHtml.push(`
          <div class="inventory-slot is-filled ${item.theme}${isNewlyAcquired ? ' is-new' : ''}${isUsedKey ? ' is-used' : ''}">
            <div class="inventory-icon-box">
              <span class="inventory-icon">${item.icon}</span>
            </div>
            <div class="inventory-info">
              <div class="inventory-title-row">
                <span class="inventory-name">${item.name}</span>
                <span class="inventory-badge">${badgeText}</span>
              </div>
              <p class="inventory-desc">${item.desc}</p>
            </div>
          </div>
        `);
      } else {
        cardsHtml.push(`
          <div class="inventory-slot is-empty">
            <div class="inventory-icon-box">
              <span class="inventory-icon">❔</span>
            </div>
            <div class="inventory-info">
              <div class="inventory-title-row">
                <span class="inventory-name">빈 아이템 슬롯</span>
                <span class="inventory-badge">미획득</span>
              </div>
              <p class="inventory-desc">던전의 방을 탐색하여 아이템을 획득하면 이곳에 표시됩니다.</p>
            </div>
          </div>
        `);
      }
    }

    container.innerHTML = cardsHtml.join('');
  }

  // 초기 빈 슬롯 렌더링
  renderInventory();

  const offTick = channel.on(MSG.TICK, (data) => {
    if (!data) return;
    if (data.stage !== undefined) state.stage = data.stage;
    if (data.hasKey !== undefined) state.hasKey = Boolean(data.hasKey);
    if (data.hasMapItem !== undefined) state.hasMapItem = Boolean(data.hasMapItem);
    if (data.hasBootsItem !== undefined) state.hasBootsItem = Boolean(data.hasBootsItem);
    if (data.hasLegendarySword !== undefined) state.hasLegendarySword = Boolean(data.hasLegendarySword);
    renderInventory();
  });

  const offKey = channel.on(MSG.KEY_COLLECTED, () => {
    state.hasKey = true;
    renderInventory();
  });

  const offItem = channel.on(MSG.ITEM_COLLECTED, (data) => {
    if (data && data.hasMapItem !== undefined) state.hasMapItem = Boolean(data.hasMapItem);
    if (data && data.hasBootsItem !== undefined) state.hasBootsItem = Boolean(data.hasBootsItem);
    renderInventory();
  });

  const offSword = channel.on(MSG.SWORD_DRAWN, () => {
    state.hasLegendarySword = true;
    renderInventory();
  });

  return () => {
    offTick();
    offKey();
    offItem();
    offSword();
  };
}
