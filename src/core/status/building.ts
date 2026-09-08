import type {
  ClueSeries,
  SklandBuilding,
  SklandBuildingDormitory,
  SklandBuildingHire,
  SklandBuildingManufacture,
  SklandBuildingMeeting,
  SklandBuildingPower,
  SklandBuildingTrading,
  SklandBuildingTraining,
  SklandLabor,
  SklandMeetingClue,
  SklandPanelCharacter,
  SklandResidentCharacter
} from '../skland-info'
import slimTableJson from '../../assets/operator-table.slim.json'
import droneChargeTableJson from '../../assets/drone-charge-table.json'

/** 精简干员表（含技能名第三元素，构建口径见 scripts/build-operator-table.mjs） */
const operatorSlimTable = slimTableJson as unknown as Record<
  string,
  [number, Record<string, string> | null, (string[] | null)?]
>

/** 无人机基准恢复速率：无充能加成时每 360 秒（6 分钟）恢复 1 架 */
const DRONE_BASE_RECOVERY_SECONDS = 360

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
 * 无人机实际恢复速率（秒/架），由快照自描述：remainSecs 以 lastUpdateTime 为基准、
 * 覆盖 (maxValue − value) 架的恢复耗时，发电站的充能加成（基础 5%/站 + 进驻干员
 * 基建技能）已含在其中；充能加成只来自发电站，控制中枢不产生（见 powerPlantChargePercent）。
 * 抓包实测（skland_dump/building_api/drone-rate-sample.json）：
 * remainSecs=41351、剩余 184 架 → 224.7 秒/架 = 基准 360s ÷ 1.6（+60% 加成），
 * 且同一轮恢复的两份快照 lastUpdateTime + remainSecs 恒等（锚点核实）。
 * 快照已满或 remainSecs 缺失（0/-1）时回退基准速率。
 */
export function droneRecoverySeconds(labor: SklandLabor): number {
  const remaining = labor.maxValue - labor.value
  if (labor.remainSecs > 0 && remaining > 0) {
    return labor.remainSecs / remaining
  }
  return DRONE_BASE_RECOVERY_SECONDS
}

/**
 * 无人机充能速度加成百分比（如 60 表示 +60%），基准 360 秒/架。
 * 单快照无法精确求速率（value 为下取整值，真实剩余架数 R ∈ (D−1, D]，D = maxValue − value，
 * 速率估计 remainSecs/D 系统性偏高、直接四舍五入会把 +60% 显示成 +61%），故取
 * 加成区间 (360(D−1)/remainSecs − 1, 360D/remainSecs − 1] 的中点再取整——误差对称，
 * 三份抓包快照与边界构造均收敛到真实值。
 * 剩余架数不足 30（区间宽度 > ~5%，临近充满）或快照无法推导（已满 / remainSecs ≤ 0）
 * 时返回 null，调用方不应显示加成徽标。
 */
export function droneSpeedBonusPercent(labor: SklandLabor): number | null {
  const remaining = labor.maxValue - labor.value
  if (labor.remainSecs <= 0 || remaining < 30) {
    return null
  }
  const bonusLow = (DRONE_BASE_RECOVERY_SECONDS * (remaining - 1)) / labor.remainSecs - 1
  const bonusHigh = (DRONE_BASE_RECOVERY_SECONDS * remaining) / labor.remainSecs - 1
  // + 0 归一化 Math.round 可能产生的 -0
  return Math.round(((bonusLow + bonusHigh) / 2) * 100) + 0
}

/**
 * 无人机数量实时推算：value + round(elapsedSec / 实际速率)，封顶 maxValue。
 * 速率含发电站充能加成（见 droneRecoverySeconds）；value 为下取整的快照值，
 * 推算误差不超过 1 架。
 */
export function computeDroneCount(labor: SklandLabor, nowMs: number): number {
  if (labor.value >= labor.maxValue) {
    return labor.maxValue
  }
  const elapsedSec = Math.max(0, Math.floor(nowMs / 1000) - labor.lastUpdateTime)
  return Math.min(labor.value + Math.round(elapsedSec / droneRecoverySeconds(labor)), labor.maxValue)
}

