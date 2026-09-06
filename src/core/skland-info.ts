/**
 * 森空岛 GET /api/v1/game/player/info 响应中状态面板所需的类型。
 * 移植自 rhodes-headquarters 的 src/types/info.ts 与 src/types/building.ts，
 * 仅保留面板消费的字段，未声明字段在运行时仍存在于原始 JSON 中。
 */

/** 博士头像设置 */
export interface SklandAvatar {
  type: 'ICON' | (string & {})
  id: string
  url: string
}

/** 理智（ActionPoint），时间均为 unix 秒 */
export interface SklandActionPoint {
  current: number
  max: number
  lastApAddTime: number
  completeRecoveryTime: number
}

/** 博士基础状态 */
export interface SklandPlayerStatus {
  uid: string
  name: string
  level: number
  avatar: SklandAvatar
  ap: SklandActionPoint
  /** 干员数量 */
  charCnt: number
}

/** 公开招募槽位，时间均为 unix 秒 */
export interface SklandRecruit {
  startTs: number
  finishTs: number
  state: 0 | 1 | 2 | 3
}

/** 剿灭作战周奖励进度 */
export interface SklandCampaign {
  reward: { current: number; total: number }
}

/** 保全派驻周奖励进度 */
export interface SklandTower {
  reward: {
    higherItem: { current: number; total: number }
    lowerItem: { current: number; total: number }
  }
}

/** 日常/周常任务进度 */
export interface SklandRoutine {
  daily: { current: number; total: number }
  weekly: { current: number; total: number }
}

/**
 * 基建进驻干员。
 * ap 为心情值，单位 0.01 秒，满值 8_640_000（= 24 点心情，1 点 = 360_000）；
 * lastApAddTime 为快照对应的服务器时间（unix 秒），当前心情需按设施速率外推，
 * 见 core/status/building.ts。
 */
export interface SklandResidentCharacter {
  charId: string
  ap: number
  lastApAddTime: number
  index: number
}

/** 基建设施公共结构 */
export interface SklandBuildingRoom {
  slotId: string
  slotState?: number
  chars: SklandResidentCharacter[]
  level: number
}

/** 无人机 */
export interface SklandLabor {
  value: number
  maxValue: number
  /** 从 lastUpdateTime 起恢复至满尚需的秒数，已含中枢进驻技能的充能速度加成（见 status/building.ts 的 droneRecoverySeconds）；已满时为 0 */
  remainSecs: number
  lastUpdateTime: number
}

/** 控制中枢 */
export interface SklandBuildingControl extends SklandBuildingRoom {}

/** 发电站 */
export interface SklandBuildingPower extends SklandBuildingRoom {}

/** 制造站（speed 1 为 100% 生产力） */
export interface SklandBuildingManufacture extends SklandBuildingRoom {
  speed: number
  complete: number
  capacity: number
  weight: number
  formulaId: string | number
  remain: number
  completeWorkTime: number
  lastUpdateTime: number
}

/** 贸易站 */
export interface SklandBuildingTrading extends SklandBuildingRoom {
  stock: {
    delivery: { id: number; count: number; type: 'MATERIAL' | 'DIAMOND_SHD' }[]
    gain: { id: number; count: number; type: 'GOLD' | 'DIAMOND' }[]
    instId: number
    type: 'O_GOLD' | 'O_DIAMOND'
  }[]
  stockLimit: number
  strategy: 'O_GOLD' | 'O_DIAMOND'
  completeWorkTime: number
  lastUpdateTime: number
}

/** 宿舍 */
export interface SklandBuildingDormitory extends SklandBuildingRoom {
  comfort: number
}

/** 人力办公室 */
export interface SklandBuildingHire extends SklandBuildingRoom {
  state: number
  refreshCount: number
  completeWorkTime: number
}

