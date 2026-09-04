import { describe, expect, it } from 'vitest'

import {
  AP_PER_MOOD_POINT,
  apToMoodPoints,
  computeDroneCount,
  dormitoryCurrentAp,
  dormitoryRecoveryRate,
  estimateManufactureWeight,
  hireWorkCapSec,
  isResidentTired,
  MANUFACTURE_FORMULAS,
  manufactureWorkCapSec,
  meetingWorkCapSec,
  moodPercent,
  powerOutput,
  RESIDENT_AP_MAX,
  residentMoodPercent,
  trainingWorkCapSec,
  workingCurrentAp
} from './building'
import type {
  SklandBuildingDormitory,
  SklandBuildingHire,
  SklandBuildingManufacture,
  SklandBuildingMeeting,
  SklandLabor,
  SklandResidentCharacter
} from '../skland-info'

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

describe('residentMoodPercent / moodPercent', () => {
  function resident(partial: Partial<SklandResidentCharacter>): SklandResidentCharacter {
    return { charId: 'char_002_amiya', ap: 4_320_000, lastApAddTime: 0, index: 0, ...partial }
  }

  it('ap 满值 8_640_000 换算为百分比（实测 App 口径）', () => {
    expect(residentMoodPercent(resident({ ap: RESIDENT_AP_MAX }))).toBe(100)
    expect(residentMoodPercent(resident({ ap: 4_320_000 }))).toBe(50)
    expect(residentMoodPercent(resident({ ap: 720_000 }))).toBeCloseTo(8.33, 2)
  })

  it('心情点数满值 24 点', () => {
    expect(AP_PER_MOOD_POINT).toBe(360_000)
    expect(apToMoodPoints(RESIDENT_AP_MAX)).toBe(24)
    expect(apToMoodPoints(1_800_000)).toBe(5)
  })

  it('疲劳阈值为 1 点心情', () => {
    expect(isResidentTired(360_000)).toBe(true)
    expect(isResidentTired(360_001)).toBe(false)
    expect(isResidentTired(0)).toBe(true)
  })

  it('超界值被夹在 0-100', () => {
    expect(moodPercent(9_999_999)).toBe(100)
    expect(moodPercent(-50)).toBe(0)
  })
})

describe('workingCurrentAp', () => {
  const NOW = 10_000
  function resident(partial: Partial<SklandResidentCharacter>): SklandResidentCharacter {
    return { charId: 'char_002_amiya', ap: 8_000_000, lastApAddTime: NOW - 3_600, index: 0, ...partial }
  }

  it('按 100 ap/秒（1 点/小时）扣减', () => {
    // 3600 秒 × 100 = 360000
    expect(workingCurrentAp(resident({}), NOW)).toBe(8_000_000 - 360_000)
  })

  it('外推不超过 capSec（设施停工后不再消耗）', () => {
    expect(workingCurrentAp(resident({}), NOW, 600)).toBe(8_000_000 - 60_000)
    // cap 为 0 时保持快照
    expect(workingCurrentAp(resident({}), NOW, 0)).toBe(8_000_000)
  })

  it('扣减下限为 0，时钟早于快照时不扣减', () => {
    expect(workingCurrentAp(resident({ ap: 100_000 }), NOW)).toBe(0)
    expect(workingCurrentAp(resident({ lastApAddTime: NOW + 300 }), NOW)).toBe(8_000_000)
  })
})

describe('dormitoryCurrentAp', () => {
  const NOW = 10_000
  const dormitory = { slotId: '0', level: 5, comfort: 5000, chars: [] } as SklandBuildingDormitory
  const resident: SklandResidentCharacter = { charId: 'char_002_amiya', ap: 4_000_000, lastApAddTime: NOW - 3_600, index: 0 }

  it('恢复倍率 = 1.5 + 0.1×等级 + 0.0004×氛围', () => {
    // 1.5 + 0.5 + 2.0 = 4.0
    expect(dormitoryRecoveryRate(dormitory)).toBe(4)
    expect(dormitoryRecoveryRate({ ...dormitory, level: 3, comfort: 3000 })).toBe(3)
  })

  it('按倍率恢复并封顶满值', () => {
    // 3600 秒 × 4.0 × 100 = 1_440_000
    expect(dormitoryCurrentAp(resident, dormitory, NOW)).toBe(4_000_000 + 1_440_000)
    expect(dormitoryCurrentAp({ ...resident, ap: 8_600_000 }, dormitory, NOW)).toBe(RESIDENT_AP_MAX)
  })
})

