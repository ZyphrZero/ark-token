import { YituliuError, describeYituliuError } from './errors'
import type { SklandCredential } from './types'
import type { FetchLike } from './skland'

/**
 * 森空岛扫码登录（走一图流后端公开接口，流程与官网导入页一致）：
 * create 申请二维码会话 → 前端渲染二维码 → 每 2 秒 check 轮询，status=0 时拿到凭证。
 * status 语义：100 未扫码 / 101 已扫待确认 / 102 已过期 / 0 完成。
 */

export interface QrSession {
  scanId: string
  qrContent: string
}

export interface QrCheckResult {
  status: number
  msg?: string
  credential?: SklandCredential
}

interface YituliuEnvelope<T> {
  code: number
  msg?: string
  message?: string
  data?: T
}

async function postBackend<T>(
  url: string,
  body: unknown,
  fetchFn: FetchLike
): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  })
  const envelope = (await response.json().catch(() => null)) as YituliuEnvelope<T> | null
  if (!response.ok || !envelope || envelope.code !== 200) {
    const code = envelope?.code ?? response.status
    const msg = envelope?.msg ?? envelope?.message ?? ''
    throw new YituliuError(describeYituliuError(code, msg), code)
  }
  return envelope.data as T
}

export async function createQrSession(
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<QrSession> {
  const data = await postBackend<{ scanId?: string; qrContent?: string }>(
    `${backendBaseUrl}/survey/skland/qr/create`,
    {},
    fetchFn
  )
  if (!data?.scanId) {
    throw new YituliuError('后端未返回扫码会话，请稍后重试', -1)
  }
  return {
    scanId: data.scanId,
    qrContent: data.qrContent ?? `hypergryph://scan_login?scanId=${data.scanId}`
  }
}

export async function checkQrStatus(
  backendBaseUrl: string,
  scanId: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<QrCheckResult> {
  const data = await postBackend<{ status?: number; msg?: string; cred?: string; token?: string }>(
    `${backendBaseUrl}/survey/skland/qr/check?scanId=${encodeURIComponent(scanId)}`,
    {},
    fetchFn
  )
  const result: QrCheckResult = { status: data?.status ?? -1, msg: data?.msg }
  if (result.status === 0 && data?.cred && data?.token) {
    result.credential = { cred: data.cred, token: data.token, obtainedAt: Date.now() }
  }
  return result
}
