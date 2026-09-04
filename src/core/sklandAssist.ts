import { buildSklandHeaders, describeSklandError } from './skland'
import { SklandError } from './errors'
import type { FetchLike } from './skland'

const SKLAND_DOMAIN = 'https://zonai.skland.com'
const ASSIST_INFO_PATH = '/api/v1/game/assist/info'
const ASSIST_USER_INFO_PATH = '/api/v1/game/assist/user-info'
const ASSIST_SEARCH_PATH = '/api/v1/game/assist/search'
const FRIEND_PATH = '/api/v1/game/friend'

export interface AssistSkill {
  id: string
  name?: string
}

export interface AssistEquip {
  id: string
  name?: string
  level?: number
  typeName?: string
  shiningColor?: string
}

export interface AssistCharacter {
  id: string
  name: string
  rarity: number
  profession: string
  skills: AssistSkill[]
  equips: AssistEquip[]
  [key: string]: unknown
}

export interface AssistLevelMax {
  evolvePhase: number
  rarity: number
  maxLevel: number
  [key: string]: unknown
}

export interface AssistInfo {
  characters: AssistCharacter[]
  levelMax: AssistLevelMax[]
}

export interface AssistAvatar {
  type: string
  id: string
  url?: string
  [key: string]: unknown
}

export interface AssistUserInfo {
  gameNickname: string
  gameAvatar?: AssistAvatar
  isOfficial: boolean
  isAuth: boolean
  [key: string]: unknown
}

export interface AssistSearchLevel {
  evolvePhase: number
  level: number
}

export interface AssistSearchSkill {
  id: string
  level: number
}

export interface AssistSearchEquip {
  id: string
  level: number
}

export interface AssistSearchRequest {
  uid: string
  charId: string
  level: AssistSearchLevel
  skill: AssistSearchSkill
  equip: AssistSearchEquip
}

export interface AssistCharacterResult {
  charId: string
  skinId: string
  level: number
  evolvePhase: number
  potentialRank: number
  skillId: string
  mainSkillLvl: number
  rarity: number
  specializeLevel: number
  equip: AssistSearchEquipResult | null
  profession: string
  [key: string]: unknown
}

export interface AssistSearchEquipResult extends AssistSearchEquip {
  locked?: boolean
  typeName?: string
  shiningColor?: string
}

export interface AssistSearchPlayer {
  uid: string
  name: string
  level: number
  avatar?: AssistAvatar
  lastOnlineTs: string
  userId: string
  assistChars: (AssistCharacterResult | undefined)[]
  hasSend: boolean
  gameDetailOn: boolean
  [key: string]: unknown
}

export interface AssistSearchResult {
  list: AssistSearchPlayer[]
}

export interface FriendRequestResult {
  code: number
  message?: string
  msg?: string
  timestamp?: string
}

interface SklandEnvelope<T> {
  code: number
  message?: string
  msg?: string
  timestamp?: string
  data?: T
}

interface EncodedContent {
  content?: string
}

function assertNonEmpty(value: string, name: string): void {
  if (!value.trim()) {
    throw new TypeError(`${name} 不能为空`)
  }
}

function decodeBase64Json<T>(content: string, endpoint: string): T {
  if (!content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 === 1) {
    throw new SklandError(`森空岛接口响应无效（${endpoint}：content 不是有效的 Base64）`)
  }

  try {
    const binary = atob(content)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    return JSON.parse(text) as T
  } catch {
    throw new SklandError(`森空岛接口响应无效（${endpoint}：content 不是有效的 JSON）`)
  }
}

interface RequestOptions {
  method: 'GET' | 'POST'
  body?: string
}

