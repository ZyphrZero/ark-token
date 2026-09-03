// 面板视觉验证用 chrome API mock：注入到构建后的 popup 页面（仅本地预览，不含真实凭据）
(function () {
  const NOW = Math.floor(Date.now() / 1000)
  const info = {
    currentTs: NOW,
    status: {
      uid: '135297507', name: '阿米娅', level: 120,
      avatar: { type: 'ICON', id: '1', url: '' },
      ap: { current: 82, max: 135, lastApAddTime: NOW - 120, completeRecoveryTime: NOW + 5 * 3600 },
      charCnt: 214
    },
    recruit: [
      { startTs: NOW - 3600, finishTs: NOW + 900, state: 2 },
      { startTs: NOW - 7200, finishTs: NOW + 5400, state: 2 },
      { startTs: 0, finishTs: 0, state: 1 },
      { startTs: 0, finishTs: 0, state: 3 }
    ],
    building: {
      labor: { value: 87, maxValue: 200, remainSecs: 0, lastUpdateTime: NOW - 720 },
      control: { slotId: '0', chars: [{ charId: 'char_002_amiya', ap: 20000, lastApAddTime: 0, index: 0 }], level: 5 },
      powers: [
        { slotId: '1', chars: [], level: 3 },
        { slotId: '2', chars: [], level: 2 }
      ],
      manufactures: [
        { slotId: '3', chars: [{ charId: 'char_010_chen', ap: 80000, lastApAddTime: 0, index: 0 }], level: 3, speed: 1.15, complete: 0, capacity: 96, weight: 24, formulaId: 4, remain: 99, completeWorkTime: 0, lastUpdateTime: NOW - 3600 },
        { slotId: '4', chars: [], level: 2, speed: 1, complete: 0, capacity: 60, weight: 10, formulaId: 3, remain: 99, completeWorkTime: 0, lastUpdateTime: NOW - 1200 }
      ],
      tradings: [
        { slotId: '5', chars: [], level: 3, stock: [{ delivery: [], gain: [], instId: 1, type: 'O_GOLD' }, { delivery: [], gain: [], instId: 2, type: 'O_GOLD' }], stockLimit: 6, strategy: 'O_GOLD', completeWorkTime: 0, lastUpdateTime: NOW }
      ],
      dormitories: [
        { slotId: '6', chars: [{ charId: 'char_003_kalts', ap: 86400, lastApAddTime: 0, index: 0 }], level: 5, comfort: 5000 }
      ],
      hire: { slotId: '7', chars: [], level: 3, state: 1, refreshCount: 2, completeWorkTime: 0 },
      training: { slotId: '8', level: 3, trainee: { charId: 'char_010_chen', ap: 5000, targetSkill: 3 }, trainer: { charId: 'char_002_amiya', ap: 30000 }, remainPoint: 20000, speed: 1, lastUpdateTime: NOW, remainSecs: 3600 },
      meeting: { slotId: '9', chars: [], level: 3, clue: { board: ['RHINE', 'PENGUIN', 'URSUS'], own: 6, received: 1, dailyReward: false, needReceive: 0, shareCompleteTime: 0, sharing: true }, lastUpdateTime: NOW, completeWorkTime: 0 }
    },
    campaign: { reward: { current: 1, total: 2 } },
    tower: { reward: { higherItem: { current: 2, total: 4 }, lowerItem: { current: 1, total: 4 } } },
    routine: { daily: { current: 2, total: 3 }, weekly: { current: 4, total: 6 } },
    chars: [
      { charId: 'char_002_amiya', skinId: 'char_002_amiya#1', level: 60, evolvePhase: 2 },
      { charId: 'char_010_chen', skinId: 'char_010_chen#1', level: 90, evolvePhase: 2 },
      { charId: 'char_003_kalts', skinId: 'char_003_kalts#1', level: 40, evolvePhase: 1 }
    ]
  }
  const state = {
    accounts: [{
      id: 'acc-1', uid: '135297507', nickName: '刀客塔', channelMasterId: 1, channelName: '官服',
      skland: { cred: '', token: '', obtainedAt: 0 },
      lastSync: { time: Date.now() - 7200000, status: 'success', operatorCount: 214 }
    }],
    activeAccountId: 'acc-1',
    settings: {
      backendBaseUrl: 'https://backend.yituliu.cn', autoSyncEnabled: false, autoSyncIntervalHours: 24,
      yituliuTokens: { writeToken: 'mock-write-token'.padEnd(32, 'x') },
      infoRefreshEnabled: true, infoRefreshIntervalMinutes: 30, refreshAllAccounts: false,
      recruitNotifyEnabled: true, sanityNotifyEnabled: false
    }
  }
  const localData = {
    'yituliu-plugin-state': state,
    'yituliu-plugin-info-cache': { 'acc-1': { data: info, fetchedAt: Date.now() - 300000 } }
  }
  const listeners = []
  window.chrome = {
    storage: {
      local: {
        get(callback) { setTimeout(() => callback({ ...localData }), 0) },
        set(items, callback) {
          Object.assign(localData, items)
          const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]))
          setTimeout(() => listeners.forEach(l => l(changes, 'local')), 0)
          if (callback) setTimeout(callback, 0)
        }
      },
      onChanged: {
        addListener(l) { listeners.push(l) },
        removeListener(l) { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1) }
      }
    },
    runtime: {
      getURL(path) { return path },
      sendMessage(_msg, callback) { setTimeout(() => callback && callback({ ok: true }), 200) }
    },
    tabs: { create() {} }
  }
})()
