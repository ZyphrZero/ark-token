import { AuthFlowError, YituliuError, describeYituliuError } from './errors'
import type { SklandCredential } from './types'
import type { FetchLike } from './skland'

/**
 * 鹰角官网 token（HG token）换取森空岛凭证。
 *
 * 优先走一图流后端公开接口 POST /survey/hg/cred-token（与官网导入页一致），
 * 失败时降级为插件直连鹰角/森空岛服务器（请求头照搬后端 SklandHgTokenServiceImpl）。
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
  const normalized = text.replace(/\s+/g, '').replace(/["']/g, '')
  if (!normalized.includes(',')) {
    throw new AuthFlowError('输入格式不正确：应是一段中间包含逗号的凭证（cred,token）')
  }
  const [cred, token] = normalized.split(',')
  const isMissing = (value: string | undefined) =>
    !value || value === 'null' || value === 'undefined'
  if (isMissing(cred) || isMissing(token)) {
    // copy(null+','+null) 得到的就是 "null,null"：说明浏览器里没有那两个存储键
    throw new AuthFlowError(
      '复制到的内容不含有效凭证（是 null/undefined）：通常是尚未登录森空岛网页版（www.skland.com），' +
        '或命令没有在森空岛页面的控制台执行；也可能森空岛更新后改变了存储方式。推荐改用「扫码登录」添加账号。'
    )
  }
  return { cred, token }
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

/** 直连鹰角/森空岛服务器换取凭证（后端接口不可用时的降级路径） */
export async function exchangeHgTokenDirect(hgToken: string, fetchFn: FetchLike = globalThis.fetch): Promise<SklandCredential> {
  const grantResponse = await fetchFn(OAUTH2_GRANT_URL, {
    method: 'POST',
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
  const grant = (await grantResponse.json().catch(() => null)) as { data?: { code?: string }; msg?: string } | null
  const code = grant?.data?.code
  if (typeof code !== 'string' || code.length === 0) {
    const upstreamMsg = grant?.msg
    throw new AuthFlowError(
      upstreamMsg
        ? `官网 Token 换取凭证失败（来自鹰角的提示：${upstreamMsg}；若提示设备验证，请在森空岛 APP 关闭「新设备登录身份验证」）`
        : '官网 Token 换取凭证失败：Token 可能已失效，请重新登录官网后复制'
    )
  }

  const credResponse = await fetchFn(GENERATE_CRED_BY_CODE_URL, {
    method: 'POST',
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
  const cred = (await credResponse.json().catch(() => null)) as { code?: number; msg?: string; data?: { cred?: string; token?: string } } | null
  if (cred?.code !== 0 || !cred.data?.cred || !cred.data?.token) {
    const upstreamMsg = cred?.msg
    throw new AuthFlowError(upstreamMsg ? `森空岛返回错误：${upstreamMsg}` : '换取森空岛凭证失败，请稍后重试')
  }
  return { cred: cred.data.cred, token: cred.data.token, obtainedAt: Date.now() }
}

/** 先走后端，失败后直连；供添加账号与凭证刷新共用 */
export async function exchangeHgToken(
  hgToken: string,
  backendBaseUrl: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<SklandCredential> {
  try {
    return await exchangeHgTokenViaBackend(hgToken, backendBaseUrl, fetchFn)
  } catch (error) {
    // 仅在网络层失败时降级直连；token 本身无效时直连也会失败，给出直连的报错更准确
    try {
      return await exchangeHgTokenDirect(hgToken, fetchFn)
    } catch {
      throw error
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
