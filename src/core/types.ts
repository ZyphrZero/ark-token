/** 森空岛登录凭证（扫码 / 官网 token 换取 / 手动粘贴获得） */
export interface SklandCredential {
  /** 森空岛凭证，请求头 cred */
  cred: string
  /** 森空岛临时 token，签名密钥 */
  token: string
  /** 获取时间（毫秒时间戳） */
  obtainedAt: number
}

/** 一图流第三方 API token（官网「用户中心-第三方 API Token」生成；一个一图流账号仅一对，所有游戏账号共用） */
export interface YituliuTokens {
  /** 读 token，scope 10001，用于同步后校验 */
  readToken?: string
  /** 写 token，scope 10002，用于上传干员数据 */
  writeToken?: string
}

export type SyncStatus = 'syncing' | 'success' | 'failed'

export interface LastSync {
  time: number
  status: SyncStatus
  message?: string
  operatorCount?: number
}

/** 插件内管理的一个明日方舟账号 */
export interface GameAccount {
  /** 本地生成的唯一标识 */
  id: string
  /** 明日方舟 UID */
  uid: string
  nickName: string
  channelMasterId: number
  channelName: string
  skland: SklandCredential
  /** 鹰角官网 token（用于凭证失效时自动刷新），仅官网 token 方式添加时存在 */
  hgToken?: string
  lastSync?: LastSync
}

export interface ExtensionSettings {
  /** 一图流后端地址，默认生产环境；本地调试可改为 http://127.0.0.1:10012 */
  backendBaseUrl: string
  autoSyncEnabled: boolean
  autoSyncIntervalHours: number
  /** 一图流读写 token（一个一图流账号一对，全局共享） */
  yituliuTokens: YituliuTokens
  /** 状态面板：定时拉取森空岛 player/info 刷新本地缓存（与一图流上传同步无关） */
  infoRefreshEnabled: boolean
  /** 面板数据刷新间隔（分钟） */
  infoRefreshIntervalMinutes: number
  /** 刷新全部账号（通知多账号时开启）；关闭时仅刷新当前激活账号 */
  refreshAllAccounts: boolean
  /** 公招完成桌面通知 */
  recruitNotifyEnabled: boolean
  /** 理智完全恢复桌面通知 */
  sanityNotifyEnabled: boolean
  /** 训练室专精完成桌面通知 */
  trainingNotifyEnabled: boolean
}

export interface PluginState {
  accounts: GameAccount[]
  activeAccountId: string | null
  settings: ExtensionSettings
  /** 主密码安全配置；未设置时为 undefined（旧数据兼容，凭据明文存储） */
  security?: SecurityConfig
}

/** 加密信封：AES-GCM 密文，每条信封使用独立随机 IV */
export interface EncryptedEnvelope {
  v: 1
  /** base64 编码的 12 字节 IV */
  iv: string
  /** base64 编码的密文 */
  ct: string
}

/**
 * 主密码安全配置。KDF 参数与校验器都不是机密，可明文保存；
 * 主密码本身与派生密钥永不落盘（密钥仅存浏览器会话内存）。
 */
export interface SecurityConfig {
  version: 1
  kdf: {
    /** PBKDF2-HMAC-SHA256 迭代次数 */
    iterations: number
    /** base64 编码的盐值 */
    salt: string
  }
  /** 用派生密钥加密的固定校验串，用于验证口令而不必解密全部数据 */
  verifier: EncryptedEnvelope
}

/** 森空岛绑定列表中的单个明日方舟角色 */
export interface SklandBinding {
  uid: string
  nickName: string
  isOfficial?: boolean
  isDefault?: boolean
  channelMasterId: number
  channelName: string
}

/** 森空岛返回的干员数据（player/info 的 chars 与 cultivate/player 的 characters 同构） */
export interface SklandChar {
  id: string
  level?: number
  evolvePhase?: number
  mainSkillLevel?: number
  potentialRank?: number
  skills?: { level: number }[]
  equips?: { id: string; level: number }[]
}

/** 森空岛 cultivate/player 响应数据 */
export interface SklandCultivateData {
  items: { id: string; count: number }[]
  characters: SklandChar[]
}

/** 上传给一图流的干员练度（对应后端 OperatorProgressionDataDTO） */
export interface OperatorProgressionData {
  charId: string
  own: boolean
  level: number
  elite: number
  potential: number
  rarity: number
  mainSkill: number
  skill1: number
  skill2: number
  skill3: number
  modX: number
  modY: number
  modD: number
  modA: number
  modB: number
}

/** 上传给一图流的完整报文（对应后端 PlayerInfoDTO） */
export interface PlayerInfoPayload {
  token: string
  uid: string
  nickName: string
  channelName: string
  channelMasterId: number
  operatorDataList: OperatorProgressionData[]
  itemList: { itemId: string; quantity: number }[]
}

/** 一图流 GET /open-api/operator/info 返回的 V2 干员数据 */
export interface OperatorInfoV2 {
  id: string
  level: number
  evolvePhase: number
  mainSkillLevel: number
  potentialRank: number
  skills: { id: string; level: number }[]
  equips: { id: string; type: string; level: number }[]
}
