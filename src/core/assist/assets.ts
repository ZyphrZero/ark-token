/**
 * 助战检索静态资源 URL 构造（干员头像/技能/模组图标与官方 support 页一致）。
 *
 * 干员资产图来自 `web.hycdn.cn/arknights/game/assets/`（按 id 拼路径）；
 * 职业/潜能/精英化等小图标来自 `bbs.hycdn.cn/public/skland-web/image/tool/arknights/assets/`
 * （哈希命名，映射表提取自官方 support 页模块 95892，2026-09-05 验证可访问）。
 */

const CDN = 'https://web.hycdn.cn/arknights/game/assets'
const TOOL_ASSETS = 'https://bbs.hycdn.cn/public/skland-web/image/tool/arknights/assets'

export function assistAvatarUrl(id?: string): string | undefined {
  return id ? `${CDN}/avatar/${encodeURIComponent(id)}.png` : undefined
}

export function assistCharacterUrl(charId: string, skinId?: string): string | undefined {
  if (skinId) {
    return `${CDN}/char_skin/avatar/${encodeURIComponent(skinId)}.png`
  }
  // 无皮肤时用干员头像（char/avatar/xxx.png）；官方的 char/portrait/xxx.png 为竖版立绘，非方块头像
  return charId ? `${CDN}/char/avatar/${encodeURIComponent(charId)}.png` : undefined
}

export function assistSkillUrl(skillId?: string): string | undefined {
  return skillId ? `${CDN}/char_skill/${encodeURIComponent(skillId)}.png` : undefined
}

export function assistEquipUrl(typeName?: string): string | undefined {
  return typeName ? `${CDN}/uniequip/type/${encodeURIComponent(typeName)}.png` : undefined
}

const PROFESSION_ICON_HASH: Record<string, { black: string; white: string }> = {
  WARRIOR: { black: '2eb4e3031419f34c5a10e544c6a2c469', white: '44365f80721b5329acbea12317fabc58' },
  SNIPER: { black: 'a42eae8808988a8368f34405e7df430c', white: 'b447e879946fdc46856f401a3cc3e59d' },
  TANK: { black: '7ba6cb355b786d0362ecdb653551ae5c', white: '874f518df1d899652a36ff96aed0d060' },
  MEDIC: { black: '2fbe3d9e0bacba5dff97bad2f96543e4', white: '13b396e3188727150b2deb74295105af' },
  CASTER: { black: '9326b73ff60c773c9527cce4ee9f2476', white: '8733c5136cef8d2389d8691a14ac3d4c' },
  SUPPORT: { black: '6c4b818d2fb664ec1df2399ce8a41cba', white: '4c9ca645b4b8df8c0131e6cec9302823' },
  PIONEER: { black: 'c63cab6eb50c7cda91d3e6529c4c9541', white: '64a298865b30ccfc5db4199b829f3f26' },
  SPECIAL: { black: '2914ff86bc7879eaea11cf73bad0eb35', white: '108b5805a28fc99080507a221c434284' }
}

const POTENTIAL_ICON_HASH: Record<number, string> = {
  0: '3a516f10fbc11c3dbd808b943717ba1f',
  1: '3ec9584d887388c490ab022f0dd3de43',
  2: '95016edaa1d93f567b4da8a3e609528d',
  3: '888a8f89168d13310cb56fa79882fcf0',
  4: 'de99f0278a427515b7aee627c05b95d7',
  5: 'c2dbd41729af9873d2c347381b85d99f'
}

const EVOLVE_PHASE_ICON_HASH: Record<number, string> = {
  0: '716addae4abe12b642d95b83ceb9d31f',
  1: '8538dc58946f34eec86d65663817138a',
  2: 'c488c2f2cdb4cea700d4978c9e8f1e98'
}

/** 职业图标（black/white 两色，官方头像角标用白色） */
export function assistProfessionIconUrl(profession: string, color: 'black' | 'white' = 'white'): string | undefined {
  const hash = PROFESSION_ICON_HASH[profession]?.[color]
  return hash ? `${TOOL_ASSETS}/profession/${color}/${hash}.png` : undefined
}

/** 潜能等级图标，入参为接口 0-based potentialRank */
export function assistPotentialIconUrl(potentialRank: number): string | undefined {
  const hash = POTENTIAL_ICON_HASH[potentialRank]
  return hash ? `${TOOL_ASSETS}/potential/${hash}.png` : undefined
}

/** 精英化阶段图标（E0/E1/E2） */
export function assistEvolvePhaseIconUrl(evolvePhase: number): string | undefined {
  const hash = EVOLVE_PHASE_ICON_HASH[evolvePhase]
  return hash ? `${TOOL_ASSETS}/evolve-phase/${hash}.png` : undefined
}
