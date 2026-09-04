import { describe, expect, it } from 'vitest'

import {
  applyEvolvePhaseChange,
  buildAssistSearchRequest,
  createDefaultFilter,
  filterAssistCharacters,
  getEquipLevelOptions,
  getEquipOptions,
  getEvolvePhaseOptions,
  getLevelRequirementOptions,
  getSkillRequirementOptions,
  getSkillSlotOptions,
  matchesNameQuery,
  EQUIP_BADGE_ID
} from './filter'
import type { AssistCharacter, AssistInfo } from '../sklandAssist'

const LEVEL_MAX: AssistInfo['levelMax'] = [
  { evolvePhase: 0, rarity: 5, maxLevel: 50 },
  { evolvePhase: 1, rarity: 5, maxLevel: 80 },
  { evolvePhase: 2, rarity: 5, maxLevel: 90 },
  { evolvePhase: 0, rarity: 2, maxLevel: 40 },
  { evolvePhase: 1, rarity: 2, maxLevel: 55 }
]

const INFO: AssistInfo = { characters: [], levelMax: LEVEL_MAX }

function makeCharacter(overrides: Partial<AssistCharacter> & { id: string }): AssistCharacter {
  return {
    name: overrides.id,
    rarity: 5,
    profession: 'CASTER',
    skills: [
      { id: `${overrides.id}_s1`, name: '技能一' },
      { id: `${overrides.id}_s2`, name: '技能二' }
    ],
    equips: [{ id: `${overrides.id}_e1`, name: '模组一' }],
    ...overrides
  }
}

const SIX_STAR = makeCharacter({ id: 'char_100_alpha' })
const NEW_SIX_STAR = makeCharacter({ id: 'char_900_omega', isNew: true })
const THREE_STAR = makeCharacter({ id: 'char_200_beta', rarity: 2, profession: 'PIONEER', equips: [] })
const PLAIN = makeCharacter({ id: 'char_300_gamma', skills: [], equips: [] })

describe('filterAssistCharacters', () => {
  it('新干员置顶，其余按稀有度降序 → 职业顺序 → id 升序', () => {
    const pioneer = makeCharacter({ id: 'char_150_delta', profession: 'PIONEER' })
    const sorted = filterAssistCharacters([SIX_STAR, THREE_STAR, NEW_SIX_STAR, pioneer])
    expect(sorted.map(character => character.id)).toEqual(['char_900_omega', 'char_150_delta', 'char_100_alpha', 'char_200_beta'])
  })

  it('按职业、稀有度与名称模糊过滤', () => {
    const sorted = filterAssistCharacters(
      [SIX_STAR, THREE_STAR, NEW_SIX_STAR],
      { profession: 'CASTER', rarity: 5, nameQuery: 'alpha' }
    )
    expect(sorted.map(character => character.id)).toEqual(['char_100_alpha'])
    expect(matchesNameQuery(NEW_SIX_STAR, '  OMEGA ')).toBe(true)
    expect(matchesNameQuery(NEW_SIX_STAR, 'char_900')).toBe(true)
    expect(matchesNameQuery(NEW_SIX_STAR, '不存在')).toBe(false)
  })
})

