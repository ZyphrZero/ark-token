import { describe, expect, it } from 'vitest'

import {
  AP_PER_MOOD_POINT,
  apToMoodPoints,
  buildingOverview,
  CLUE_OWN_MAX,
  CLUE_SERIES,
  clueBoardSlots,
  computeDroneCount,
  dormitoryCurrentAp,
  dormitoryRecoveryRate,
  droneRecoverySeconds,
  droneSpeedBonusPercent,
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
  roomCapacity,
  specializeLevelText,
  tradingStrategyName,
  trainingCompleteTimeSec,
  trainingSkillInfo,
  trainingSpeedBonusPercent,
  trainingWorkCapSec,
  workingCurrentAp
} from './building'
import type {
  SklandBuilding,
  SklandBuildingDormitory,
  SklandBuildingHire,
  SklandBuildingManufacture,
  SklandBuildingMeeting,
  SklandBuildingTraining,
  SklandLabor,
  SklandMeetingClue,
  SklandPanelCharacter,
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

describe('droneRecoverySeconds / computeDroneCount（充能加成）', () => {
  // 抓包样本 skland_dump/building_api/drone-rate-sample.json：
  // +60% 充能加成账号（中枢进驻技能），remainSecs 已含加成，速率 ≈ 224.73 秒/架 = 360/1.6
  const boosted = labor({ value: 51, maxValue: 235, lastUpdateTime: 1_788_689_243, remainSecs: 41_351 })

  it('实际速率由 remainSecs/(maxValue−value) 自描述：+60% 样本 ≈ 360/1.6', () => {
    expect(droneRecoverySeconds(boosted)).toBeCloseTo(224.73, 1)
  })

  it('remainSecs 缺失（0/-1）或已满时回退基准 360 秒/架', () => {
    expect(droneRecoverySeconds(labor({ remainSecs: 0 }))).toBe(360)
    expect(droneRecoverySeconds(labor({ remainSecs: -1 }))).toBe(360)
    expect(droneRecoverySeconds(labor({ value: 200, remainSecs: 0 }))).toBe(360)
  })

  it('无加成快照（remainSecs 与基准速率一致）速率恰为 360', () => {
    expect(droneRecoverySeconds(labor({ remainSecs: 140 * 360 }))).toBe(360)
  })

  it('+60% 样本按实际速率外推：1802 秒 → +8 架（旧固定 360 会错算 +5 架）', () => {
    // 双快照对账（record 2478 → 3268）：Δt=1802s、value 51→59
    const later = ( boosted.lastUpdateTime + 1_802 ) * 1000
    expect(computeDroneCount(boosted, later)).toBe(59)
  })

  it('外推封顶 maxValue', () => {
    const wayLater = (boosted.lastUpdateTime + 41_351 + 10_000) * 1000
    expect(computeDroneCount(boosted, wayLater)).toBe(235)
  })

  it('充能加成百分比：三份真实快照与下取整坏样本均收敛到真实 +60%（回归：直接四舍五入会显示 61）', () => {
    // 抓包样本 skland_dump/building_api/drone-rate-sample.json 三快照
    expect(droneSpeedBonusPercent(boosted)).toBe(60)
    expect(droneSpeedBonusPercent(labor({ value: 59, maxValue: 235, lastUpdateTime: 1_788_691_045, remainSecs: 39_549 }))).toBe(60)
    expect(droneSpeedBonusPercent(labor({ value: 2, maxValue: 235, lastUpdateTime: 1_788_696_675, remainSecs: 52_372 }))).toBe(60)
    // value 小数部分接近 1 的坏样本：旧口径 est=+60.6% 会四舍五入成 61，区间中点法为 60
    expect(droneSpeedBonusPercent(labor({ value: 51, maxValue: 235, remainSecs: 41_250 }))).toBe(60)
  })

  it('无加成快照显示 0（含小数部分极端的构造，旧口径会误显 1）', () => {
    expect(droneSpeedBonusPercent(labor({ remainSecs: 140 * 360 }))).toBe(0)
    expect(droneSpeedBonusPercent(labor({ remainSecs: 50_044 }))).toBe(0)
  })

  it('快照无法推导加成（已满、remainSecs ≤ 0、临近充满区间过宽）时返回 null', () => {
    expect(droneSpeedBonusPercent(labor({ value: 200, remainSecs: 0 }))).toBeNull()
    expect(droneSpeedBonusPercent(labor({ remainSecs: -1 }))).toBeNull()
    expect(droneSpeedBonusPercent(labor({ remainSecs: 0 }))).toBeNull()
    // 剩余 29 架（<30）区间宽度 >5%，不显示
    expect(droneSpeedBonusPercent(labor({ value: 206, maxValue: 235, remainSecs: 6_525 }))).toBeNull()
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

describe('clueBoardSlots', () => {
  function clue(board: SklandMeetingClue['board']): SklandMeetingClue {
    return {
      board,
      own: board.length,
      received: 0,
      dailyReward: false,
      needReceive: 0,
      shareCompleteTime: -1,
      sharing: false
    }
  }

  it('空板（未置入任何线索）全部为 false', () => {
    // 抓包样本 skland_dump/building_api/player-info-app-decoded.json：own=2 时 board 为空
    expect(clueBoardSlots(clue([]))).toEqual([false, false, false, false, false, false, false])
  })

  it('满板（交流中集齐 7 系列）全部为 true', () => {
    // 抓包样本（Reqable record 172）：own=5、sharing=true、board 按系列顺序放满 7 条
    expect(clueBoardSlots(clue(['RHINE', 'PENGUIN', 'BLACKSTEEL', 'URSUS', 'GLASGOW', 'KJERAG', 'RHODES'])))
      .toEqual([true, true, true, true, true, true, true])
  })

  it('紧凑列表按系列名判断，不受置入位置影响（回归：不可用下标判断）', () => {
    // 抓包样本 skland_dump/building_api/meeting-clue-compact-sample.json：
    // 游戏内实际置入 1/3/4/7 号位，board 只有 4 个元素。若按下标判断会错点亮 1/2/3/4 号位
    const slots = clueBoardSlots(clue(['RHINE', 'BLACKSTEEL', 'URSUS', 'RHODES']))
    expect(slots).toEqual([true, false, true, true, false, false, true])
  })

  it('board 顺序打乱或含重复系列时结果不变', () => {
    expect(clueBoardSlots(clue(['RHODES', 'RHINE', 'RHINE', 'URSUS'])))
      .toEqual([true, false, false, true, false, false, true])
  })

  it('系列表 7 项对应槽位 1-7，自有库上限 10（游戏内 N/10 口径）', () => {
    expect(CLUE_SERIES).toHaveLength(7)
    expect(CLUE_OWN_MAX).toBe(10)
  })
})

describe('roomCapacity', () => {
  it('按游戏数据 building_data.json 的每级容量表取值', () => {
    expect(roomCapacity('control', 5)).toBe(5)
    expect(roomCapacity('control', 1)).toBe(1)
    expect(roomCapacity('manufacture', 3)).toBe(3)
    expect(roomCapacity('trading', 2)).toBe(2)
    expect(roomCapacity('power', 3)).toBe(1)
    expect(roomCapacity('hire', 3)).toBe(1)
    expect(roomCapacity('training', 3)).toBe(2)
    expect(roomCapacity('meeting', 3)).toBe(2)
    expect(roomCapacity('dormitory', 5)).toBe(5)
  })

  it('越界等级收敛到最低/最高级', () => {
    expect(roomCapacity('control', 0)).toBe(1)
    expect(roomCapacity('manufacture', 99)).toBe(3)
  })
})

describe('buildingOverview', () => {
  // 抓包账号 2026-09-06（Reqable record 2478）的工作区构成：
  // 中枢 lv5×5人、发电 lv3×3间各1人、制造 lv3×3间各3人、贸易 lv3×3间（3/3/0人）、
  // 人力 lv3×1人、训练 lv3（教官+学员）、会客 lv3×2人
  function capturedBase(): SklandBuilding {
    const room = (level: number, chars: number) => ({ slotId: 's', level, chars: Array.from({ length: chars }, () => ({})) })
    return {
      control: room(5, 5),
      powers: [room(3, 1), room(3, 1), room(3, 1)],
      manufactures: [room(3, 3), room(3, 3), room(3, 3)],
      tradings: [room(3, 3), room(3, 3), room(3, 0)],
      dormitories: [room(5, 5), room(5, 5), room(5, 5), room(5, 5)],
      hire: room(3, 1),
      training: { slotId: 's', level: 3, trainer: {}, trainee: {}, remainPoint: 0, speed: 1, lastUpdateTime: 0, remainSecs: 0 },
      meeting: room(3, 2),
      labor: {} as SklandLabor
    } as unknown as SklandBuilding
  }

  it('抓包样本对账：工作区 13 间 / 进驻 28 人 / 上限 31', () => {
    const overview = buildingOverview(capturedBase())
    expect(overview).toEqual({ rooms: 13, residents: 28, capacity: 31 })
  })

  it('宿舍为非工作区不计入房间与人数', () => {
    const base = capturedBase()
    base.dormitories[0].chars.push({ charId: 'char_x', ap: 0, lastApAddTime: 0, index: 0 })
    expect(buildingOverview(base)).toEqual({ rooms: 13, residents: 28, capacity: 31 })
  })

  it('缺省会跳过 null 设施（hire/training/meeting 可为 null）', () => {
    const base = capturedBase()
    base.hire = null
    base.training = null
    base.meeting = null
    const overview = buildingOverview(base)
    expect(overview.rooms).toBe(10)
    expect(overview.residents).toBe(23)
    expect(overview.capacity).toBe(26)
  })
})

describe('tradingStrategyName', () => {
  it('策略枚举与游戏内文案对应', () => {
    expect(tradingStrategyName('O_GOLD')).toBe('龙门商法')
    expect(tradingStrategyName('O_DIAMOND')).toBe('开采协力')
  })
})

describe('trainingCompleteTimeSec / trainingSpeedBonusPercent', () => {
  // 抓包样本 skland_dump/building_api/training-remainsecs-sample.json（Reqable record 2478）：
  // currentTs=1788689770、lastUpdateTime=1788689243、remainPoint=8186.7、speed=1.35、remainSecs=5537
  const active = { remainPoint: 8186.7, speed: 1.35, lastUpdateTime: 1_788_689_243, remainSecs: 5537 } as SklandBuildingTraining

  it('完成时刻 = currentTs + remainSecs，与 lastUpdateTime + remainPoint/speed 一致（实测误差 <1s）', () => {
    const byRemainSecs = trainingCompleteTimeSec(active, 1_788_689_770)
    const byPoints = active.lastUpdateTime + active.remainPoint / active.speed
    expect(byRemainSecs).toBe(1_788_689_770 + 5537)
    expect(Math.abs(byRemainSecs - byPoints)).toBeLessThan(1)
  })

  it('空闲（remainSecs=-1）返回 -1', () => {
    // 旧抓包样本：trainee 在但 targetSkill=-1、trainer=null、remainSecs=-1
    expect(trainingCompleteTimeSec({ ...active, remainSecs: -1 } as SklandBuildingTraining, NOW_SEC)).toBe(-1)
  })

  it('速度倍率折算为加成百分比', () => {
    expect(trainingSpeedBonusPercent(1.35)).toBe(35)
    expect(trainingSpeedBonusPercent(1.05)).toBe(5)
    expect(trainingSpeedBonusPercent(1)).toBe(0)
  })
})

describe('trainingSkillInfo / specializeLevelText', () => {
  // 抓包样本 skland_dump/building_api/training-skill-sample.json：
  // 训练中快照（09-06 18:59，Reqable record 3268）：trainee char_4217_makoto targetSkill=2，
  // 此时 chars.skills 全部 specializeLevel=0（该轮训练 0→专精一，19:48 完成）。
  // 完成后快照（09-07 00:15，Reqable record 3622）：skills[2] 变为 1、skills[1] 仍为 0——
  // 证明 targetSkill 是 0 起下标（指向第 3 技能 skchr_makoto_3），不是 1 起槽位号。
  const makotoTraining = {
    trainee: { charId: 'char_4217_makoto', targetSkill: 2, ap: 0, lastApAddTime: 0 }
  } as SklandBuildingTraining
  const makotoCharsDuring = [
    {
      charId: 'char_4217_makoto',
      skills: [
        { id: 'skchr_makoto_1', specializeLevel: 0 },
        { id: 'skchr_makoto_2', specializeLevel: 0 },
        { id: 'skchr_makoto_3', specializeLevel: 0 }
      ]
    }
  ] as SklandPanelCharacter[]

  it('targetSkill 为 0 起下标：2 → 第 3 技能（开辟明日的剑刃），训练目标 = 当前 + 1', () => {
    const info = trainingSkillInfo(makotoTraining, makotoCharsDuring)
    expect(info).toEqual({
      slot: 3,
      skillId: 'skchr_makoto_3',
      skillName: '开辟明日的剑刃',
      currentLevel: 0,
      targetLevel: 1
    })
  })

  it('训练完成后的快照：skills[2]=1 时同轮训练显示专精二', () => {
    const charsAfter = [
      {
        charId: 'char_4217_makoto',
        skills: [
          { id: 'skchr_makoto_1', specializeLevel: 0 },
          { id: 'skchr_makoto_2', specializeLevel: 0 },
          { id: 'skchr_makoto_3', specializeLevel: 1 }
        ]
      }
    ] as SklandPanelCharacter[]
    const info = trainingSkillInfo(makotoTraining, charsAfter)
    expect(info?.currentLevel).toBe(1)
    expect(info?.targetLevel).toBe(2)
    expect(specializeLevelText(info!.targetLevel)).toBe('专精二')
  })

  it('当前专精 2 级时训练目标为专精三', () => {
    const chars = [
      { charId: 'char_4217_makoto', skills: [{}, {}, { id: 'skchr_makoto_3', specializeLevel: 2 }] }
    ] as SklandPanelCharacter[]
    expect(trainingSkillInfo(makotoTraining, chars)?.targetLevel).toBe(3)
  })

  it('注入表优先：common 技能名（阿米娅槽位 1 战术咏唱·γ型）', () => {
    const training = {
      trainee: { charId: 'char_002_amiya', targetSkill: 0, ap: 0, lastApAddTime: 0 }
    } as SklandBuildingTraining
    const chars = [
      { charId: 'char_002_amiya', skills: [{ id: 'skcom_magic_rage[3]', specializeLevel: 2 }] }
    ] as SklandPanelCharacter[]
    expect(trainingSkillInfo(training, chars, { char_002_amiya: ['战术咏唱·γ型', '精神爆发', '奇美拉'] })?.skillName)
      .toBe('战术咏唱·γ型')
  })

  it('本地表缺该干员/槽位时技能名为 null，空闲或找不到学员时返回 null', () => {
    expect(trainingSkillInfo(makotoTraining, makotoCharsDuring, {})?.skillName).toBeNull()
    expect(trainingSkillInfo({ ...makotoTraining, trainee: null }, makotoCharsDuring)).toBeNull()
    expect(trainingSkillInfo({ trainee: { charId: 'x', targetSkill: -1, ap: 0, lastApAddTime: 0 } } as SklandBuildingTraining, makotoCharsDuring)).toBeNull()
    expect(trainingSkillInfo(makotoTraining, undefined)).toBeNull()
    expect(trainingSkillInfo(makotoTraining, [{ charId: 'char_other' }] as SklandPanelCharacter[])).toBeNull()
  })

  it('专精等级文案与游戏内一致', () => {
    expect(specializeLevelText(1)).toBe('专精一')
    expect(specializeLevelText(2)).toBe('专精二')
    expect(specializeLevelText(3)).toBe('专精三')
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
