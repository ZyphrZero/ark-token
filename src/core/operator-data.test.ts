import { describe, expect, it } from 'vitest'

import {
  buffOf,
  buildingSkillsOf,
  buildingSkillUnlockText,
  isBuildingSkillUnlocked,
  operatorData,
  operatorName,
  operatorRarity,
  professionKey,
  professionName,
  stripBuffTags
} from './operator-data'
import type { BuildingSkillTier } from './operator-data'

function tier(partial: Partial<BuildingSkillTier>): BuildingSkillTier {
  return { slot: 0, id: 'x', phase: 0, level: 1, name: '技能', percent: 0, ...partial }
}

describe('operatorName / operatorRarity', () => {
  it('读打包全量表', () => {
    expect(operatorName('char_101_sora')).toBe('空')
    expect(operatorRarity('char_101_sora')).toBe(5)
  })

  it('未收录干员：名字回退 charId、星级为 null（调用方跳过以保证上传报文正确）', () => {
    expect(operatorName('char_999_unknown')).toBe('char_999_unknown')
    expect(operatorRarity('char_999_unknown')).toBeNull()
  })
})

describe('professionName / professionKey', () => {
  // arkntools 职业数字编码（实测交叉验证：陈=1 近卫、雷蛇=3 重装、凯尔希=4 医疗、
  // 空=5 辅助、阿米娅=6 术师），与助战检索的工作站枚举（PIONEER/WARRIOR/...）不同
  it('数字职业 → 中文名', () => {
    expect(professionName(1)).toBe('近卫')
    expect(professionName(2)).toBe('狙击')
    expect(professionName(3)).toBe('重装')
    expect(professionName(4)).toBe('医疗')
    expect(professionName(5)).toBe('辅助')
    expect(professionName(6)).toBe('术师')
    expect(professionName(7)).toBe('特种')
    expect(professionName(8)).toBe('先锋')
  })

  it('数字职业 → 工作站字符串枚举（图标 URL 用）', () => {
    expect(professionKey(1)).toBe('WARRIOR')
    expect(professionKey(6)).toBe('CASTER')
    expect(professionKey(5)).toBe('SUPPORT')
    expect(professionKey(8)).toBe('PIONEER')
  })

  it('未知数字回退', () => {
    expect(professionName(9)).toBe('未知')
    expect(professionName(-1)).toBe('未知')
    expect(professionKey(9)).toBeUndefined()
  })

  it('打包表里空(char_101_sora)是辅助(5)，名字与职业一致', () => {
    // 用实际干员验证 skill-tip 头部两个来源字段一致
    const sora = operatorData.operators['char_101_sora']
    expect(sora.profession).toBe(5)
    expect(operatorName(sora.charId)).toBe('空')
    expect(professionName(sora.profession)).toBe('辅助')
  })
})

describe('buildingSkillsOf / buffOf', () => {
  // 图示样例（空）：偶像=初始解锁的宿舍技能、企鹅物流·β=精英2 的贸易技能
  it('返回该干员全部基建技能，按解锁条件升序', () => {
    const tiers = buildingSkillsOf('char_101_sora')
    expect(tiers.map(item => [item.name, item.phase, item.level])).toEqual([
      ['偶像', 0, 1],
      ['企鹅物流·β', 2, 1]
    ])
  })

  it('技能详情含富文本描述与图标（图标带扩展名，与落盘文件同名）', () => {
    const buff = buffOf('dorm_rec_all_011')
    expect(buff?.name).toBe('偶像')
    expect(buff?.descriptionRich).toBe(
      '进驻宿舍时，该宿舍内所有干员的心情每小时恢复<@cc.vup>+0.15</>（同种效果取最高）'
    )
    expect(buff?.icon).toMatch(/^bskill_dorm_all2\.(png|webp)$/)
  })

  it('无基建技能/未收录干员返回空数组', () => {
    expect(buildingSkillsOf('char_999_unknown')).toEqual([])
    expect(buffOf('no_such_buff')).toBeUndefined()
  })
})

describe('isBuildingSkillUnlocked', () => {
  it('精英阶段更高即满足，同阶段比等级', () => {
    const elite2 = tier({ phase: 2, level: 1 })
    expect(isBuildingSkillUnlocked(elite2, { evolvePhase: 2, level: 1 })).toBe(true)
    expect(isBuildingSkillUnlocked(elite2, { evolvePhase: 1, level: 90 })).toBe(false)
    // 抓包账号三名发电站干员均为精0 Lv1：β 档（精2）必须判未解锁
    expect(isBuildingSkillUnlocked(elite2, { evolvePhase: 0, level: 1 })).toBe(false)
  })

  it('phase 0 的等级门槛（0_30）按等级判定', () => {
    const lv30 = tier({ phase: 0, level: 30 })
    expect(isBuildingSkillUnlocked(lv30, { evolvePhase: 0, level: 30 })).toBe(true)
    expect(isBuildingSkillUnlocked(lv30, { evolvePhase: 0, level: 29 })).toBe(false)
    // 精英化后等级重置，但高阶段自动满足低阶条件
    expect(isBuildingSkillUnlocked(lv30, { evolvePhase: 1, level: 1 })).toBe(true)
  })

  it('练度缺失（干员不在 chars 名册）时按未解锁处理', () => {
    expect(isBuildingSkillUnlocked(tier({}), undefined)).toBe(false)
  })
})

describe('buildingSkillUnlockText', () => {
  // 实测档位只有 4 种（见 docs/BUILDING_MOOD_API.md 第十一节）
  it('四种档位的文案与游戏内一致', () => {
    expect(buildingSkillUnlockText(tier({ phase: 0, level: 1 }))).toBe('初始解锁')
    expect(buildingSkillUnlockText(tier({ phase: 0, level: 30 }))).toBe('等级 30 解锁')
    expect(buildingSkillUnlockText(tier({ phase: 1, level: 1 }))).toBe('精英 1 解锁')
    expect(buildingSkillUnlockText(tier({ phase: 2, level: 1 }))).toBe('精英 2 解锁')
  })
})

describe('stripBuffTags', () => {
  it('剥掉着色与术语标签，保留正文', () => {
    expect(stripBuffTags('订单获取效率<@cc.vup>+30%</>')).toBe('订单获取效率+30%')
    expect(stripBuffTags('与<@cc.kw><$cc.angel>能天使</></>在同一贸易站')).toBe('与能天使在同一贸易站')
  })

  it('无标签文本原样返回', () => {
    expect(stripBuffTags('进驻发电站时')).toBe('进驻发电站时')
  })
})
