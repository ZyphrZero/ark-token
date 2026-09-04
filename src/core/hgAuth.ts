import { AuthFlowError, NetworkFlowError, YituliuError, describeYituliuError } from './errors'
import type { SklandCredential } from './types'
import type { FetchLike } from './skland'

/**
 * 鹰角官网 token（HG token）换取森空岛凭证。
 *
 * 优先在浏览器内直连鹰角/森空岛服务器（请求头照搬后端 SklandHgTokenServiceImpl）：
 * 直连发生在用户自己的浏览器（携带官网 Cookie、用户本机 IP），与官网授权流程等价，
 * 且能拿到上游原始报错。一图流后端的 /survey/hg/cred-token 走共享出口，历史上多次
 * 整体故障且只返回裸 60002，故仅在直连无法连通时降级走后端。
 *
 * 注意：HG token 在 grant 接口很可能是一次性的，一条链路只能尝试一次授权，
 * 因此业务性失败（token 无效、需设备验证等）不再换后端重试同一 token。
 */

const OAUTH2_GRANT_URL = 'https://as.hypergryph.com/user/oauth2/v2/grant'
const GENERATE_CRED_BY_CODE_URL = 'https://zonai.skland.com/web/v1/user/auth/generate_cred_by_code'
/** 森空岛应用 code，与后端/前端仓库一致 */
const APP_CODE = '4ca99fa6b56cc2ba'
const DEVICE_ID = 'bebd9eee5ad0411dacaee5075792ea2a'
const D_ID = 'BqbjCY5HN8T+MFmjvDT4ceaUO6zSMuvdts2+67sjAL4QTA3GfE7M1rDkuUo8Hbhl03557VponqkJW2Z1wh+/nYA=='
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0'

/** 官网登录后可直接访问、返回 HG token 的页面（token 在 data.content） */
export const HG_ACCOUNT_INFO_URL = 'https://web-api.hypergryph.com/account/info/hg'

/** 解析用户粘贴的官网 token 输入：兼容整段 JSON 与纯 token 字符串 */
export function parseHgTokenInput(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new AuthFlowError('请先粘贴官网 Token（或包含它的 JSON）')
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { data?: { content?: unknown } }
      const content = parsed?.data?.content
      if (typeof content === 'string' && content.length > 0) {
        return content
      }
    } catch {
      // 落到下面的通用报错
    }
    throw new AuthFlowError('JSON 中未找到 data.content 字段，请确认复制的是完整的接口返回')
  }
  return trimmed
}

/** 解析用户粘贴的森空岛凭证输入（cred,token 逗号串，与一图流官网教程一致） */
export function parseSklandCredentialInput(text: string): { cred: string; token: string } {
  const input = text.trim()
  if (!input) {
    throw new AuthFlowError('请粘贴当前森空岛网页重新复制的完整凭证（cred,token）')
  }

  const missingMessage =
    '复制到的内容不含有效凭证（是 null/undefined）：通常是尚未登录森空岛网页版（www.skland.com），' +
    '或命令没有在森空岛页面的控制台执行；请重新登录后复制完整的 cred,token，或改用扫码登录。'
  const invalidMessage =
    '输入格式不正确：请粘贴当前森空岛网页重新复制的完整凭证（cred,token，包含一个逗号），不要混用 Android 凭证、Cookie 或 sign'

  const isMissing = (value: unknown): value is null | undefined =>
    value === null || value === undefined || value === '' || value === 'null' || value === 'undefined'
  const normalizePart = (value: unknown): string => {
    if (typeof value !== 'string') {
      throw new AuthFlowError(invalidMessage)
    }
    const trimmed = value.trim()
    const unquoted =
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
        ? trimmed.slice(1, -1).trim()
        : trimmed
    if (isMissing(unquoted)) {
      throw new AuthFlowError(missingMessage)
    }
    return unquoted
  }
  const makeCredential = (cred: unknown, token: unknown): { cred: string; token: string } => {
    if (isMissing(cred) || isMissing(token)) {
      throw new AuthFlowError(missingMessage)
    }
    return { cred: normalizePart(cred), token: normalizePart(token) }
  }

  if (input.startsWith('{') || input.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(input)
      if (Array.isArray(parsed) && parsed.length === 2) {
        return makeCredential(parsed[0], parsed[1])
      }
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as { cred?: unknown; token?: unknown; data?: { cred?: unknown; token?: unknown } }
        if ('cred' in candidate || 'token' in candidate) {
          return makeCredential(candidate.cred, candidate.token)
        }
        if (candidate.data && ('cred' in candidate.data || 'token' in candidate.data)) {
          return makeCredential(candidate.data.cred, candidate.data.token)
        }
      }
    } catch (error) {
      if (error instanceof AuthFlowError) {
        throw error
      }
    }
    throw new AuthFlowError(invalidMessage)
  }

  const parts = input.split(',')
  if (parts.length !== 2) {
    throw new AuthFlowError(invalidMessage)
  }
  return makeCredential(parts[0], parts[1])
}

