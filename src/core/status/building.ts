import type { SklandBuildingManufacture, SklandLabor, SklandResidentCharacter } from '../skland-info'

/** 无人机恢复速率：每 360 秒（6 分钟）恢复 1 架 */
const DRONE_RECOVERY_SECONDS = 360

/** 宿舍心情满值（秒）：86400 秒 = 24 小时 */
export const RESIDENT_AP_MAX_SECONDS = 86_400

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
 * 进驻干员心情百分比（0-100）。
 * 与 rhodes-headquarters ResidentCharacter.vue 一致：ap<=0 且 index!==-1 视为已休息满。
 */
export function residentMoodPercent(resident: SklandResidentCharacter): number {
  if (resident.ap <= 0 && resident.index !== -1) {
    return 100
  }
  return Math.max(0, Math.min(100, (resident.ap / RESIDENT_AP_MAX_SECONDS) * 100))
}
