import HmacSHA256 from 'crypto-js/hmac-sha256'
import MD5 from 'crypto-js/md5'

import { SklandError } from './errors'
import type { SklandBindingInfo } from './skland-info'
import type { SklandBinding, SklandChar } from './types'

/**
 * 森空岛数据 API 客户端。
 *
 * 签名与请求头逻辑照搬一图流前端 `frontend-v2-plus/src/utils/survey/skland.js`：
 * sign = md5(hex(hmacSHA256(path + params + timestamp + JSON.stringify(headers), token)))
 * headers 键序固定为 platform / timestamp / dId / vName，密钥为换取的临时 token（不是 cred）。
 */

const SKLAND_DOMAIN = 'https://zonai.skland.com'
const PLAYER_BINDING_PATH = '/api/v1/game/player/binding'
const CULTIVATE_PLAYER_PATH = '/api/v1/game/cultivate/player'
const PLAYER_INFO_PATH = '/api/v1/game/player/info'

/** 参与签名与请求头的 dId 值：一图流前端固定填一段 Firefox UA 字符串 */
const SIGN_D_ID = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0'
/** 时间戳提前量（毫秒），与一图流前端一致，容忍时钟偏差 */
const TIMESTAMP_OFFSET_MS = 300

export type FetchLike = typeof globalThis.fetch

interface SignResult {
  timestamp: string
  sign: string
}

export function getSign(path: string, params: string | null | undefined, token: string, nowMs = Date.now()): SignResult {
  const timestamp = Math.floor((nowMs - TIMESTAMP_OFFSET_MS) / 1000).toString()
  // 键序即插入序，不可调整：参与签名的 JSON 字符串必须与之一致
  const headers = {
    platform: '3',
    timestamp,
    dId: SIGN_D_ID,
    vName: '1.2.0'
  }
  const normalizedParams = params ? params : ''
  const text = path + normalizedParams + timestamp + JSON.stringify(headers)
  const sign = MD5(HmacSHA256(text, token).toString()).toString()
  return { timestamp, sign }
}

export function buildSklandHeaders(
  path: string,
  params: string | null | undefined,
  cred: string,
  token: string,
  nowMs = Date.now()
): Record<string, string> {
  const { timestamp, sign } = getSign(path, params, token, nowMs)
  return {
    platform: '3',
    timestamp,
    dId: SIGN_D_ID,
    vName: '1.2.0',
    cred,
    sign
  }
}

interface SklandEnvelope<T> {
  code: number
  message?: string
  msg?: string
  data?: T
}

async function requestSkland<T>(
  url: string,
  path: string,
  params: string | null | undefined,
  cred: string,
  token: string,
  fetchFn: FetchLike
): Promise<T> {
  const headers = buildSklandHeaders(path, params, cred, token)
  const response = await fetchFn(url, { method: 'GET', headers })
  if (!response.ok) {
    throw new SklandError(`森空岛接口请求失败（HTTP ${response.status}）`)
  }
  const envelope = (await response.json()) as SklandEnvelope<T>
  if (envelope.code !== 0) {
    throw new SklandError(describeSklandError(envelope.code, envelope.message ?? envelope.msg ?? '未知错误'), envelope.code)
  }
  return envelope.data as T
}

/**
 * 森空岛错误码 → 面向用户的提示。
 * 10000/10003 是签名时间戳校验失败（服务端时间窗约 1~2 分钟）：本机时钟偏差过大时所有请求都会失败，
 * 与凭证无关，提示校准系统时间而不是误导用户重新扫码。
 */
function describeSklandError(code: number, message: string): string {
  if (code === 10000 || code === 10003) {
    return `森空岛签名校验未通过（${code}：${message}）。请检查本机系统时间是否准确（建议开启网络时间同步）后重试`
  }
  return `森空岛凭证错误或已失效（${code}：${message}）`
}

interface RawBindingApp {
  appCode?: string
  bindingList?: {
    uid?: string
    nickName?: string
    isOfficial?: boolean
    isDefault?: boolean
    channelMasterId?: number
    channelName?: string
  }[]
}

/** 获取当前凭证绑定的明日方舟角色列表 */
export async function fetchSklandBinding(cred: string, token: string, fetchFn: FetchLike = globalThis.fetch): Promise<SklandBinding[]> {
  const data = await requestSkland<{ list?: RawBindingApp[] }>(
    `${SKLAND_DOMAIN}${PLAYER_BINDING_PATH}`,
    PLAYER_BINDING_PATH,
    null,
    cred,
    token,
    fetchFn
  )
  const arkApp = (data.list ?? []).find(item => item.appCode === 'arknights')
  return (arkApp?.bindingList ?? [])
    .filter(binding => typeof binding.uid === 'string')
    .map(binding => ({
      uid: binding.uid as string,
      nickName: binding.nickName ?? '',
      isOfficial: binding.isOfficial,
      isDefault: binding.isDefault,
      channelMasterId: binding.channelMasterId ?? 1,
      channelName: binding.channelName ?? ''
    }))
}

interface RawCultivateData {
  items?: { id?: string; count?: number }[]
  characters?: SklandChar[]
}

/** 获取指定 UID 的仓库材料与干员练度数据（上传数据来源，与一图流官网导入一致） */
export async function fetchCultivateData(
  uid: string,
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<{ items: { id: string; count: number }[]; characters: SklandChar[] }> {
  const params = `uid=${uid}`
  const data = await requestSkland<RawCultivateData>(
    `${SKLAND_DOMAIN}${CULTIVATE_PLAYER_PATH}?${params}`,
    CULTIVATE_PLAYER_PATH,
    params,
    cred,
    token,
    fetchFn
  )
  return {
    items: (data.items ?? []).filter(
      (item): item is { id: string; count: number } => typeof item.id === 'string' && typeof item.count === 'number'
    ),
    characters: data.characters ?? []
  }
}

/** 获取指定 UID 的账号状态数据（理智/公招/基建/任务进度，状态面板数据来源） */
export async function fetchSklandPlayerInfo(
  uid: string,
  cred: string,
  token: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<SklandBindingInfo> {
  const params = `uid=${uid}`
  return requestSkland<SklandBindingInfo>(
    `${SKLAND_DOMAIN}${PLAYER_INFO_PATH}?${params}`,
    PLAYER_INFO_PATH,
    params,
    cred,
    token,
    fetchFn
  )
}