describe('选项生成', () => {
  it('精英化阶段来自 levelMax（无不限项）', () => {
    expect(getEvolvePhaseOptions(INFO, SIX_STAR)).toEqual([
      { phase: 0, maxLevel: 50 },
      { phase: 1, maxLevel: 80 },
      { phase: 2, maxLevel: 90 }
    ])
    expect(getEvolvePhaseOptions(INFO, THREE_STAR)).toHaveLength(2)
    expect(getEvolvePhaseOptions(INFO, undefined)).toEqual([])
  })

  it('等级需求：满级随阶段变化，≥N 仅精二且有模组的 4~6 星可用', () => {
    expect(getLevelRequirementOptions(INFO, SIX_STAR, 2)).toEqual({ maxLevel: 90, e2MinLevel: 60 })
    expect(getLevelRequirementOptions(INFO, SIX_STAR, 1)).toEqual({ maxLevel: 80, e2MinLevel: null })
    expect(getLevelRequirementOptions(INFO, THREE_STAR, 1)).toEqual({ maxLevel: 55, e2MinLevel: null })
    expect(getLevelRequirementOptions(INFO, PLAIN, 2)).toEqual({ maxLevel: 90, e2MinLevel: null })
  })

  it('技能需求档位随精英化收窄，技能位按阶段截断', () => {
    expect(getSkillRequirementOptions(0).map(option => option.value)).toEqual([0])
    expect(getSkillRequirementOptions(1).map(option => option.value)).toEqual([0, 1])
    expect(getSkillRequirementOptions(2).map(option => option.value)).toEqual([0, 1, 2, 3, 4])
    expect(getSkillSlotOptions(SIX_STAR, 0)).toHaveLength(1)
    expect(getSkillSlotOptions(SIX_STAR, 1)).toHaveLength(2)
    expect(getSkillSlotOptions(SIX_STAR, 2)).toHaveLength(2)
  })

  it('模组选项注入证章，模组等级按证章/真实模组区分', () => {
    expect(getEquipOptions(SIX_STAR).map(equip => equip.id)).toEqual([EQUIP_BADGE_ID, 'char_100_alpha_e1'])
    expect(getEquipOptions(PLAIN)).toEqual([])
    expect(getEquipLevelOptions(EQUIP_BADGE_ID)).toEqual([{ value: 0, label: '不限' }])
    expect(getEquipLevelOptions('char_100_alpha_e1').map(option => option.value)).toEqual([1, 2, 3])
  })
})

describe('createDefaultFilter', () => {
  it('默认最高精英化 + 等级不限 + 第一个技能 + 证章 0', () => {
    expect(createDefaultFilter(INFO, SIX_STAR)).toEqual({
      charId: 'char_100_alpha',
      evolvePhase: 2,
      level: 0,
      skillId: 'char_100_alpha_s1',
      skillLevel: 0,
      equipId: EQUIP_BADGE_ID,
      equipLevel: 0
    })
  })

  it('3 星默认精一；无模组干员无默认模组', () => {
    const threeStarFilter = createDefaultFilter(INFO, THREE_STAR)
    expect(threeStarFilter.evolvePhase).toBe(1)
    expect(threeStarFilter.equipId).toBe('')
    expect(createDefaultFilter(INFO, PLAIN).skillId).toBe('')
  })
})

describe('applyEvolvePhaseChange', () => {
  it('切到低阶段：技能位截断重置、需求降档、模组移除', () => {
    const filter = {
      ...createDefaultFilter(INFO, SIX_STAR),
      skillId: 'char_100_alpha_s2',
      skillLevel: 4,
      equipId: 'char_100_alpha_e1',
      equipLevel: 3
    }
    expect(applyEvolvePhaseChange(filter, INFO, SIX_STAR, 0)).toEqual({
      charId: 'char_100_alpha',
      evolvePhase: 0,
      level: 0,
      skillId: 'char_100_alpha_s1',
      skillLevel: 0,
      equipId: '',
      equipLevel: 0
    })
    const e1 = applyEvolvePhaseChange(filter, INFO, SIX_STAR, 1)
    expect(e1.skillId).toBe('char_100_alpha_s2')
    expect(e1.skillLevel).toBe(0)
    expect(e1.equipId).toBe('')
  })

  it('回到精二且无模组选择时恢复默认证章', () => {
    const stripped = applyEvolvePhaseChange(createDefaultFilter(INFO, SIX_STAR), INFO, SIX_STAR, 0)
    const restored = applyEvolvePhaseChange(stripped, INFO, SIX_STAR, 2)
    expect(restored.equipId).toBe(EQUIP_BADGE_ID)
    expect(restored.equipLevel).toBe(0)
  })
})

describe('buildAssistSearchRequest', () => {
  it('证章哨兵映射回官方空串 id', () => {
    const request = buildAssistSearchRequest(createDefaultFilter(INFO, SIX_STAR), '10001')
    expect(request).toEqual({
      uid: '10001',
      charId: 'char_100_alpha',
      level: { evolvePhase: 2, level: 0 },
      skill: { id: 'char_100_alpha_s1', level: 0 },
      equip: { id: '', level: 0 }
    })
  })
})