describe('各房间外推上限', () => {
  const NOW = 10_000

  it('制造站：剩余可产件数×单件耗时 − 最干员心情秒×生产力 + 心情秒', () => {
    // 赤金（id 4）：72 分钟/件、2 重量/件；容量 54、现库存 0、剩余 99 → 可产 27 件
    // 最干员心情 7_203_500 ap = 72035 秒，speed 2.21
    const room: SklandBuildingManufacture = {
      slotId: '0',
      chars: [
        { charId: 'a', ap: 7_203_500, lastApAddTime: 0, index: 0 },
        { charId: 'b', ap: 7_203_500, lastApAddTime: 0, index: 1 }
      ],
      level: 3,
      speed: 2.21,
      complete: 0,
      capacity: 54,
      weight: 0,
      formulaId: 4,
      remain: 99,
      completeWorkTime: 0,
      lastUpdateTime: 0
    }
    expect(manufactureWorkCapSec(room)).toBeCloseTo(27 * 4320 - 72035 * 2.21 + 72035, 1)
  })

  it('制造站未收录配方无上限；库存已满时上限很小', () => {
    const base = {
      slotId: '0',
      chars: [{ charId: 'a', ap: 7_200_000, lastApAddTime: 0, index: 0 }],
      level: 3,
      speed: 2,
      complete: 0,
      remain: 99,
      completeWorkTime: 0,
      lastUpdateTime: 0
    } as SklandBuildingManufacture
    expect(manufactureWorkCapSec({ ...base, formulaId: 999, capacity: 54, weight: 0 })).toBe(Infinity)
    // 容量 74 全满：可产 0 件 → 0 − 心情秒×speed + 心情秒
    expect(manufactureWorkCapSec({ ...base, formulaId: 3, capacity: 74, weight: 74 })).toBeCloseTo(-72000 * 2 + 72000, 1)
  })

  it('会客室：(完成−更新) + (9−持有线索)×43200', () => {
    const room = {
      completeWorkTime: 8_911,
      lastUpdateTime: 8_386,
      clue: { own: 2 }
    } as SklandBuildingMeeting
    expect(meetingWorkCapSec(room)).toBe(525 + 7 * 43_200)
  })

  it('人力办公室：(now−完成) + (2−已刷新)×43200，未完成时无上限', () => {
    const room = { refreshCount: 0, completeWorkTime: NOW - 1_000 } as SklandBuildingHire
    expect(hireWorkCapSec(room, NOW)).toBe(1_000 + 2 * 43_200)
    expect(hireWorkCapSec({ ...room, refreshCount: 2 }, NOW)).toBe(1_000)
    expect(hireWorkCapSec({ ...room, completeWorkTime: NOW + 500 }, NOW)).toBe(Infinity)
    expect(hireWorkCapSec({ ...room, completeWorkTime: -1 }, NOW)).toBe(Infinity)
  })

  it('训练室：剩余秒数，空闲时为 0', () => {
    expect(trainingWorkCapSec(12_000)).toBe(12_000)
    expect(trainingWorkCapSec(-1)).toBe(0)
  })
})

/**
 * 真实抓包回归（skland_dump/building_api/player-info-app-decoded.json，
 * 森空岛 App v1.62.0，currentTs=1788543048，快照 lastApAddTime=1788441386）：
 * 用官方口径外推后，疲劳干员应为 12 名，与 App 首页「干员疲劳 12」一致。
 */
describe('抓包数据回归：疲劳计数与 App 一致', () => {
  const NOW = 1_788_543_048
  const LAST = 1_788_441_386
  const tired = (ap: number) => isResidentTired(ap)

  function worker(charId: string, ap: number): SklandResidentCharacter {
    return { charId, ap, lastApAddTime: LAST, index: 0 }
  }

  it('发电/贸易（无上限）：6 名贸易 + 3 名发电干员全部疲劳', () => {
    // 28.24 小时 × 1 点/小时 > 快照心情
    expect(workingCurrentAp(worker('t1', 8_621_670), NOW)).toBe(0)
    expect(workingCurrentAp(worker('t2', 7_210_195), NOW)).toBe(0)
    expect(tired(workingCurrentAp(worker('p1', 6_994_725), NOW))).toBe(true)
    expect(tired(workingCurrentAp(worker('p2', 8_624_100), NOW))).toBe(true)
  })

  it('制造站：生产上限阻止过度扣减，4 站 12 人均不疲劳', () => {
    // 抓包 slot_25：formulaId 3（180 分钟/件、5 重量），capacity 54、weight 0、remain 99、speed 2.01
    const room: SklandBuildingManufacture = {
      slotId: 'slot_25',
      chars: [worker('m1', 7_204_865), worker('m2', 7_204_865), worker('m3', 7_204_865)],
      level: 3,
      speed: 2.01,
      complete: 0,
      capacity: 54,
      weight: 0,
      formulaId: 3,
      remain: 99,
      completeWorkTime: 1_788_494_899,
      lastUpdateTime: LAST
    }
    const capSec = manufactureWorkCapSec(room)
    const current = workingCurrentAp(room.chars[0], NOW, capSec)
    expect(capSec).toBeCloseTo(35_230.86, 1)
    expect(current).toBeCloseTo(7_204_865 - 3_523_086, 0)
    expect(tired(current)).toBe(false)
  })

  it('会客室 + 人力办公室：按各自上限外推后均疲劳（凑齐 12 名）', () => {
    // 会客室：own=2 → cap = 8_909 + 7×43200 = 311_309
    const meeting = {
      completeWorkTime: 1_788_450_295,
      lastUpdateTime: LAST,
      clue: { own: 2 }
    } as SklandBuildingMeeting
    const meetingCap = meetingWorkCapSec(meeting)
    expect(meetingCap).toBe(311_309)
    expect(tired(workingCurrentAp(worker('char_4087_ines', 6_999_225), NOW, meetingCap))).toBe(true)
    expect(tired(workingCurrentAp(worker('char_4194_rmixer', 8_628_525), NOW, meetingCap))).toBe(true)
    // 人力：refreshCount=0、completeWorkTime 已过 → cap = 95_627 + 86_400 = 182_027
    const hireCap = hireWorkCapSec({ refreshCount: 0, completeWorkTime: 1_788_447_421 } as SklandBuildingHire, NOW)
    expect(hireCap).toBe(182_027)
    expect(tired(workingCurrentAp(worker('char_4065_judge', 8_623_125), NOW, hireCap))).toBe(true)
  })

  it('宿舍：lv5/comfort5000 倍率 4.0，快照 63% 的干员已恢复满值', () => {
    const dormitory = { slotId: 'slot_28', level: 5, comfort: 5000, chars: [] } as SklandBuildingDormitory
    expect(dormitoryRecoveryRate(dormitory)).toBe(4)
    const current = dormitoryCurrentAp(worker('char_1027_greyy2', 5_469_950), dormitory, NOW)
    expect(current).toBe(RESIDENT_AP_MAX)
  })
})
