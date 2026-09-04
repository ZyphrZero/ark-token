import type {
  SklandBuildingDormitory,
  SklandBuildingHire,
  SklandBuildingManufacture,
  SklandBuildingMeeting,
  SklandLabor,
  SklandResidentCharacter
} from '../skland-info'

/** 无人机恢复速率：每 360 秒（6 分钟）恢复 1 架 */
const DRONE_RECOVERY_SECONDS = 360

/**
 * 心情满值（ap 单位为 0.01 秒）：8_640_000 = 86400 秒 = 24 点心情。
 * 实测森空岛 App v1.62.0 /api/v1/game/player/info 响应（skland_dump/building_api/），
 * 干员满心情时 ap 恰为 8_640_000，App 端也以 864e4 作为满值常量。
 */
export const RESIDENT_AP_MAX = 8_640_000
/** 1 点心情 = 3600 秒 = 360_000 ap 单位 */
export const AP_PER_MOOD_POINT = 360_000
/** 疲劳阈值：当前心情 ≤ 1 点（36e4）视为疲劳，与 App「干员疲劳」卡片口径一致 */
export const TIRED_AP_THRESHOLD = 360_000
/** 工作设施心情消耗速率：100 ap/秒 = 1 点/小时 */
const WORKING_DRAIN_AP_PER_SEC = 100

/** ap → 心情百分比（0-100） */
export function moodPercent(ap: number): number {
  return Math.max(0, Math.min(100, (ap / RESIDENT_AP_MAX) * 100))
}

/**
 * 无人机数量实时推算。公式与 rhodes-headquarters Labor.vue 一致：
 * value + round(elapsedSec / 360)，封顶 maxValue。
 */
export function computeDroneCount(labor: SklandLabor, nowMs: number): number {
  if (labor.value >= labor.maxValue) {
    return labor.maxValue
  }
  const elapsedSec = Math.max(0, Math.floor(nowMs / 1000) - labor.lastUpdateTime)
  return Math.min(labor.value + Math.round(elapsedSec / DRONE_RECOVERY_SECONDS), labor.maxValue)
}

/** 发电站发电量：2^(lv-1)*60 + (2^(lv-1)-1)*10 */
export function powerOutput(level: number): number {
  const base = Math.pow(2, level - 1)
  return base * 60 + (base - 1) * 10
}

/** 制造站配方表：formulaId → 产物名 / 单件耗时（分钟）/ 单件重量 */
export interface ManufactureFormula {
  name: string
  minutes: number
  weight: number
}

export const MANUFACTURE_FORMULAS: Record<string | number, ManufactureFormula> = {
  1: { name: '基础作战记录', minutes: 45, weight: 2 },
  2: { name: '初级作战记录', minutes: 80, weight: 3 },
  3: { name: '中级作战记录', minutes: 180, weight: 5 },
  4: { name: '赤金', minutes: 72, weight: 2 },
  5: { name: '先锋双芯片', minutes: 60, weight: 5 },
  6: { name: '近卫双芯片', minutes: 60, weight: 5 },
  7: { name: '重装双芯片', minutes: 60, weight: 5 },
  8: { name: '狙击双芯片', minutes: 60, weight: 5 },
  9: { name: '术师双芯片', minutes: 60, weight: 5 },
  10: { name: '医疗双芯片', minutes: 60, weight: 5 },
  11: { name: '辅助双芯片', minutes: 60, weight: 5 },
  12: { name: '特种双芯片', minutes: 60, weight: 5 },
  13: { name: '源石碎片', minutes: 60, weight: 3 },
  14: { name: '源石碎片', minutes: 60, weight: 3 }
}

/**
 * 制造站实时库存估算：weight + floor(运行分钟 / 单件耗时) * 单件重量。
 * 单件耗时按生产力折算（speed 1 = 100%）。未知配方返回抓取时的静态库存。
 */
export function estimateManufactureWeight(room: SklandBuildingManufacture, nowMs: number): number {
  const formula = MANUFACTURE_FORMULAS[room.formulaId]
  if (!formula) {
    return room.weight
  }
  const minutesPerUnit = formula.minutes / Math.max(room.speed, 0.01)
  const runningMinutes = Math.max(0, Math.floor((nowMs - room.lastUpdateTime * 1000) / 60_000))
  return room.weight + Math.floor(runningMinutes / minutesPerUnit) * formula.weight
}