async function requestAssistEnvelope<T>(
  url: string,
  path: string,
  params: string | null,
  cred: string,
  token: string,
  fetchFn: FetchLike,
  nowMs: number,
  options: RequestOptions
): Promise<SklandEnvelope<T>> {
  const headers: Record<string, string> = buildSklandHeaders(path, params, cred, token, nowMs)
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetchFn(url, {
    method: options.method,
    headers,
    ...(options.body === undefined ? {} : { body: options.body })
  })

  if (!response.ok) {
    throw new SklandError(`森空岛接口请求失败（HTTP ${response.status}）`)
  }

  const envelope = (await response.json()) as SklandEnvelope<T>
  if (envelope.code !== 0) {
    throw new SklandError(describeSklandError(envelope.code, envelope.message ?? envelope.msg ?? '未知错误'), envelope.code)
  }
  return envelope
}

async function requestAssist<T>(
  url: string,
  path: string,
  params: string | null,
  cred: string,
  token: string,
  fetchFn: FetchLike,
  nowMs: number,
  options: RequestOptions
): Promise<T> {
  const envelope = await requestAssistEnvelope<T>(url, path, params, cred, token, fetchFn, nowMs, options)
  return envelope.data as T
}

async function requestEncoded<T>(
  url: string,
  path: string,
  params: string | null,
  cred: string,
  token: string,
  fetchFn: FetchLike,
  nowMs: number,
  options: RequestOptions
): Promise<T> {
  const data = await requestAssist<EncodedContent>(url, path, params, cred, token, fetchFn, nowMs, options)
  if (!data || typeof data.content !== 'string') {
    throw new SklandError(`森空岛接口响应无效（${path}：缺少 Base64 content）`)
  }
  return decodeBase64Json<T>(data.content, path)
}

/** 获取助战检索所需的干员目录和等级上限。 */
export function fetchAssistInfo(
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch,
  nowMs = Date.now()
): Promise<AssistInfo> {
  return requestEncoded<AssistInfo>(
    `${SKLAND_DOMAIN}${ASSIST_INFO_PATH}`,
    ASSIST_INFO_PATH,
    null,
    cred,
    token,
    fetchFn,
    nowMs,
    { method: 'GET' }
  )
}

/** 获取指定明日方舟 UID 的游戏身份信息。 */
export async function fetchAssistUserInfo(
  uid: string,
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch,
  nowMs = Date.now()
): Promise<AssistUserInfo> {
  assertNonEmpty(uid, 'uid')
  const params = `uid=${encodeURIComponent(uid)}`
  return requestEncoded<AssistUserInfo>(
    `${SKLAND_DOMAIN}${ASSIST_USER_INFO_PATH}?${params}`,
    ASSIST_USER_INFO_PATH,
    params,
    cred,
    token,
    fetchFn,
    nowMs,
    { method: 'GET' }
  )
}

/** 按干员、等级、技能和模组条件检索助战玩家。 */
export async function searchAssist(
  request: AssistSearchRequest,
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch,
  nowMs = Date.now()
): Promise<AssistSearchResult> {
  assertNonEmpty(request.uid, 'uid')
  const body = JSON.stringify(request)
  return requestEncoded<AssistSearchResult>(
    `${SKLAND_DOMAIN}${ASSIST_SEARCH_PATH}`,
    ASSIST_SEARCH_PATH,
    body,
    cred,
    token,
    fetchFn,
    nowMs,
    { method: 'POST', body }
  )
}

/** 使用目标玩家的明日方舟游戏 UID 发送好友申请。 */
export async function addFriendByUid(
  uid: string,
  targetUid: string,
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch,
  nowMs = Date.now()
): Promise<FriendRequestResult> {
  assertNonEmpty(uid, 'uid')
  assertNonEmpty(targetUid, 'targetUid')
  const body = JSON.stringify({ uid, targetUid })
  return requestAssistEnvelope<never>(
    `${SKLAND_DOMAIN}${FRIEND_PATH}`,
    FRIEND_PATH,
    body,
    cred,
    token,
    fetchFn,
    nowMs,
    { method: 'POST', body }
  ).then(envelope => ({
    code: envelope.code,
    message: envelope.message,
    msg: envelope.msg,
    timestamp: envelope.timestamp
  }))
}