/**
 * 发电站发电量（下标 0 = 1 级）：游戏数据 building_data.json 的
 * rooms.POWER.phases[].electricity，2026-09-08 核实为 60/130/270。
 * 源表数值变动时 scripts/build-drone-charge-table.mjs 会构建失败以提醒同步。
 */
export const POWER_ELECTRICITY: readonly number[] = [60, 130, 270]

/** 发电站发电量（Lv1/2/3 → 60/130/270），越界等级按最低/最高级收敛 */
export function powerOutput(level: number): number {
  const clamped = Math.min(Math.max(level, 1), POWER_ELECTRICITY.length)
  return POWER_ELECTRICITY[clamped - 1] ?? 0
}

/**
 * 单站发电量占全基地总供电的百分比（游戏内「270(33.3%)」括号中的值）。
 * 分母为快照内全部发电站发电量之和（3 站 Lv3 → 810，单站 33.3%）；
 * 无发电站时返回 null。
 */
export function powerSharePercent(rooms: SklandBuildingPower[], room: SklandBuildingPower): number | null {
  const total = rooms.reduce((sum, item) => sum + powerOutput(item.level), 0)
  return total > 0 ? (powerOutput(room.level) / total) * 100 : null
}

/**
 * 发电站的基础无人机充能加成（+5%）：游戏数据 building_data.json 的
 * powerData.basicSpeedBuff = 0.05，2026-09-08 核实。
 * 空置发电站是否仍提供这 5% 抓包无法判定（样本 3 站全进驻），现按
 * 「需有进驻干员」处理，与 PRTS 发电站房间说明一致。
 */
export const POWER_PLANT_BASE_CHARGE_PERCENT = 5

/** 充能技能档位（表结构与生成口径见 scripts/build-drone-charge-table.mjs） */
export interface DroneChargeTier {
  /** 解锁所需精英阶段 */
  phase: number
  /** 解锁所需该阶段等级 */
  level: number
  /** 无条件生效的加成百分点（条件型技能为 0） */
  percent: number
  /** 技能名 */
  name: string
  /** per10Drone：每 10 架无人机上限 +1%（percent 为上限）；ramp：percent 为爬升终值 */
  scale?: 'per10Drone' | 'ramp'
  /** 依赖其他干员进驻位置的附加加成，运行时不计入（见 partial） */
  extra?: { percent: number; max?: number; requires: string }
}

/** 充能技能表：charId → 技能槽[]（不同槽可叠加，每槽为同槽升级链、按解锁条件升序） */
export type DroneChargeTable = Record<string, DroneChargeTier[][]>

const droneChargeTable = droneChargeTableJson as DroneChargeTable

/** 档位实际数值：per10Drone 按无人机上限折算（每 10 架 +1%，封顶 percent）；ramp 取长期终值 */
function tierPercent(tier: DroneChargeTier, droneMax: number): number {
  if (tier.scale === 'per10Drone') {
    return Math.min(Math.floor(droneMax / 10), tier.percent)
  }
  return tier.percent
}

/** 干员的发电站充能技能加成 */
export interface DroneChargeSkill {
  /** 加成百分点合计 */
  percent: number
  /** 生效的技能名（多槽时按槽位顺序） */
  names: string[]
  /** 该干员还有依赖其他干员进驻的附加加成未计入，真实值可能更高 */
  partial: boolean
}

/**
 * 进驻干员的发电站充能技能加成：每个技能槽取「练度已满足的最后一档」，再跨槽求和。
 * 练度取自快照 chars[] 的 evolvePhase/level——同槽的 α/β 是替换关系（β 需精英 2），
 * 高精英阶段自动满足低阶条件；干员不在表中（无充能技能）时返回 0。
 * 条件型加成（如「凯尔希进驻中枢 +5%」）需要快照外的阵营/子职业元数据，不计入，
 * 改为置 partial 由调用方提示。
 */