/** 线索系列：会客室 1-7 号线索对应的阵营，编号顺序即列表顺序 */
export type ClueSeries = 'RHINE' | 'PENGUIN' | 'BLACKSTEEL' | 'URSUS' | 'GLASGOW' | 'KJERAG' | 'RHODES'

/** 会客室线索板状态（clue 对象，见抓包样本 skland_dump/building_api/meeting-clue-compact-sample.json） */
export interface SklandMeetingClue {
  /** 已置入线索板的系列名，紧凑列表（非按槽位稀疏、无占位元素），槽位 i 是否置入须按系列名成员判断 */
  board: ClueSeries[]
  /** 自有库数量（含已置入），上限 10 */
  own: number
  received: number
  dailyReward: boolean
  needReceive: number
  shareCompleteTime: number
  /** 线索交流进行中；注意开启交流不代表 board 已集齐 7 条 */
  sharing: boolean
}

/** 会客室线索板 */
export interface SklandBuildingMeeting extends SklandBuildingRoom {
  clue: SklandMeetingClue
  lastUpdateTime: number
  completeWorkTime: number
}

/** 训练室（进驻结构略有不同，单独声明所需字段） */
export interface SklandBuildingTraining {
  slotId: string
  level: number
  /** 学员；空闲时对象仍在但 targetSkill=-1，未进驻时为 null */
  trainee: { charId: string; ap: number; lastApAddTime?: number; /** 正在专精的技能在 skills 数组中的下标（0 起，非 1 起槽位号；训练完成实测 skills[targetSkill] 专精 +1），-1 = 空闲 */ targetSkill: number } | null
  trainer: { charId: string; ap: number; lastApAddTime?: number } | null
  /** 剩余训练点数（未按速度折算），-1 = 空闲 */
  remainPoint: number
  /** 训练速度倍率（1 + 加成），1.35 即 +35% */
  speed: number
  lastUpdateTime: number
  /** 剩余秒数，以响应 currentTs 为基准（非 lastUpdateTime，见 status/building.ts 的 trainingCompleteTimeSec），-1 = 空闲 */
  remainSecs: number
}

/** 基建整体 */
export interface SklandBuilding {
  control: SklandBuildingControl
  powers: SklandBuildingPower[]
  manufactures: SklandBuildingManufacture[]
  tradings: SklandBuildingTrading[]
  dormitories: SklandBuildingDormitory[]
  hire: SklandBuildingHire | null
  training: SklandBuildingTraining | null
  meeting: SklandBuildingMeeting | null
  labor: SklandLabor
  /** 服务端标记的疲劳干员（快照时刻心情极低的干员），App 客户端会在此基础上按设施外推合并计数 */
  tiredChars?: SklandResidentCharacter[]
  /** 家具总数 */
  furniture?: { total: number }
  /** 电梯/廊道等结构房间（不参与进驻与心情，快照中恒为 1 级） */
  elevators?: { slotId: string; slotState?: number; level: number }[]
  corridors?: { slotId: string; slotState?: number; level: number }[]
  // 注意：快照不含加工站（WORKSHOP），工作区房间数/进驻上限会比游戏内显示各少 1，见 core/status/building.ts 的 buildingOverview
}

/** player/info 中面板渲染所需的干员条目（用于基建进驻干员头像、训练室技能详情） */
export interface SklandPanelCharacter {
  charId: string
  /** 当前皮肤，头像 URL 的一部分 */
  skinId: string
  level: number
  evolvePhase: 0 | 1 | 2
  /** 各技能槽位（顺序 1-3）：skillId 与当前专精等级（0-3），槽位顺序与本地干员表一致 */
  skills?: { id: string; specializeLevel: number }[]
}

/** player/info 响应（裁剪版） */
export interface SklandBindingInfo {
  currentTs: number
  status: SklandPlayerStatus
  recruit: SklandRecruit[]
  building: SklandBuilding
  campaign: SklandCampaign
  tower: SklandTower
  routine: SklandRoutine
  chars: SklandPanelCharacter[]
}
