import type { AssistCharacter, AssistInfo, AssistSearchRequest } from '../sklandAssist'

/**
 * 助战检索筛选规则（纯函数，无网络/React 依赖，可直接复用）。
 *
 * 全部规则与官方 support 页逆向结果一致，来源与推导见 `docs/ANALYSIS.md`：
 * - 干员排序：isNew 置顶 → 稀有度降序 → 职业顺序 → id 升序（官方 getGameSupportInfo + 插件产品化 isNew 置顶）
 * - 默认筛选（官方 select()）：最高精英化 + 等级不限、第一个技能 + 需求不限、证章 + 0
 * - 精英化级联（官方 setFilter()）：等级重置不限；技能位截断与需求降档；非精二移除模组
 * - 选项档位：技能需求 E0→[0]、E1→[0,1]、E2→[0,1,2,3,4]；模组等级 证章→[0]、真实模组→[1,2,3]
 */

export const PROFESSION_NAMES: Record<string, string> = {
  WARRIOR: '近卫',
  SNIPER: '狙击',
  TANK: '重装',
  MEDIC: '医疗',
  CASTER: '术师',
  SUPPORT: '辅助',
  PIONEER: '先锋',
  SPECIAL: '特种'
}

/** 职业排列顺序（与官方 support 页一致） */
export const PROFESSION_ORDER = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL']

/** 职业排序比较器：按官方顺序数组索引比较，未知职业排最后（同官方 eP） */
export function compareProfession(a: string, b: string): number {
  const indexA = PROFESSION_ORDER.indexOf(a)
  const indexB = PROFESSION_ORDER.indexOf(b)
  if (indexA === -1) {
    return 1
  }
  if (indexB === -1) {
    return -1
  }
  return indexA - indexB
}

/**
 * 精二「≥N级」门槛，官方 support 页按星级硬编码（键为接口 0-based rarity）。
 * 仅 4~6 星干员拥有该选项，且要求已选精二、干员有模组。
 */
export const E2_MIN_LEVEL_BY_RARITY: Record<number, number> = { 3: 40, 4: 50, 5: 60 }

/** 技能需求选项，value 即 search 请求中 skill.level 的取值（与官方 support 页一致） */
export const SKILL_LEVEL_OPTIONS = [
  { value: 0, label: '不限' },
  { value: 1, label: 'RANK 7' },
  { value: 2, label: '专精 1' },
  { value: 3, label: '专精 2' },
  { value: 4, label: '专精 3' }
]

/** 模组选项中"证章"的哨兵值（官方请求里证章 id 为空串，构造请求时映射回去） */
export const EQUIP_BADGE_ID = '__badge__'

/** 名称模糊匹配：大小写不敏感地匹配干员名或内部 id */
export function matchesNameQuery(character: AssistCharacter, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return character.name.toLowerCase().includes(normalized)
    || character.id.toLowerCase().includes(normalized)
}

