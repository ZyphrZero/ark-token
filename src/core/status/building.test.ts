import { describe, expect, it } from 'vitest'

import {
  computeDroneCount,
  estimateManufactureWeight,
  MANUFACTURE_FORMULAS,
  powerOutput,
  residentMoodPercent
} from './building'
import type { SklandBuildingManufacture, SklandLabor, SklandResidentCharacter } from '../skland-info'

const NOW = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW / 1000)

function labor(partial: Partial<SklandLabor>): SklandLabor {
  return { value: 60, maxValue: 200, remainSecs: 0, lastUpdateTime: NOW_SEC - 720, ...partial }
}

describe('computeDroneCount', () => {
  it('每 360 秒恢复 1 架（round 取整）', () => {
    // 720 秒 → 2 架
    expect(computeDroneCount(labor({}), NOW)).toBe(62)
    // 540 秒 → round(1.5) = 2 架
    expect(computeDroneCount(labor({ lastUpdateTime: NOW_SEC - 540 }), NOW)).toBe(62)
  })

  it('恢复量封顶 maxValue', () => {
    expect(computeDroneCount(labor({ value: 199, lastUpdateTime: NOW_SEC - 7200 }), NOW)).toBe(200)
  })

  it('已满时直接返回最大值', () => {
    expect(computeDroneCount(labor({ value: 200 }), NOW)).toBe(200)
  })

  it('时钟早于 lastUpdateTime 时不恢复', () => {
    expect(computeDroneCount(labor({ lastUpdateTime: NOW_SEC + 300 }), NOW)).toBe(60)
  })
})

describe('powerOutput', () => {
  it('按等级指数增长', () => {
    expect(powerOutput(1)).toBe(60)
    expect(powerOutput(2)).toBe(130)
    expect(powerOutput(3)).toBe(270)
  })
})

describe('MANUFACTURE_FORMULAS', () => {
  it('覆盖 1-14 号配方', () => {
    for (let id = 1; id <= 14; id++) {
      expect(MANUFACTURE_FORMULAS[id]).toBeTruthy()
    }
    expect(MANUFACTURE_FORMULAS[4]?.name).toBe('赤金')
  })
})

describe('estimateManufactureWeight', () => {
  function room(partial: Partial<SklandBuildingManufacture>): SklandBuildingManufacture {
    return {
      slotId: '0',
      chars: [],
      level: 2,
      speed: 1,
      complete: 0,
      capacity: 96,
      weight: 10,
      formulaId: 4,
      remain: 99,
      completeWorkTime: 0,
      lastUpdateTime: NOW_SEC - 7200,
      ...partial
    }
  }

  it('按配方耗时与生产力折算增量（赤金 72 分钟/件）', () => {
    // 运行 120 分钟 / 72 = 1 件 → 10 + 2
    expect(estimateManufactureWeight(room({}), NOW)).toBe(12)
  })

  it('生产力翻倍时单件耗时减半', () => {
    // 120 分钟 / 36 = 3 件 → 10 + 6
    expect(estimateManufactureWeight(room({ speed: 2 }), NOW)).toBe(16)
  })

  it('未收录配方返回抓取时的静态库存', () => {
    expect(estimateManufactureWeight(room({ formulaId: 999, weight: 33 }), NOW)).toBe(33)
  })

  it('运行时长不足一件时库存不变', () => {
    expect(estimateManufactureWeight(room({ lastUpdateTime: NOW_SEC - 600 }), NOW)).toBe(10)
  })
})

describe('residentMoodPercent', () => {
  function resident(partial: Partial<SklandResidentCharacter>): SklandResidentCharacter {
    return { charId: 'char_002_amiya', ap: 43_200, lastApAddTime: 0, index: 0, ...partial }
  }

  it('ap 秒数换算为百分比', () => {
    expect(residentMoodPercent(resident({ ap: 86_400 }))).toBe(100)
    expect(residentMoodPercent(resident({ ap: 43_200 }))).toBe(50)
    expect(residentMoodPercent(resident({ ap: 0, index: 1 }))).toBe(100)
  })

  it('ap<=0 且 index!==-1 视为休息满', () => {
    expect(residentMoodPercent(resident({ ap: 0, index: 2 }))).toBe(100)
    // index === -1 不适用该规则，按 0 处理
    expect(residentMoodPercent(resident({ ap: 0, index: -1 }))).toBe(0)
  })

  it('超界值被夹在 0-100', () => {
    expect(residentMoodPercent(resident({ ap: 999_999 }))).toBe(100)
    expect(residentMoodPercent(resident({ ap: -50, index: -1 }))).toBe(0)
  })
})
