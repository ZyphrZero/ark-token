import detailDataJson from '../assets/operator-details.json'

export interface DetailBlackboardEntry {
  key: string
  value: number
  valueStr?: string
}

export interface DetailCandidate {
  name: string
  description: string
  phase: number
  potential: number
  rangeId?: string
  blackboard: DetailBlackboardEntry[]
}

export interface DetailSkillLevel {
  name: string
  description: string
  rangeId?: string
  skillType: string
  durationType: string
  duration: number
  spType: string | number
  spCost: number
  initSp: number
  maxChargeTime: number
  blackboard: DetailBlackboardEntry[]
}

export interface DetailSkill {
  id: string
  levels: DetailSkillLevel[]
}

export interface DetailModulePhase {
  level: number
  attributes: DetailBlackboardEntry[]
  effects: DetailCandidate[]
}

export interface DetailModule {
  name: string
  type?: string
  icon?: string
  phases: DetailModulePhase[]
}

export interface OperatorDetail {
  description: string
  appellation: string
  position: string
  subProfessionId: string
  tags: string[]
  phases: { rangeId?: string; maxLevel: number }[]
  trait: DetailCandidate[]
  talents: DetailCandidate[][]
  potentialEffects: string[]
  skillIds: string[]
  equipIds: string[]
}

interface OperatorDetailData {
  operators: Record<string, OperatorDetail>
  skills: Record<string, DetailSkill>
  equips: Record<string, DetailModule>
  ranges: Record<string, { row: number; col: number }[]>
}

const detailData = detailDataJson as unknown as OperatorDetailData

export function operatorDetailOf(charId: string): OperatorDetail | undefined {
  return detailData.operators[charId]
}

export function operatorSkillDetailOf(skillId: string): DetailSkill | undefined {
  return detailData.skills[skillId]
}

export function operatorModuleDetailOf(equipId: string): DetailModule | undefined {
  return detailData.equips[equipId]
}

export function operatorRangeOf(rangeId: string | undefined): { row: number; col: number }[] | undefined {
  return rangeId ? detailData.ranges[rangeId] : undefined
}

/** 森空岛 mainSkillLvl 为技能 1-7 级；专精一至三对应游戏表第 8-10 档。 */
export function skillLevelIndex(mainSkillLvl: number | undefined, specializeLevel: number | undefined): number {
  const mastery = specializeLevel ?? 0
  if (mastery > 0) {
    return Math.min(9, 6 + mastery)
  }
  return Math.max(0, Math.min(6, (mainSkillLvl ?? 1) - 1))
}

export function skillLevelText(mainSkillLvl: number | undefined, specializeLevel: number | undefined): string {
  const mastery = specializeLevel ?? 0
  return mastery > 0 ? `专精 ${mastery}` : `技能 ${mainSkillLvl ?? 1}`
}

/** 取当前精英阶段和潜能已经解锁的最后一档天赋/特性候选。 */
export function currentDetailCandidate(
  candidates: readonly DetailCandidate[],
  evolvePhase: number | undefined,
  potentialRank: number | undefined
): DetailCandidate | undefined {
  const phase = evolvePhase ?? 0
  const potential = potentialRank ?? 0
  return candidates
    .filter(candidate => candidate.phase <= phase && candidate.potential <= potential)
    .sort((left, right) => left.phase - right.phase || left.potential - right.potential)
    .at(-1)
}

function formatDescriptionValue(entry: DetailBlackboardEntry, format: string | undefined): string {
  if (entry.valueStr) {
    return entry.valueStr
  }
  if (format?.endsWith('%')) {
    const fractionDigits = (format.split('.')[1]?.replace('%', '').length ?? 0)
    return `${(entry.value * 100).toFixed(fractionDigits).replace(/\.0+$/, '')}%`
  }
  return String(entry.value)
}

/** 将游戏描述中的 `{blackboardKey}` 占位符替换为当前等级数值，并剥离富文本标签。 */
export function formatDetailDescription(text: string, blackboard: readonly DetailBlackboardEntry[]): string {
  const values = new Map(blackboard.map(entry => [entry.key.toLocaleLowerCase(), entry]))
  return text
    .replace(/\{([^}:]+)(?::([^}]+))?\}/g, (source, key: string, format: string | undefined) => {
      const entry = values.get(key.toLocaleLowerCase())
      return entry ? formatDescriptionValue(entry, format) : source
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\\n/g, '\n')
}

export function attributeName(key: string): string {
  const names: Record<string, string> = {
    max_hp: '生命上限',
    atk: '攻击力',
    def: '防御力',
    magic_resistance: '法术抗性',
    attack_speed: '攻击速度',
    respawn_time: '再部署时间',
    cost: '部署费用',
    block_cnt: '阻挡数'
  }
  return names[key.toLocaleLowerCase()] ?? key
}
