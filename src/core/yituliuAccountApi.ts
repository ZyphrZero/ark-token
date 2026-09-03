import { YituliuError, describeYituliuError } from './errors'
import type { FetchLike } from './skland'

/**
 * 一图流账号（官网登录会话）API：自动获取第三方读写 token。
 *
 * 与一图流官网「用户中心 → 第三方 API Token」页面行为保持一致：
 * - 会话凭证 USER_TOKEN / UID 存于 ark.yituliu.cn 的 localStorage，
 *   以 `Authorization: Authorization<USER_TOKEN>` 请求头调用后端 /auth/** 接口
 * - 每种权限只保留一个 token：已存在则复用，缺失则生成（生成新的会使旧 token 失效）
 */

/** 干员数据读取权限 key，与后端 OpenApiPermission 枚举一致 */
export const READ_PERMISSION_KEY = 'operatorDataReadAccess'
/** 干员数据写入权限 key */
export const WRITE_PERMISSION_KEY = 'operatorDataWriteAccess'

/** 权限接口不可用时的兜底 code（后端 OpenApiPermission 枚举当前值） */
const FALLBACK_READ_CODE = 10001
const FALLBACK_WRITE_CODE = 10002

export interface YituliuSession {
  /** ark.yituliu.cn localStorage 中的 USER_TOKEN */
  userToken: string
  /** localStorage 中的 UID（官网请求会一并携带） */
  uid?: string
}

export interface YituliuOpenApiPermission {
  key: string
  code: number
  desc?: string
}

export interface YituliuOpenApiTokenEntry {
  token: string
  scope: unknown
  remark?: string
}

/** token 的获取结果：复用官网已有 / 本次新生成 / 获取失败 */
export type TokenSource = 'existing' | 'generated' | 'failed'

export interface ResolvedYituliuTokens {
  readToken?: string
  writeToken?: string
  readSource: TokenSource
  writeSource: TokenSource
  /** 获取失败部分的原始报错（部分成功时通过它提示用户手动补齐） */
  errors: string[]
}

/** scope 字段兼容 JSON 字符串与数组两种形态，解析为权限 code 数组 */
function parseScopeCodes(scope: unknown): number[] {
  const parsed = typeof scope === 'string' ? (() => {
    try {
      return JSON.parse(scope) as unknown
    } catch {
      return undefined
    }
  })() : scope
  return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === 'number') : []
}

function buildSessionHeaders(session: YituliuSession): Record<string, string> {
  const headers: Record<string, string> = {
    // 后端约定：字面量 "Authorization" 前缀 + 会话 token（与官网 request.js 拦截器一致）
    Authorization: `Authorization${session.userToken}`,
    'Content-Type': 'application/json'
  }
  if (session.uid) {
    headers.uid = session.uid
  }
  return headers
}

interface YituliuEnvelope<T> {
  code?: number
  msg?: string
  data?: T
}

async function requestYituliu<T>(
  url: string,
  init: RequestInit,
  fetchFn: FetchLike
): Promise<T> {
  const response = await fetchFn(url, init)
  const envelope = (await response.json().catch(() => null)) as YituliuEnvelope<T> | null
  if (!response.ok || !envelope || envelope.code !== 200) {
    const code = envelope?.code ?? response.status
    const msg = envelope?.msg ?? ''
    throw new YituliuError(describeYituliuError(code, msg), code)
  }
  return envelope.data as T
}

/** 获取可用权限列表；接口异常时返回 null（调用方回退到已知 code） */
export async function fetchOpenApiPermissions(
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<YituliuOpenApiPermission[] | null> {
  try {
    return await requestYituliu<YituliuOpenApiPermission[]>(
      `${backendBaseUrl}/user/open-api/permissions`,
      { method: 'GET' },
      fetchFn
    )
  } catch {
    return null
  }
}

/** 获取当前用户已生成的第三方 token 列表（需登录会话） */
export async function fetchOpenApiTokens(
  session: YituliuSession,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<YituliuOpenApiTokenEntry[]> {
  const data = await requestYituliu<YituliuOpenApiTokenEntry[]>(
    `${backendBaseUrl}/auth/user/open-api/tokens`,
    { method: 'GET', headers: buildSessionHeaders(session) },
    fetchFn
  )
  return Array.isArray(data) ? data : []
}

/** 生成指定权限的第三方 token（需登录会话） */
export async function generateOpenApiToken(
  session: YituliuSession,
  scope: number,
  remark: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<string> {
  const data = await requestYituliu<{ token?: string }>(
    `${backendBaseUrl}/auth/user/open-api/token`,
    {
      method: 'POST',
      headers: buildSessionHeaders(session),
      body: JSON.stringify({ scope: [scope], remark })
    },
    fetchFn
  )
  if (typeof data?.token !== 'string' || data.token.length === 0) {
    throw new YituliuError('一图流未返回生成的 token', -1)
  }
  return data.token
}

/** 解析读写权限 code：优先接口返回，异常时回退到已知值 */
async function resolvePermissionCodes(
  backendBaseUrl: string,
  fetchFn: FetchLike
): Promise<{ readCode: number; writeCode: number }> {
  const permissions = await fetchOpenApiPermissions(backendBaseUrl, fetchFn)
  const readCode = permissions?.find(item => item.key === READ_PERMISSION_KEY)?.code ?? FALLBACK_READ_CODE
  const writeCode = permissions?.find(item => item.key === WRITE_PERMISSION_KEY)?.code ?? FALLBACK_WRITE_CODE
  return { readCode, writeCode }
}

/**
 * 自动获取读写 token：已存在则复用，缺失则生成。
 *
 * 读、写两路独立尝试，互不影响；仅当一路完全失败时在 errors 中记录原始报错。
 * 会话失效（未登录）时整体抛错。
 */
export async function resolveYituliuTokens(
  session: YituliuSession,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<ResolvedYituliuTokens> {
  const { readCode, writeCode } = await resolvePermissionCodes(backendBaseUrl, fetchFn)
  const tokens = await fetchOpenApiTokens(session, backendBaseUrl, fetchFn)

  const findExisting = (code: number) =>
    tokens.find(item => {
      const codes = parseScopeCodes(item.scope)
      return codes.length === 1 && codes[0] === code && typeof item.token === 'string' && item.token.length > 0
    })

  async function obtain(code: number, remark: string): Promise<{ token?: string; source: TokenSource; error?: string }> {
    const existing = findExisting(code)
    if (existing) {
      return { token: existing.token, source: 'existing' }
    }
    try {
      return { token: await generateOpenApiToken(session, code, remark, backendBaseUrl, fetchFn), source: 'generated' }
    } catch (error) {
      return { source: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
  }

  // 备注文案与官网 Token 管理页生成按钮一致，便于用户在官网识别来源
  const [read, write] = await Promise.all([
    obtain(readCode, '只读 Token'),
    obtain(writeCode, '只写 Token')
  ])

  const errors: string[] = []
  if (read.error) {
    errors.push(`只读 token：${read.error}`)
  }
  if (write.error) {
    errors.push(`只写 token：${write.error}`)
  }

  return {
    readToken: read.token,
    writeToken: write.token,
    readSource: read.source,
    writeSource: write.source,
    errors
  }
}
