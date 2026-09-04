import type { FetchLike } from '../skland'
import {
  authorizeAssistSupport,
  fetchAssistInfo,
  fetchAssistUserInfo,
  searchAssist
} from '../sklandAssist'
import {
  applyEvolvePhaseChange,
  buildAssistSearchRequest,
  createDefaultFilter,
  filterAssistCharacters,
  type AssistFilter
} from './filter'
import type { AssistCharacter, AssistInfo, AssistSearchResult, AssistUserInfo, SklandAck } from '../sklandAssist'

export {
  addFriendByUid,
  authorizeAssistSupport,
  fetchAssistInfo,
  fetchAssistUserInfo,
  searchAssist
} from '../sklandAssist'

export * from './assets'
export * from './filter'

export type {
  AssistCharacter,
  AssistCharacterResult,
  AssistEquip,
  AssistInfo,
  AssistLevelMax,
  AssistAvatar,
  AssistSearchEquipResult,
  AssistSearchLevel,
  AssistSearchPlayer,
  AssistSearchRequest,
  AssistSearchResult,
  AssistSearchSkill,
  AssistSkill,
  AssistUserInfo,
  SklandAck
} from '../sklandAssist'

/**
 * 开箱即用的助战检索会话：一次调用完成"拉干员目录 + 校验游戏身份（可选自动授权）"，
 * 之后用 `createFilter` 生成官方语义的默认筛选，改完调 `search` 即可检索。
 *
 * @example
 * ```ts
 * const session = await createAssistSearchSession(uid, cred, token, { autoAuthorize: true })
 * const filter = session.createFilter(session.characters[0].id)
 * const result = await session.search(filter)   // 官方默认条件：最高精英化/第一技能/证章
 * ```
 */
export interface AssistSearchSession {
  /** 干员目录（assist/info，已按官方规则排序） */
  info: AssistInfo
  /** 玩家游戏身份（isAuth=false 表示未开启游戏关系，见 authorize） */
  userInfo: AssistUserInfo
  /** 排序后的干员列表（新干员置顶 → 稀有度降序 → 职业顺序 → id 升序） */
  characters: AssistCharacter[]
  /** 构建选中干员后的默认筛选（最高精英化 + 不限、第一个技能 + 不限、证章 + 0） */
  createFilter(charId: string): AssistFilter
  /** 切换精英化并应用官方级联（等级重置/技能截断降档/模组增删） */
  changeEvolvePhase(filter: AssistFilter, phase: number): AssistFilter
  /** 组装请求并发起检索（单次返回 4 条，无分页） */
  search(filter: AssistFilter): Promise<AssistSearchResult>
  /** 开启游戏关系（官方"身份认证"）；返回后可用 refreshUserInfo 确认 isAuth */
  authorize(): Promise<SklandAck>
  /** 重新拉取游戏身份（授权成功后调用） */
  refreshUserInfo(): Promise<AssistUserInfo>
}

export async function createAssistSearchSession(
  uid: string,
  cred: string,
  token: string,
  options: {
    fetchFn?: FetchLike
    /** 测试注入的固定时间戳；缺省每次请求取当前时间 */
    nowMs?: number
    /** isAuth=false 时自动开启游戏关系并重拉身份（默认 false，由调用方自行引导用户确认） */
    autoAuthorize?: boolean
  } = {}
): Promise<AssistSearchSession> {
  const fetchFn = options.fetchFn
  const nowMs = () => options.nowMs ?? Date.now()
  const [info, initialUserInfo] = await Promise.all([
    fetchAssistInfo(cred, token, fetchFn, nowMs()),
    fetchAssistUserInfo(uid, cred, token, fetchFn, nowMs())
  ])

  let userInfo = initialUserInfo
  if (!userInfo.isAuth && options.autoAuthorize) {
    await authorizeAssistSupport(cred, token, fetchFn, nowMs())
    userInfo = await fetchAssistUserInfo(uid, cred, token, fetchFn, nowMs())
  }

  const characters = filterAssistCharacters(info.characters)
  const characterById = new Map(characters.map(character => [character.id, character]))

  return {
    info,
    userInfo,
    characters,
    createFilter: charId => createDefaultFilter(info, characterById.get(charId)),
    changeEvolvePhase: (filter, phase) => applyEvolvePhaseChange(filter, info, characterById.get(filter.charId), phase),
    search: filter => searchAssist(buildAssistSearchRequest(filter, uid), cred, token, fetchFn, nowMs()),
    authorize: () => authorizeAssistSupport(cred, token, fetchFn, nowMs()),
    refreshUserInfo: async () => {
      userInfo = await fetchAssistUserInfo(uid, cred, token, fetchFn, nowMs())
      return userInfo
    }
  }
}
