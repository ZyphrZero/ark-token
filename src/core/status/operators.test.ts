import { describe, expect, it } from 'vitest'

import type { SklandPanelCharacter } from '../skland-info'
import { buildOperatorRoster, DEFAULT_OPERATOR_FILTERS, filterOperatorRoster } from './operators'

// 2026-09-08 抓包裁剪：仅保留干员字段；出处见 docs/MY_OPERATORS_UI.md。
const characters: SklandPanelCharacter[] = [
  { charId: 'char_002_amiya', skinId: 'char_002_amiya@winter#1', level: 1, evolvePhase: 2 },
  { charId: 'char_502_nblade', skinId: 'char_502_nblade#1', level: 30, evolvePhase: 0 },
  { charId: 'char_500_noirc', skinId: 'char_500_noirc#1', level: 1, evolvePhase: 0 },
  { charId: 'char_503_rang', skinId: 'char_503_rang#1', level: 5, evolvePhase: 0 }
]
const roster = buildOperatorRoster(characters)

describe('operator roster', () => {
  it('按 charId 匹配招募状态，精二 1 级仍为已招募', () => {
    const owned = filterOperatorRoster(roster, DEFAULT_OPERATOR_FILTERS)
    expect(owned.map((operator) => operator.charId)).toHaveLength(4)
    expect(owned.find((operator) => operator.charId === 'char_002_amiya')).toMatchObject({
      name: '阿米娅',
      rarity: 5,
      profession: 6,
      progress: { level: 1, evolvePhase: 2 }
    })
    const missing = filterOperatorRoster(roster, { ...DEFAULT_OPERATOR_FILTERS, recruitment: 'missing' })
    expect(missing.every((operator) => !characters.some((character) => character.charId === operator.charId))).toBe(
      true
    )
    expect(missing.length + owned.length).toBe(roster.length)
  })

  it('未知干员保留已招募状态，缺少目录信息时不伪造职业和星级', () => {
    const unknown = { ...characters[0], charId: 'char_future_operator' }
    expect(buildOperatorRoster([unknown], {})).toEqual([
      {
        charId: unknown.charId,
        name: unknown.charId,
        rarity: null,
        profession: null,
        progress: unknown
      }
    ])
  })

  it('快照中同一干员重复出现不重复计数', () => {
    expect(
      filterOperatorRoster(buildOperatorRoster([...characters, characters[0]]), DEFAULT_OPERATOR_FILTERS)
    ).toHaveLength(4)
  })

  it('同一维度多选取并集，不同维度取交集', () => {
    const filtered = filterOperatorRoster(roster, {
      ...DEFAULT_OPERATOR_FILTERS,
      recruitment: 'all',
      professions: [6, 4],
      rarities: [5, 6],
      phase: '2'
    })
    expect(filtered.map((operator) => operator.name)).toEqual(['阿米娅'])
  })

  it('名称搜索忽略空格和英文大小写', () => {
    expect(
      filterOperatorRoster(roster, { ...DEFAULT_OPERATOR_FILTERS, recruitment: 'all', query: '  lancet-2  ' }).map(
        (operator) => operator.name
      )
    ).toEqual(['Lancet-2'])
  })

  it('精英 0 不等于未招募，无匹配时返回空列表', () => {
    expect(filterOperatorRoster(roster, { ...DEFAULT_OPERATOR_FILTERS, phase: '0' })).toHaveLength(3)
    expect(filterOperatorRoster(roster, { ...DEFAULT_OPERATOR_FILTERS, recruitment: 'missing', phase: '0' })).toEqual(
      []
    )
  })

  it('练度排序先比较精英化，再比较等级，且不修改输入', () => {
    const before = [...roster]
    const filtered = filterOperatorRoster(roster, { ...DEFAULT_OPERATOR_FILTERS, sort: 'level' })
    expect(filtered.map((operator) => operator.charId)).toEqual([
      'char_002_amiya',
      'char_502_nblade',
      'char_503_rang',
      'char_500_noirc'
    ])
    expect(roster).toEqual(before)
  })
})
