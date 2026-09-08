import operatorDataJson from '../assets/operator-data.json'

/** 基建技能档位（生成口径见 scripts/build-operator-data.mjs） */
export interface BuildingSkillTier {
  /** 槽位序号（0 起；与 arkntools char[].[] 顺序一致） */
  slot: number
  /** 基建技能 id（arkntools，如 power_rec_spd_020） */
  id: string
  /** 解锁所需精英阶段 */
  phase: number
  /** 解锁所需该阶段等级 */
  level: number
  /** 技能中文名 */
  name: string
  /** 无人机充能加成百分点（无条件部分；非充能技能为 0） */
  percent: number
  /** 技能图标（构建产物内路径） */
  icon?: string
  /** per10Drone：每 10 架无人机上限 +1%（percent 为上限）；ramp：percent 为爬升终值 */
  scale?: 'per10Drone' | 'ramp'
  /** 依赖其他干员进驻位置的附加加成，运行时不计入 */
  extra?: { percent: number; max?: number; requires: string }
}

/** 基建技能详情（按技能 id 去重索引；同一技能可被多名干员共用） */
export interface BuffEntry {
  id: string
  /** 技能中文名 */
  name: string
  /**
   * 技能描述**富文本原文**，含上游着色标签：
   * `<@cc.vup>` 提升值、`<@cc.vdown>` 下降值、`<@cc.kw>` 关键词、`<@cc.rem>` 强调，
   * `<$cc.*>` 为术语包装（无颜色，仅包住内容），统一以 `</>` 闭合。
   * 纯文本用 `stripBuffTags()`，渲染用 popup 层的 BuffDescription。
   */
  descriptionRich: string
  /** 无人机充能加成百分点（无条件部分；非充能技能为 0） */
  percent: number
  /** 技能图标裸文件名（含扩展名，与 buildingSkills[].icon 同口径） */
  icon?: string
  scale?: 'per10Drone' | 'ramp'
  extra?: { percent: number; max?: number; requires: string }
}

/**
 * arkntools 职业数字编码（与中文名对应，实测交叉验证：陈=1 近卫、雷蛇=3 重装、
 * 凯尔希=4 医疗、空=5 辅助、阿米娅=6 术师）。
 * 注意**不是**助战检索的工作站字符串枚举（PIONEER/WARRIOR/...），换成图标 URL 时
 * 用 professionKey()。
 */
export const PROFESSION_LABELS: Record<number, string> = {
  1: '近卫',
  2: '狙击',
  3: '重装',
  4: '医疗',
  5: '辅助',
  6: '术师',
  7: '特种',
  8: '先锋'
}

/** 数字职业 → 助战检索工作站的字符串枚举（css/hash 图标用） */
export const PROFESSION_KEYS: Record<number, 'WARRIOR' | 'SNIPER' | 'TANK' | 'MEDIC' | 'SUPPORT' | 'CASTER' | 'SPECIAL' | 'PIONEER'> = {
  1: 'WARRIOR',
  2: 'SNIPER',
  3: 'TANK',
  4: 'MEDIC',
  5: 'SUPPORT',
  6: 'CASTER',
  7: 'SPECIAL',
  8: 'PIONEER'
}

/** 职业中文名；未知数字返回 '未知' */
export function professionName(profession: number): string {
  return PROFESSION_LABELS[profession] ?? '未知'
}

/** 数字职业 → 工作站枚举（图标 URL 用）；未知数字返回 undefined */
export function professionKey(profession: number): string | undefined {
  return PROFESSION_KEYS[profession]
}

/** 单个干员条目 */
export interface OperatorEntry {
  charId: string
  /** 中文名 */
  name: string
  /** 星级（1-6） */
  rarity: number
  /** 职业数字编码（见 PROFESSION_LABELS，1=近卫/2=狙击/.../8=先锋） */
  profession: number
  position: number
  /** 模组映射 uniEquipId → typeName2（X/Y/D/A/B） */
  equips?: Record<string, string>
  /** 各槽位战斗技能名（顺序与森空岛 chars[].skills[] 一致，训练室用） */
  skills?: string[]
  /** 基建技能（可含多槽与同槽 α/β 升级链，见 BuildingSkillTier） */
  buildingSkills: BuildingSkillTier[]
}

/** 全量干员/基建数据（构建产物，生成脚本 scripts/build-operator-data.mjs） */
export interface OperatorData {
  operators: Record<string, OperatorEntry>
  /** 技能独立索引：id → 技能详情（描述为富文本原文，见 BuffEntry） */
  buffs: Record<string, BuffEntry>
  /** 房间：POWER 等 → { name, electricity? }（electricity 来自游戏数据 building_data.json） */
  rooms: Record<string, { name: string; electricity?: number[] }>
}

export const operatorData = operatorDataJson as OperatorData

/** 干员中文名；表未收录（源表过期）时返回 charId */
export function operatorName(charId: string): string {
  return operatorData.operators[charId]?.name ?? charId
}

/** 干员星级；表未收录时返回 null（调用方跳过来保证上传报文正确） */
export function operatorRarity(charId: string): number | null {
  return operatorData.operators[charId]?.rarity ?? null
}

/** 干员的基建技能档位（按解锁条件升序）；表未收录或无基建技能时为空数组 */
export function buildingSkillsOf(charId: string): BuildingSkillTier[] {
  const tiers = operatorData.operators[charId]?.buildingSkills ?? []
  return [...tiers].sort((a, b) => a.phase - b.phase || a.level - b.level)
}

/** 技能详情（名称/富文本描述/图标）；未收录返回 undefined */
export function buffOf(id: string): BuffEntry | undefined {
  return operatorData.buffs[id]
}

/** 干员练度（取自 player/info 快照的 chars[]） */
export interface OperatorProgress {
  evolvePhase: number
  level: number
}

/**
 * 该基建技能档位是否已解锁：精英阶段更高即满足，同阶段则比等级。
 * 与 powerPlantSkillPercent 的取档判据一致（见 status/building.ts）。
 */
export function isBuildingSkillUnlocked(tier: BuildingSkillTier, progress: OperatorProgress | undefined): boolean {
  if (!progress) {
    return false
  }
  return (
    progress.evolvePhase > tier.phase ||
    (progress.evolvePhase === tier.phase && progress.level >= tier.level)
  )
}

/**
 * 解锁条件文案（与游戏内一致）。实测档位只有 4 种（见 docs/BUILDING_MOOD_API.md 第十一节）：
 * `0_1` → 初始解锁、`0_30` → 等级 30 解锁、`1_1`/`2_1` → 精英 N 解锁。
 */
export function buildingSkillUnlockText(tier: BuildingSkillTier): string {
  if (tier.phase > 0) {
    return `精英 ${tier.phase} 解锁`
  }
  return tier.level > 1 ? `等级 ${tier.level} 解锁` : '初始解锁'
}

/** 剥掉富文本着色标签，得到纯文本（title 属性、无障碍文本用） */
export function stripBuffTags(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}
