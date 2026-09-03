import { describe, expect, it } from 'vitest'

import { buildUploadPayload, formatOperatorData } from './format'
import { operatorSlimTable } from './format'

const TEST_TABLE: Record<string, [number, Record<string, string> | null]> = {
  char_002_amiya: [5, null],
  char_486_leto: [6, {
    uniequip_001_leto: 'X',
    uniequip_002_leto: 'Y',
    uniequip_003_leto: 'D',
    uniequip_004_leto: 'A',
    uniequip_005_leto: 'B'
  }]
}

describe('formatOperatorData', () => {
  it('换算潜能、技能、精英化与星级', () => {
    const result = formatOperatorData([
      {
        id: 'char_486_leto',
        level: 90,
        evolvePhase: 2,
        mainSkillLevel: 7,
        potentialRank: 5,
        skills: [{ level: 7 }, { level: 3 }, { level: 2 }],
        equips: []
      }
    ], TEST_TABLE)

    expect(result).toEqual([
      {
        own: true,
        charId: 'char_486_leto',
        level: 90,
        elite: 2,
        potential: 6,
        mainSkill: 7,
        rarity: 6,
        skill1: 7,
        skill2: 3,
        skill3: 2,
        modX: 0,
        modY: 0,
        modD: 0,
        modA: 0,
        modB: 0
      }
    ])
  })

  it('按模组类型归类到 modX/modY/modD/modA/modB', () => {
    const result = formatOperatorData([
      {
        id: 'char_486_leto',
        level: 60,
        evolvePhase: 2,
        mainSkillLevel: 7,
        potentialRank: 0,
        skills: [],
        equips: [
          { id: 'uniequip_002_leto', level: 3 },
          { id: 'uniequip_005_leto', level: 1 }
        ]
      }
    ], TEST_TABLE)

    expect(result[0]).toMatchObject({ modX: 0, modY: 3, modD: 0, modA: 0, modB: 1, potential: 1 })
  })

  it('跳过干员表中不存在的干员', () => {
    const result = formatOperatorData(
      [
        { id: 'char_999_unknown', level: 10 },
        { id: 'char_002_amiya', level: 30 }
      ],
      TEST_TABLE
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.charId).toBe('char_002_amiya')
    expect(result[0]?.rarity).toBe(5)
  })

  it('缺失字段时使用兜底值', () => {
    const result = formatOperatorData([{ id: 'char_002_amiya' }], TEST_TABLE)
    expect(result[0]).toMatchObject({
      level: 0,
      elite: 0,
      potential: 1,
      mainSkill: 1,
      skill1: 0
    })
  })

  it('打包的精简干员表包含阿米娅', () => {
    expect(operatorSlimTable['char_002_amiya']).toBeTruthy()
  })
})

describe('buildUploadPayload', () => {
  it('组装 PlayerInfoDTO 报文（含材料列表与账号信息）', () => {
    const payload = buildUploadPayload(
      { uid: '135297507', nickName: '博士', channelName: '官服', channelMasterId: 1 },
      {
        items: [
          { id: '30012', count: 120 },
          { id: '2001', count: 3 }
        ],
        characters: [{ id: 'char_002_amiya', level: 50, evolvePhase: 2, mainSkillLevel: 7, potentialRank: 5 }]
      }
    )

    expect(payload.token).toBe('')
    expect(payload.uid).toBe('135297507')
    expect(payload.nickName).toBe('博士')
    expect(payload.channelName).toBe('官服')
    expect(payload.channelMasterId).toBe(1)
    expect(payload.itemList).toEqual([
      { itemId: '30012', quantity: 120 },
      { itemId: '2001', quantity: 3 }
    ])
    expect(payload.operatorDataList).toHaveLength(1)
  })
})