export function powerPlantSkillPercent(
  char: SklandPanelCharacter | undefined,
  droneMax: number,
  table: DroneChargeTable = droneChargeTable
): DroneChargeSkill {
  const slots = char ? table[char.charId] : undefined
  if (!char || !slots) {
    return { percent: 0, names: [], partial: false }
  }
  let percent = 0
  let partial = false
  const names: string[] = []
  for (const tiers of slots) {
    const unlocked = tiers.filter(
      tier => char.evolvePhase > tier.phase || (char.evolvePhase === tier.phase && char.level >= tier.level)
    )
    const active = unlocked[unlocked.length - 1]
    if (!active) {
      continue
    }
    percent += tierPercent(active, droneMax)
    names.push(active.name)
    partial = partial || active.extra !== undefined
  }
  return { percent, names, partial }
}

/** 发电站单站充能加成明细 */
export interface PowerPlantCharge {
  /** 单站合计加成百分点（基础 + 进驻干员技能） */
  percent: number
  /** 基础部分（POWER_PLANT_BASE_CHARGE_PERCENT） */
  base: number
  /** 进驻干员技能部分 */
  skill: number
  /** 生效的技能名 */
  skillNames: string[]
  /** 存在未计入的条件型加成，真实值可能更高 */
  partial: boolean
}

/**
 * 发电站对无人机的充能速度加成：基础 5% + 进驻干员基建技能，空闲发电站返回 null。
 * 全基地总加成 = 各发电站之和，与 droneSpeedBonusPercent(labor) 相互印证
 * （抓包实测账号 20%+15%+25% = 60%，与 labor 推导的 +60% 一致，见
 * docs/BUILDING_MOOD_API.md 第六节）。控制中枢不产生充能加成。
 */
export function powerPlantChargePercent(
  room: SklandBuildingPower,
  chars: SklandPanelCharacter[] | undefined,
  labor: SklandLabor,
  table: DroneChargeTable = droneChargeTable
): PowerPlantCharge | null {
  if (room.chars.length === 0) {
    return null
  }
  let skill = 0
  let partial = false
  const skillNames: string[] = []
  // 发电站容量恒 1（ROOM_CAPACITY.power），按 chars 求和以兼容将来的容量变化
  for (const resident of room.chars) {
    const bonus = powerPlantSkillPercent(
      chars?.find(char => char.charId === resident.charId),
      labor.maxValue,
      table
    )
    skill += bonus.percent
    skillNames.push(...bonus.names)
    partial = partial || bonus.partial
  }
  return {
    percent: POWER_PLANT_BASE_CHARGE_PERCENT + skill,
    base: POWER_PLANT_BASE_CHARGE_PERCENT,
    skill,
    skillNames,
    partial
  }
}

/**
 * 提取 slotId 中的槽位数字（真实格式为基建全局槽位号 slot_N，如 slot_25 → 25，
 * 样本见 skland_dump/building_api/player-info-slot-sample.json）。
 * 房间面板渲染顺序与同类编号均以此为依据；无数字时返回 null。
 */
export function slotNumberOf(slotId: string): number | null {
  const match = /\d+/.exec(slotId)
  return match ? Number(match[0]) : null
}

/**
 * 同类房间的游戏内显示序号（制造站1/贸易站1、宿舍1-4、发电站1-3…）：
 * 同类房间按槽位数字升序排名（1 起），与游戏内同类房间沿基建槽位顺序编号一致；
 * slotId 无数字或不在列表中返回 null。
 * 多间设施（制造/贸易/宿舍/发电）无论数量始终编号；单间设施（会客/人力/训练/中枢）
 * 由调用方不调用本函数来保持无序号。
 */