/** 干员排序：新干员置顶（插件产品化）→ 稀有度降序 → 官方职业顺序 → id 升序 */
export function compareAssistCharacters(a: AssistCharacter, b: AssistCharacter): number {
  return Number(b.isNew ?? false) - Number(a.isNew ?? false)
    || b.rarity - a.rarity
    || compareProfession(a.profession, b.profession)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export interface AssistCharacterCriteria {
  /** 职业筛选（空/undefined = 不限） */
  profession?: string
  /** 稀有度筛选，0-based（undefined = 不限） */
  rarity?: number
  /** 名称模糊搜索（空/undefined = 不筛） */
  nameQuery?: string
}

/** 按条件筛选干员并按官方排序返回（新干员置顶） */
export function filterAssistCharacters(characters: AssistCharacter[], criteria: AssistCharacterCriteria = {}): AssistCharacter[] {
  return characters
    .filter(character =>
      (!criteria.profession || character.profession === criteria.profession)
      && (criteria.rarity === undefined || character.rarity === criteria.rarity)
      && matchesNameQuery(character, criteria.nameQuery ?? ''))
    .sort(compareAssistCharacters)
}

/** 精英化阶段选项：取 levelMax 中该稀有度可用的阶段（无"不限"，必选） */
export function getEvolvePhaseOptions(
  info: AssistInfo | null | undefined,
  character: AssistCharacter | undefined
): { phase: number; maxLevel: number }[] {
  if (!info || !character) {
    return []
  }
  return info.levelMax
    .filter(item => item.rarity === character.rarity)
    .map(item => ({ phase: item.evolvePhase, maxLevel: item.maxLevel }))
}

export interface LevelRequirementChoices {
  /** 所选精英化的满级等级（等级需求模式 1 的取值）；0 = 未知 */
  maxLevel: number
  /** 精二「≥N级」门槛（模式 2）；null = 当前不可用（非精二、无模组或 1~3 星） */
  e2MinLevel: number | null
}

/** 等级需求选项（模式 0=不限 恒可用；1=满级、2=≥N 按条件出现，同官方 targetList [0,2,1]） */
export function getLevelRequirementOptions(
  info: AssistInfo | null | undefined,
  character: AssistCharacter | undefined,
  evolvePhase: number
): LevelRequirementChoices {
  const maxLevel = getEvolvePhaseOptions(info, character).find(item => item.phase === evolvePhase)?.maxLevel ?? 0
  const e2MinLevel = evolvePhase === 2 && character && character.equips.length > 0
    ? E2_MIN_LEVEL_BY_RARITY[character.rarity] ?? null
    : null
  return { maxLevel, e2MinLevel }
}

/** 技能需求档位上限随精英化：E0→仅不限、E1→RANK 7、E2→专精 3（官方技能抽屉 targetList 规则） */
export function maxSkillLevelForPhase(evolvePhase: number): number {
  return evolvePhase >= 2 ? 4 : evolvePhase === 1 ? 1 : 0
}

/** 技能需求选项：档位随精英化收窄 */
export function getSkillRequirementOptions(evolvePhase: number): { value: number; label: string }[] {
  const max = maxSkillLevelForPhase(evolvePhase)
  return SKILL_LEVEL_OPTIONS.filter(option => option.value <= max)
}

/** 技能位选项：按精英化截断（E0→仅第 1 个、E1→前 2 个、E2→全部），无"不限" */
export function getSkillSlotOptions(character: AssistCharacter | undefined, evolvePhase: number): AssistCharacter['skills'] {
  return (character?.skills ?? []).slice(0, evolvePhase + 1)
}

/** 干员模组选项：官方在有模组的干员头部注入"证章"，作为默认的不筛模组项 */
export function getEquipOptions(character?: AssistCharacter): { id: string; name?: string }[] {
  if (!character || character.equips.length === 0) {
    return []
  }
  return [{ id: EQUIP_BADGE_ID, name: '证章' }, ...character.equips]
}

/** 模组等级选项：证章 → 仅[不限]；真实模组 → [1,2,3]（无"不限"） */
export function getEquipLevelOptions(equipId: string): { value: number; label: string }[] {
  return equipId === EQUIP_BADGE_ID
    ? [{ value: 0, label: '不限' }]
    : [1, 2, 3].map(value => ({ value, label: `等级 ${value}` }))
}

/** 完整的检索筛选状态（数值形态；表单层自行做 string 转换） */
export interface AssistFilter {
  charId: string
  /** 精英化阶段，必选 */
  evolvePhase: number
  /** 等级需求模式：0=不限、1=所选精英化满级、2=精二 ≥N 级 */
  level: number
  skillId: string
  skillLevel: number
  /** 模组 id；EQUIP_BADGE_ID = 证章；'' = 无模组筛选（非精二或干员无模组） */
  equipId: string
  equipLevel: number
}

/** 构建选中干员后的默认筛选（官方 select() 语义：最高精英化 + 不限、第一个技能 + 不限、证章 + 0） */
export function createDefaultFilter(
  info: AssistInfo | null | undefined,
  character: AssistCharacter | undefined
): AssistFilter {
  const phases = getEvolvePhaseOptions(info, character)
  const highestPhase = phases.length > 0 ? phases[phases.length - 1].phase : 0
  const defaultEquip = getEquipOptions(character)[0]
  return {
    charId: character?.id ?? '',
    evolvePhase: highestPhase,
    level: 0,
    skillId: character?.skills[0]?.id ?? '',
    skillLevel: 0,
    equipId: defaultEquip?.id ?? '',
    equipLevel: defaultEquip ? (defaultEquip.id === EQUIP_BADGE_ID ? 0 : 1) : 0
  }
}

/**
 * 切换精英化并应用官方 setFilter 级联：
 * - 等级需求重置为不限；
 * - 技能位超出阶段允许数（E0→1 个、E1→前 2 个、E2→全部）时重置为第一个技能并降回不限；
 * - 技能需求超出阶段档位时降回不限；
 * - 非精二移除模组筛选；精二且无选择时恢复默认证章。
 */
export function applyEvolvePhaseChange(
  filter: AssistFilter,
  info: AssistInfo | null | undefined,
  character: AssistCharacter | undefined,
  phase: number
): AssistFilter {
  const skills = character?.skills ?? []
  const allowedSkillCount = phase + 1
  let skillId = filter.skillId
  let skillLevel = filter.skillLevel
  if (skills.length > 0 && skillId) {
    const skillIndex = skills.findIndex(skill => skill.id === skillId)
    if (skillIndex === -1 || skillIndex >= allowedSkillCount) {
      skillId = skills[0]?.id ?? ''
      skillLevel = 0
    } else if (skillLevel > maxSkillLevelForPhase(phase)) {
      skillLevel = 0
    }
  }
  let equipId = filter.equipId
  let equipLevel = filter.equipLevel
  if (phase !== 2) {
    equipId = ''
    equipLevel = 0
  } else if (!equipId && getEquipOptions(character).length > 0) {
    equipId = EQUIP_BADGE_ID
    equipLevel = 0
  }
  return { ...filter, evolvePhase: phase, level: 0, skillId, skillLevel, equipId, equipLevel }
}

/** 组装检索请求（证章哨兵映射回官方空串 id；无模组时同样发空串 = 不筛模组） */
export function buildAssistSearchRequest(filter: AssistFilter, uid: string): AssistSearchRequest {
  return {
    uid,
    charId: filter.charId,
    level: { evolvePhase: filter.evolvePhase, level: filter.level },
    skill: { id: filter.skillId, level: filter.skillLevel },
    equip: { id: filter.equipId === EQUIP_BADGE_ID ? '' : filter.equipId, level: filter.equipLevel }
  }
}
