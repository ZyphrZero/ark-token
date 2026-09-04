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
  code?: number
  message?: string
  msg?: string
  timestamp?: string
  data?: T
}

interface EncodedContent {
  content?: string
}

type JsonRecord = Record<string, unknown>
type PayloadValidator<T> = (value: unknown) => value is T

interface ParsedEnvelope {
  root: unknown
  data: unknown
  code?: number
  message?: string
  msg?: string
  timestamp?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function describeShape(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).slice(0, 8)
    return keys.length > 0 ? `object(${keys.join(',')})` : 'object(empty)'
  }
  return typeof value
}

function isAssistInfoPayload(value: unknown): value is AssistInfo {
  return isRecord(value) && Array.isArray(value.characters) && Array.isArray(value.levelMax)
}

function isAssistUserInfoPayload(value: unknown): value is AssistUserInfo {
  return (
    isRecord(value) &&
    typeof value.gameNickname === 'string' &&
    typeof value.isOfficial === 'boolean' &&
    typeof value.isAuth === 'boolean'
  )
}

function isAssistSearchPayload(value: unknown): value is AssistSearchResult {
  return isRecord(value) && Array.isArray(value.list)
}

function assertNonEmpty(value: string, name: string): void {
  if (!value.trim()) {
    throw new TypeError(`${name} 不能为空`)
  }
}

function decodeBase64Json<T>(content: string, endpoint: string): T {
  const normalized = content.replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new SklandError(`森空岛接口响应无效（${endpoint}：content 不是有效的 Base64）`)
  }

  try {
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    return JSON.parse(text) as T
  } catch {
    throw new SklandError(`森空岛接口响应无效（${endpoint}：content 不是有效的 JSON）`)
  }
}

function parseEnvelopeRoot(value: unknown): ParsedEnvelope {
  if (!isRecord(value)) {
    return { root: value, data: value }
  }
  return {
    root: value,
    data: value.data,
    code: typeof value.code === 'number' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    msg: typeof value.msg === 'string' ? value.msg : undefined,
    timestamp: typeof value.timestamp === 'string' ? value.timestamp : undefined
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
): Promise<ParsedEnvelope> {
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

  const raw = await response.json()
  const parsed = parseEnvelopeRoot(raw)
  if (parsed.code !== undefined && parsed.code !== 0) {
    throw new SklandError(describeSklandError(parsed.code, parsed.message ?? parsed.msg ?? '未知错误'), parsed.code)
  }
  return {
    root: raw,
    data: parsed.data,
    code: parsed.code,
    message: parsed.message,
    msg: parsed.msg,
    timestamp: parsed.timestamp
  }
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
): Promise<ParsedEnvelope> {
  return requestAssistEnvelope<T>(url, path, params, cred, token, fetchFn, nowMs, options)
}

async function requestEncoded<T>(
  url: string,
  path: string,
  params: string | null,
  cred: string,
  token: string,
  fetchFn: FetchLike,
  nowMs: number,
  options: RequestOptions,
  validate: PayloadValidator<T>
): Promise<T> {
  const parsed = await requestAssist<unknown>(url, path, params, cred, token, fetchFn, nowMs, options)
  const candidates: unknown[] = [parsed.data, parsed.root]
  if (isRecord(parsed.data)) {
    candidates.push(parsed.data.data)
  }

  let contentDecodeError: SklandError | undefined
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      try {
        const decoded = decodeBase64Json<unknown>(candidate, path)
        if (validate(decoded)) {
          return decoded
        }
      } catch (error) {
        if (error instanceof SklandError) {
          contentDecodeError = error
        }
      }
      continue
    }
    if (!isRecord(candidate)) {
      continue
    }
    if (typeof candidate.content === 'string') {
      try {
        const decoded = decodeBase64Json<unknown>(candidate.content, path)
        if (validate(decoded)) {
          return decoded
        }
      } catch (error) {
        if (error instanceof SklandError) {
          contentDecodeError = error
        }
      }
    }
    if (validate(candidate)) {
      return candidate
    }
  }

  if (contentDecodeError) {
    throw contentDecodeError
  }

  throw new SklandError(
    `森空岛接口响应无效（${path}：未找到可识别的助战数据，data=${describeShape(parsed.data)}）`
  )
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
    { method: 'GET' },
    isAssistInfoPayload
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
    { method: 'GET' },
    isAssistUserInfoPayload
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
    { method: 'POST', body },
    isAssistSearchPayload
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
    code: envelope.code ?? 0,
    message: envelope.message,
    msg: envelope.msg,
    timestamp: envelope.timestamp
  }))
}
