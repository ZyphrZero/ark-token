// 面板视觉验证用 chrome API mock：注入到构建后的 popup 页面（仅本地预览，不含真实凭据）
(function () {
  const NOW = Math.floor(Date.now() / 1000)
  const info = {
    currentTs: NOW,
    status: {
      uid: '135297507', name: '阿米娅', level: 120,
      avatar: { type: 'ICON', id: '1', url: '' },
      ap: { current: 82, max: 135, lastApAddTime: NOW - 120, completeRecoveryTime: NOW + 5 * 3600 },
      charCnt: 23
    },
    recruit: [
      { startTs: NOW - 3600, finishTs: NOW + 900, state: 2 },
      { startTs: NOW - 7200, finishTs: NOW + 5400, state: 2 },
      { startTs: 0, finishTs: 0, state: 1 },
      { startTs: 0, finishTs: 0, state: 3 }
    ],
    building: {
      labor: { value: 87, maxValue: 200, remainSecs: 0, lastUpdateTime: NOW - 720 },
      // 基建布局镜像真实抓包（skland_dump/building_api/player-info-slot-sample.json，2026-09-08）：
      // slotId 为全局槽位号 slot_N，且数组顺序不按升序（powers=[26,16,15]），可测试编号排序逻辑
      // ap 单位 0.01 秒、满值 8_640_000（24 点心情，1 点 = 360_000），与真实接口一致
      control: { slotId: 'slot_34', chars: [{ charId: 'char_002_amiya', ap: 7_920_000, lastApAddTime: NOW, index: 0 }], level: 5 },
      powers: [
        { slotId: 'slot_26', chars: [{ charId: 'char_010_chen', ap: 5_040_000, lastApAddTime: NOW - 3600, index: 0 }], level: 3 },
        { slotId: 'slot_16', chars: [], level: 3 },
        { slotId: 'slot_15', chars: [], level: 3 }
      ],
      manufactures: [
        { slotId: 'slot_25', chars: [{ charId: 'char_010_chen', ap: 6_480_000, lastApAddTime: NOW - 3600, index: 0 }], level: 3, speed: 1.15, complete: 0, capacity: 96, weight: 24, formulaId: 4, remain: 99, completeWorkTime: 0, lastUpdateTime: NOW - 3600 },
        { slotId: 'slot_14', chars: [], level: 3, speed: 1, complete: 0, capacity: 54, weight: 0, formulaId: 3, remain: 99, completeWorkTime: 0, lastUpdateTime: NOW - 1200 },
        { slotId: 'slot_7', chars: [], level: 3, speed: 1, complete: 0, capacity: 54, weight: 10, formulaId: 1, remain: 99, completeWorkTime: 0, lastUpdateTime: NOW - 60 }
      ],
      tradings: [
        { slotId: 'slot_24', chars: [{ charId: 'char_003_kalts', ap: 300_000, lastApAddTime: NOW - 3600, index: 0 }], level: 3, stock: [{ delivery: [], gain: [], instId: 1, type: 'O_GOLD' }, { delivery: [], gain: [], instId: 2, type: 'O_GOLD' }], stockLimit: 10, strategy: 'O_GOLD', completeWorkTime: 0, lastUpdateTime: NOW },
        { slotId: 'slot_5', chars: [], level: 3, stock: [], stockLimit: 6, strategy: 'O_GOLD', completeWorkTime: 0, lastUpdateTime: NOW },
        { slotId: 'slot_6', chars: [], level: 3, stock: [], stockLimit: 6, strategy: 'O_DIAMOND', completeWorkTime: 0, lastUpdateTime: NOW }
      ],
      dormitories: [
        { slotId: 'slot_28', chars: [{ charId: 'char_003_kalts', ap: 4_320_000, lastApAddTime: NOW - 3600, index: 0 }], level: 5, comfort: 5000 },
        { slotId: 'slot_20', chars: [], level: 5, comfort: 5000 },
        { slotId: 'slot_9', chars: [], level: 1, comfort: 2000 },
        { slotId: 'slot_3', chars: [], level: 1, comfort: 2000 }
      ],
      hire: { slotId: 'slot_23', chars: [], level: 3, state: 1, refreshCount: 2, completeWorkTime: 0 },
      training: { slotId: 'slot_13', level: 3, trainee: { charId: 'char_010_chen', ap: 5_040_000, lastApAddTime: NOW, targetSkill: 3 }, trainer: { charId: 'char_002_amiya', ap: 8_000_000, lastApAddTime: NOW - 3600 }, remainPoint: 20000, speed: 1, lastUpdateTime: NOW, remainSecs: 3600 },
      meeting: { slotId: 'slot_36', chars: [], level: 3, clue: { board: ['RHINE', 'PENGUIN', 'URSUS'], own: 6, received: 1, dailyReward: false, needReceive: 0, shareCompleteTime: 0, sharing: true }, lastUpdateTime: NOW, completeWorkTime: 0 },
      tiredChars: []
    },
    campaign: { reward: { current: 1, total: 2 } },
    tower: { reward: { higherItem: { current: 2, total: 4 }, lowerItem: { current: 1, total: 4 } } },
    routine: { daily: { current: 2, total: 3 }, weekly: { current: 4, total: 6 } },
    chars: [
      { charId: 'char_002_amiya', skinId: 'char_002_amiya#1', level: 60, evolvePhase: 2 },
      { charId: 'char_010_chen', skinId: 'char_010_chen#1', level: 90, evolvePhase: 2, skills: [{ id: 'skchr_chen_1', specializeLevel: 3 }, { id: 'skchr_chen_2', specializeLevel: 2 }, { id: 'skchr_chen_3', specializeLevel: 1 }] },
      { charId: 'char_003_kalts', skinId: 'char_003_kalts#1', level: 40, evolvePhase: 1 },
      // 以下练度均为界面预览用假数据，不代表真实账号。
      ...[
        ['char_103_angel', 2, 90], ['char_172_svrash', 2, 90], ['char_180_amgoat', 2, 90],
        ['char_293_thorns', 2, 80], ['char_264_f12yin', 2, 60], ['char_017_huang', 2, 80],
        ['char_4064_mlynar', 2, 90], ['char_202_demkni', 2, 90], ['char_311_mudrok', 2, 70],
        ['char_2023_ling', 2, 60], ['char_1028_texas2', 2, 90], ['char_1012_skadi2', 2, 60],
        ['char_358_lisa', 2, 60], ['char_128_plosis', 1, 70], ['char_151_myrtle', 2, 40],
        ['char_123_fang', 1, 55], ['char_285_medic2', 0, 30], ['char_237_gravel', 1, 60],
        ['char_124_kroos', 1, 55], ['char_179_cgbird', 2, 60]
      ].map(([charId, evolvePhase, level]) => ({ charId, skinId: '', evolvePhase, level }))
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
