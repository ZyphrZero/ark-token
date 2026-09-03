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

/** 基建进驻干员（ap 为心情剩余秒数，满值 86400） */
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

/** 会客室线索板 */
export interface SklandBuildingMeeting extends SklandBuildingRoom {
  clue: {
    board: ('RHINE' | 'PENGUIN' | 'BLACKSTEEL' | 'URSUS' | 'GLASGOW' | 'KJERAG' | 'RHODES')[]
    own: number
    received: number
    dailyReward: boolean
    needReceive: number
    shareCompleteTime: number
    sharing: boolean
  }
  lastUpdateTime: number
  completeWorkTime: number
}

/** 训练室（进驻结构略有不同，单独声明所需字段） */
export interface SklandBuildingTraining {
  slotId: string
  level: number
  trainee: { charId: string; ap: number; targetSkill: number } | null
  trainer: { charId: string; ap: number } | null
  remainPoint: number
  speed: number
  lastUpdateTime: number
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
}

/** player/info 中面板渲染所需的干员条目（用于基建进驻干员头像） */
export interface SklandPanelCharacter {
  charId: string
  /** 当前皮肤，头像 URL 的一部分 */
  skinId: string
  level: number
  evolvePhase: 0 | 1 | 2
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