/** 走一图流后端接口换取凭证 */
export async function exchangeHgTokenViaBackend(
  hgToken: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<SklandCredential> {
  const response = await fetchFn(`${backendBaseUrl}/survey/hg/cred-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: hgToken })
  })
  const envelope = (await response.json().catch(() => null)) as { code?: number; msg?: string; message?: string; data?: { cred?: string; token?: string } } | null
  if (!response.ok || !envelope || envelope.code !== 200 || !envelope.data?.cred || !envelope.data?.token) {
    const code = envelope?.code ?? response.status
    const msg = envelope?.msg ?? envelope?.message ?? ''
    throw new YituliuError(describeYituliuError(code, msg), code)
  }
  return { cred: envelope.data.cred, token: envelope.data.token, obtainedAt: Date.now() }
}

/** 直连鹰角/森空岛服务器换取凭证（默认路径） */
export async function exchangeHgTokenDirect(hgToken: string, fetchFn: FetchLike = globalThis.fetch): Promise<SklandCredential> {
  let grantResponse: Response
  try {
    grantResponse = await fetchFn(OAUTH2_GRANT_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'X-DeviceModel': 'Firefox',
        'X-DeviceType': '7',
        'X-OSVer': 'Windows',
        'X-DeviceId': DEVICE_ID,
        'X-Captcha-Version': '4.0'
      },
      body: JSON.stringify({ token: hgToken, appCode: APP_CODE, type: 0 })
    })
  } catch {
    throw new NetworkFlowError('无法连接鹰角服务器（网络异常或被拦截），请检查网络')
  }
  const grant = (await grantResponse.json().catch(() => null)) as { data?: { code?: string }; msg?: string } | null
  const code = grant?.data?.code
  if (typeof code !== 'string' || code.length === 0) {
    const upstreamMsg = grant?.msg
    if (!upstreamMsg) {
      // 非 JSON 响应（如 WAF 拦截页）：视为网络层失败，允许降级走一图流后端
      throw new NetworkFlowError(`鹰角服务器返回了无法解析的响应（HTTP ${grantResponse.status}）`)
    }
    // account/info/hg 返回的 Token 随登录会话下发且有时效：提示"登录已过期"时
    // 需要退出并重新登录官网以签发新 Token，而非简单重试
    const hint = upstreamMsg.includes('设备验证')
      ? '请在森空岛 APP 中关闭「新设备登录身份验证」后重试'
      : upstreamMsg.includes('登录已过期')
        ? '请退出并重新登录鹰角官网（ak.hypergryph.com）以签发新 Token 后再试；若仍失败，请改用「扫码登录」或「森空岛凭证粘贴」'
        : '请重新登录鹰角官网后重试'
    throw new AuthFlowError(`官网 Token 换取凭证失败（来自鹰角的提示：${upstreamMsg}。${hint}）`)
  }

  let credResponse: Response
  try {
    credResponse = await fetchFn(GENERATE_CRED_BY_CODE_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        platform: '3',
        vName: '1.0.0',
        timestamp: String(Math.floor(Date.now() / 1000)),
        dId: D_ID
      },
      body: JSON.stringify({ kind: 1, code })
    })
  } catch {
    throw new NetworkFlowError('无法连接森空岛服务器（网络异常或被拦截），请检查网络')
  }
  const cred = (await credResponse.json().catch(() => null)) as { code?: number; msg?: string; message?: string; data?: { cred?: string; token?: string } } | null
  if (cred?.code !== 0 || !cred.data?.cred || !cred.data?.token) {
    // 森空岛接口的错误字段是 message（鹰角是 msg），两者都兼容
    const upstreamMsg = cred?.message ?? cred?.msg
    throw new AuthFlowError(upstreamMsg ? `森空岛返回错误：${upstreamMsg}` : `换取森空岛凭证失败（HTTP ${credResponse.status}），请稍后重试`)
  }
  return { cred: cred.data.cred, token: cred.data.token, obtainedAt: Date.now() }
}

/** 直连优先，网络层失败时降级走一图流后端；供添加账号与凭证刷新共用 */
export async function exchangeHgToken(
  hgToken: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<SklandCredential> {
  try {
    return await exchangeHgTokenDirect(hgToken, fetchFn)
  } catch (error) {
    // 业务性失败（token 无效、需设备验证等）后端走同一上游只会得到相同或更含糊的报错，
    // 且 token 可能已被本次授权消耗，不再换后端重试
    if (!(error instanceof NetworkFlowError)) {
      throw error
    }
    try {
      return await exchangeHgTokenViaBackend(hgToken, backendBaseUrl, fetchFn)
    } catch {
      throw new AuthFlowError(`${error.message}；改走一图流后端换凭证也失败了，请稍后重试或改用「扫码登录」`)
    }
  }
}

/**
 * 从鹰角官网一键读取 HG token（要求浏览器已登录 ak.hypergryph.com）。
 * 依赖 manifest 的 host_permissions 带 Cookie 访问。
 */
export async function fetchHgTokenFromOfficialSite(fetchFn: FetchLike = globalThis.fetch): Promise<string> {
  let response: Response
  try {
    response = await fetchFn(HG_ACCOUNT_INFO_URL, { method: 'GET', credentials: 'include' })
  } catch {
    throw new AuthFlowError('无法访问鹰角官网接口，请检查网络')
  }
  if (!response.ok) {
    throw new AuthFlowError('读取官网信息失败：请先在浏览器中登录鹰角官网（ak.hypergryph.com）后重试')
  }
  const payload = (await response.json().catch(() => null)) as { data?: { content?: unknown } } | null
  const content = payload?.data?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new AuthFlowError('官网返回中没有 Token：请先在浏览器中登录鹰角官网后重试')
  }
  return content
}