export function roomSlotNumber(rooms: { slotId: string }[], slotId: string): number | null {
  const target = slotNumberOf(slotId)
  if (target === null) {
    return null
  }
  const sorted = rooms
    .map(room => slotNumberOf(room.slotId))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
  const index = sorted.indexOf(target)
  return index >= 0 ? index + 1 : null
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

/**
 * 线索板槽位 1-7 对应的系列，顺序即编号。
 * 编号口径与游戏数据 clue_data.json 一致（1 莱茵生命 … 7 罗德岛），
 * board 紧凑列表语义见抓包样本 skland_dump/building_api/meeting-clue-compact-sample.json。
 */
export const CLUE_SERIES: readonly ClueSeries[] = ['RHINE', 'PENGUIN', 'BLACKSTEEL', 'URSUS', 'GLASGOW', 'KJERAG', 'RHODES']

/** 自有库上限（含已置入线索），游戏内显示为 N/10 */
export const CLUE_OWN_MAX = 10

/**
 * 各槽位（1-7）是否已置入线索。
 * board 是已置入系列的紧凑列表而非按槽位稀疏数组（实测置入 1/3/4/7 号位时
 * board = [RHINE, BLACKSTEEL, URSUS, RHODES]），故必须按系列名做成员判断，
 * 不能用 board[index] 下标判断——那会把置入位置错读为前 N 个槽位。
 */
export function clueBoardSlots(clue: SklandMeetingClue): boolean[] {
  return CLUE_SERIES.map(series => clue.board.includes(series))
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

/**
 * 训练完成时刻（unix 秒）；remainSecs 以响应 currentTs 为基准，配对使用同一响应的两个字段。
 * 实测（skland_dump/building_api/training-remainsecs-sample.json）：
 * remainSecs ≈ remainPoint/speed − (currentTs − lastUpdateTime)，故
 * currentTs + remainSecs 与 lastUpdateTime + remainPoint/speed 算得的完成时刻一致（误差 <1 秒）。
 * remainSecs < 0（空闲）返回 -1。
 */
export function trainingCompleteTimeSec(training: SklandBuildingTraining, currentTs: number): number {
  if (training.remainSecs < 0) {
    return -1
  }
  return currentTs + training.remainSecs
}

/** 训练速度加成百分比：speed 1.35 → 35 */
export function trainingSpeedBonusPercent(speed: number): number {
  return Math.round((speed - 1) * 100)
}

/** charId → 各槽位技能名表（精简干员表第三元素，槽位顺序与森空岛 chars[].skills[] 一致） */
export type SkillNameTable = Record<string, readonly string[] | null | undefined>

const skillNameTable: SkillNameTable = Object.fromEntries(
  Object.entries(operatorSlimTable).map(([charId, entry]) => [charId, entry[2]])
)

/** 专精等级 → 中文文案（与游戏内「专精一/二/三」一致） */
export function specializeLevelText(level: number): string {
  return `专精${['一', '二', '三'][level - 1] ?? level}`
}

/** 训练室正在专精的技能详情 */
export interface TrainingSkillInfo {
  /** 技能槽位（1-3） */
  slot: number
  skillId: string
  /** 技能名；本地表未收录该槽（源表与补充表都缺，极新干员）时为 null */
  skillName: string | null
  /** 学员该技能当前专精等级（0-3，player/info chars[].skills[].specializeLevel） */
  currentLevel: number
  /** 本次训练目标的专精等级（1-3）= 当前等级 + 1 */
  targetLevel: number
}

/**
 * 训练室正在专精的技能名与目标专精等级。
 * 数据链在同一 player/info 响应内闭合（抓包核实 skland_dump/building_api/training-skill-sample.json）：
 * training.trainee.targetSkill 为 **skills 数组下标（0 起，-1 = 空闲）**——同一轮训练
 * （targetSkill=2）完成后实测 skills[2]（第 3 技能）专精 0→1 而 skills[1] 不变，据此核实；
 * 训练目标等级 = 该技能当前 specializeLevel + 1；技能名查本地干员表（skills 槽位顺序两边
 * skillId 逐一对应，下标同义）。
 */
export function trainingSkillInfo(
  training: SklandBuildingTraining,
  chars: SklandPanelCharacter[] | undefined,
  nameTable: SkillNameTable = skillNameTable
): TrainingSkillInfo | null {
  const trainee = training.trainee
  const index = trainee?.targetSkill ?? -1
  if (!trainee || index < 0) {
    return null
  }
  const skill = chars?.find(char => char.charId === trainee.charId)?.skills?.[index]
  if (!skill) {
    return null
  }
  return {
    slot: index + 1,
    skillId: skill.id,
    skillName: nameTable[trainee.charId]?.[index] ?? null,
    currentLevel: skill.specializeLevel,
    targetLevel: skill.specializeLevel + 1
  }
}

/** 工作区设施类型（不含宿舍；加工站不在森空岛快照中） */
export type WorkRoomType = 'control' | 'power' | 'manufacture' | 'trading' | 'hire' | 'training' | 'meeting'

/** 全部设施类型 */
export type RoomType = WorkRoomType | 'dormitory'

/**
 * 各设施每级可进驻人数（charCapacity），下标 0 = 1 级。
 * 来源：游戏数据 building_data.json rooms.*.phases[].maxStationedNum（2026-09-06 核实）；
 * 已用抓包账号对账：13 间工作区房 + 加工站 1 间 = 游戏「房间数量 14」，容量 31+1 = 32。
 */
export const ROOM_CAPACITY: Record<RoomType, readonly number[]> = {
  control: [1, 2, 3, 4, 5],
  power: [1, 1, 1],
  manufacture: [1, 2, 3],
  trading: [1, 2, 3],
  hire: [1, 1, 1],
  training: [2, 2, 2],
  meeting: [2, 2, 2],
  dormitory: [5, 5, 5, 5, 5]
}

/** 指定设施在 level 级的可进驻人数，越界等级按最低/最高级收敛 */
export function roomCapacity(room: RoomType, level: number): number {
  const table = ROOM_CAPACITY[room]
  const clamped = Math.min(Math.max(level, 1), table.length)
  return table[clamped - 1] ?? 0
}

/** 基建「工作区情况」概况：进驻干员/进驻上限/房间数量（工作区口径，不含宿舍） */
export interface BuildingOverview {
  /** 工作区房间数；森空岛快照不含加工站，建了加工站的基地会比游戏内显示少 1 */
  rooms: number
  /** 工作区进驻干员数（训练室教官/学员不在 chars 中，已单独计入） */
  residents: number
  /** 工作区进驻上限 */
  capacity: number
}

/** 汇总工作区进驻情况；宿舍为非工作区不计入 */
export function buildingOverview(building: SklandBuilding): BuildingOverview {
  const counts: { room: WorkRoomType; level: number; residents: number }[] = []
  if (building.control) {
    counts.push({ room: 'control', level: building.control.level, residents: building.control.chars.length })
  }
  for (const room of building.powers) {
    counts.push({ room: 'power', level: room.level, residents: room.chars.length })
  }
  for (const room of building.manufactures) {
    counts.push({ room: 'manufacture', level: room.level, residents: room.chars.length })
  }
  for (const room of building.tradings) {
    counts.push({ room: 'trading', level: room.level, residents: room.chars.length })
  }
  if (building.hire) {
    counts.push({ room: 'hire', level: building.hire.level, residents: building.hire.chars.length })
  }
  if (building.meeting) {
    counts.push({ room: 'meeting', level: building.meeting.level, residents: building.meeting.chars.length })
  }
  let rooms = counts.length
  let residents = counts.reduce((sum, c) => sum + c.residents, 0)
  let capacity = counts.reduce((sum, c) => sum + roomCapacity(c.room, c.level), 0)
  if (building.training) {
    // 训练室结构特殊：教官/学员独立于 chars 计数
    rooms += 1
    residents += (building.training.trainer ? 1 : 0) + (building.training.trainee ? 1 : 0)
    capacity += roomCapacity('training', building.training.level)
  }
  return { rooms, residents, capacity }
}

/** 贸易站订单策略名（与游戏内文案一致） */
export function tradingStrategyName(strategy: SklandBuildingTrading['strategy']): string {
  return strategy === 'O_DIAMOND' ? '开采协力' : '龙门商法'
}