/**
 * 进驻干员心情百分比（0-100），基于抓取快照（不做时间外推）。
 * ap 为 0.01 秒单位、满值 8_640_000，见 RESIDENT_AP_MAX。
 */
export function residentMoodPercent(resident: SklandResidentCharacter): number {
  return moodPercent(resident.ap)
}

/** ap → 心情点数（满 24 点，保留小数） */
export function apToMoodPoints(ap: number): number {
  return ap / AP_PER_MOOD_POINT
}

/** 当前 ap 是否处于疲劳状态（≤1 点心情） */
export function isResidentTired(currentAp: number): boolean {
  return currentAp <= TIRED_AP_THRESHOLD
}

/** 工作设施（发电/贸易/制造/会客/人力/训练）当前 ap：
 * ap − 100×min(流逝秒, capSec)，下限 0。发电/贸易无上限。
 * 各房间的 capSec 见 manufactureWorkCapSec 等，语义是“设施还能持续工作多久”，
 * 设施停工后干员不再消耗心情，外推不应越过该时刻。 */
export function workingCurrentAp(resident: SklandResidentCharacter, nowSec: number, capSec: number = Infinity): number {
  const elapsedSec = Math.max(0, nowSec - resident.lastApAddTime)
  return Math.max(0, resident.ap - WORKING_DRAIN_AP_PER_SEC * Math.min(elapsedSec, capSec))
}

/** 宿舍心情恢复倍率：1.5 + 0.1×等级 + 0.0004×氛围 */
export function dormitoryRecoveryRate(dormitory: SklandBuildingDormitory): number {
  return 1.5 + 0.1 * dormitory.level + 4e-4 * (dormitory.comfort ?? 0)
}

/** 宿舍干员当前 ap：ap + 流逝秒×倍率×100，封顶满值 */
export function dormitoryCurrentAp(resident: SklandResidentCharacter, dormitory: SklandBuildingDormitory, nowSec: number): number {
  const elapsedSec = Math.max(0, nowSec - resident.lastApAddTime)
  return Math.min(RESIDENT_AP_MAX, resident.ap + elapsedSec * dormitoryRecoveryRate(dormitory) * 100)
}

/**
 * 制造站外推上限（秒）：剩余可产件数×单件耗时 − 最干员心情秒×生产力 + 最干员心情秒。
 * 公式照搬 App（制造站生产耗尽后干员停止消耗心情）。未收录配方返回 Infinity（无上限，
 * 与 App 对未知配方的处理一致）。
 */
export function manufactureWorkCapSec(room: SklandBuildingManufacture): number {
  const formula = MANUFACTURE_FORMULAS[room.formulaId]
  if (!formula || room.chars.length === 0) {
    return Infinity
  }
  const minApSec = Math.min(...room.chars.map(char => char.ap)) / 100
  const producibleUnits = Math.min(room.remain, Math.floor((room.capacity - room.weight) / formula.weight))
  return producibleUnits * formula.minutes * 60 - minApSec * room.speed + minApSec
}

/** 会客室外推上限（秒）：(完成时刻−更新时刻) + (9−持有线索)×12 小时 */
export function meetingWorkCapSec(room: SklandBuildingMeeting): number {
  return room.completeWorkTime - room.lastUpdateTime + (9 - room.clue.own) * 43_200
}

/** 人力办公室外推上限（秒）：(now−完成时刻) + (2−已刷新次数)×12 小时；未完成本轮时无上限 */
export function hireWorkCapSec(room: SklandBuildingHire, nowSec: number): number {
  if (room.completeWorkTime === -1 || room.completeWorkTime > nowSec) {
    return Infinity
  }
  return nowSec - room.completeWorkTime + (2 - room.refreshCount) * 43_200
}

/** 训练室外推上限（秒）：专精剩余秒；空闲（-1）时不消耗 */
export function trainingWorkCapSec(remainSecs: number): number {
  return remainSecs >= 0 ? remainSecs : 0
}
