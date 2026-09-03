import { YituliuError, describeYituliuError } from './errors'
import type { OperatorInfoV2, PlayerInfoPayload } from './types'
import type { FetchLike } from './skland'

/**
 * 一图流第三方 open-api 客户端。
 *
 * token 放在 Authorization 头且无任何前缀（区别于网页登录态的 "Authorization"+token 格式）：
 * - 写：POST /open-api/operator/upload，body 为 PlayerInfoDTO，需写权限（10002）
 * - 读：GET  /open-api/operator/info，返回 V2 格式干员数据，需读权限（10001）
 */

export interface UploadResult {
  affectedRows: number
  updateTime?: string
}

interface YituliuEnvelope<T> {
  code: number
  msg?: string
  message?: string
  data?: T
}

async function parseEnvelope<T>(response: Response): Promise<YituliuEnvelope<T>> {
  const envelope = (await response.json().catch(() => null)) as YituliuEnvelope<T> | null
  if (!envelope) {
    throw new YituliuError(`一图流接口无响应（HTTP ${response.status}）`, response.status)
  }
  return envelope
}

/** 上传干员练度数据。写 token 通过 Authorization 头传递（原样，无前缀）。 */
export async function uploadOperatorData(
  payload: PlayerInfoPayload,
  writeToken: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<UploadResult> {
  const response = await fetchFn(`${backendBaseUrl}/open-api/operator/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: writeToken
    },
    body: JSON.stringify(payload)
  })
  const envelope = await parseEnvelope<{ affectedRows?: number; updateTime?: string }>(response)
  if (envelope.code !== 200) {
    const msg = envelope.msg ?? envelope.message ?? ''
    throw new YituliuError(describeYituliuError(envelope.code, msg), envelope.code)
  }
  return {
    affectedRows: envelope.data?.affectedRows ?? 0,
    updateTime: envelope.data?.updateTime
  }
}

/** 用读 token 拉取一图流侧已保存的干员数据，用于同步后校验。 */
export async function fetchOperatorInfo(
  readToken: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<OperatorInfoV2[]> {
  const response = await fetchFn(`${backendBaseUrl}/open-api/operator/info`, {
    method: 'GET',
    headers: { Authorization: readToken }
  })
  const envelope = await parseEnvelope<OperatorInfoV2[]>(response)
  if (envelope.code !== 200) {
    const msg = envelope.msg ?? envelope.message ?? ''
    throw new YituliuError(describeYituliuError(envelope.code, msg), envelope.code)
  }
  return envelope.data ?? []
}
