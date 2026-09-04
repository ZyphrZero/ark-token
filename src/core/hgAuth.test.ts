import { describe, expect, it } from 'vitest'

import { AuthFlowError, NetworkFlowError } from './errors'
import {
  exchangeHgToken,
  exchangeHgTokenDirect,
  parseHgTokenInput,
  parseSklandCredentialInput
} from './hgAuth'
import type { FetchLike } from './skland'

describe('parseHgTokenInput 官网 token 输入解析', () => {
  it('从完整 JSON 中提取 data.content', () => {
    const json = JSON.stringify({ status: 0, data: { content: 'hg-token-abc' } })
    expect(parseHgTokenInput(json)).toBe('hg-token-abc')
  })

  it('兼容纯 token 字符串（自动去空白）', () => {
    expect(parseHgTokenInput('  hg-token-abc \n')).toBe('hg-token-abc')
  })

  it('JSON 缺少 content 时报错', () => {
    expect(() => parseHgTokenInput(JSON.stringify({ status: 0 }))).toThrow(/data\.content/)
  })

  it('非法 JSON 报错且不抛出解析异常', () => {
    expect(() => parseHgTokenInput('{broken')).toThrow(/JSON/)
  })

  it('空输入报错', () => {
    expect(() => parseHgTokenInput('   ')).toThrow(/请先粘贴/)
  })
})

describe('parseSklandCredentialInput 森空岛凭证解析', () => {
  it('解析 cred,token 逗号串（去空白与引号）', () => {
    expect(parseSklandCredentialInput('"cred-abc", token-xyz ')).toEqual({
      cred: 'cred-abc',
      token: 'token-xyz'
    })
  })

  it('缺少逗号时报错', () => {
    expect(() => parseSklandCredentialInput('onlyonepart')).toThrow(/逗号/)
  })

  it('逗号两侧缺失时报错', () => {
    expect(() => parseSklandCredentialInput('abc,')).toThrow(/有效凭证/)
  })

  it('内容为 null,null（未登录森空岛时复制的典型结果）报错并提示改用扫码', () => {
    expect(() => parseSklandCredentialInput('null,null')).toThrow(/扫码登录/)
    expect(() => parseSklandCredentialInput('null,undefined')).toThrow(/扫码登录/)
    expect(() => parseSklandCredentialInput('undefined,undefined')).toThrow(/扫码登录/)
  })

  it('拒绝多余逗号，避免静默截断凭证', () => {
    expect(() => parseSklandCredentialInput('cred-abc,token-xyz,extra')).toThrow(/完整凭证/)
  })

  it('支持 JSON 数组和对象形式的凭证', () => {
    expect(parseSklandCredentialInput('["cred-abc","token-xyz"]')).toEqual({
      cred: 'cred-abc',
      token: 'token-xyz'
    })
    expect(parseSklandCredentialInput(JSON.stringify({ data: { cred: 'cred-abc', token: 'token-xyz' } }))).toEqual({
      cred: 'cred-abc',
      token: 'token-xyz'
    })
  })

  it('拒绝缺少字段或非字符串字段的 JSON', () => {
    expect(() => parseSklandCredentialInput('{"cred":"cred-abc"}')).toThrow(/凭证/)
    expect(() => parseSklandCredentialInput('{"cred":123,"token":"token-xyz"}')).toThrow(/完整凭证/)
  })
})

const GRANT_URL = 'https://as.hypergryph.com/user/oauth2/v2/grant'
const CRED_URL = 'https://zonai.skland.com/web/v1/user/auth/generate_cred_by_code'
const BACKEND = 'https://backend.example.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** 直连两步全部成功的 fetch 模拟；各步骤可用回参覆盖以构造失败场景 */
function makeDirectFetch(overrides: {
  grant?: () => Response | Promise<Response>
  cred?: () => Response | Promise<Response>
  backend?: () => Response | Promise<Response>
} = {}): FetchLike & { urls: string[] } {
  const urls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    if (url === GRANT_URL) {
      return overrides.grant?.() ?? jsonResponse({ status: 0, data: { code: 'one-time-code' } })
    }
    if (url === CRED_URL) {
      return overrides.cred?.() ?? jsonResponse({ code: 0, data: { cred: 'cred-abc', token: 'token-xyz' } })
    }
    if (url === `${BACKEND}/survey/hg/cred-token`) {
      return overrides.backend?.() ?? jsonResponse({ code: 200, data: { cred: 'backend-cred', token: 'backend-token' } })
    }
    throw new Error(`unexpected url: ${url}`)
  }) as FetchLike & { urls: string[] }
  fetchFn.urls = urls
  return fetchFn
}

describe('exchangeHgTokenDirect 直连换凭证', () => {
  it('grant 成功后换取森空岛凭证', async () => {
    const credential = await exchangeHgTokenDirect('hg-token', makeDirectFetch())
    expect(credential.cred).toBe('cred-abc')
    expect(credential.token).toBe('token-xyz')
  })

  it('grant 返回登录过期时透传鹰角报错', async () => {
    const fetchFn = makeDirectFetch({ grant: () => jsonResponse({ msg: '登录已过期，请重新登录', status: 3 }, 401) })
    await expect(exchangeHgTokenDirect('hg-token', fetchFn)).rejects.toThrow(/登录已过期，请重新登录/)
  })

  it('grant 响应不可解析（如 WAF 拦截页）时抛网络层错误', async () => {
    const fetchFn = makeDirectFetch({ grant: () => new Response('<html>blocked</html>', { status: 405 }) })
    const error = await exchangeHgTokenDirect('hg-token', fetchFn).catch(e => e)
    expect(error).toBeInstanceOf(NetworkFlowError)
  })

  it('fetch 直接抛错时抛网络层错误', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as FetchLike
    await expect(exchangeHgTokenDirect('hg-token', fetchFn)).rejects.toBeInstanceOf(NetworkFlowError)
  })

  it('森空岛步骤的错误信息取 message 字段', async () => {
    const fetchFn = makeDirectFetch({ cred: () => jsonResponse({ code: 10001, message: '服务器开小差' }, 500) })
    await expect(exchangeHgTokenDirect('hg-token', fetchFn)).rejects.toThrow(/服务器开小差/)
  })
})

describe('exchangeHgToken 直连优先与后端降级', () => {
  it('直连成功时不调用一图流后端', async () => {
    const fetchFn = makeDirectFetch()
    const credential = await exchangeHgToken('hg-token', BACKEND, fetchFn)
    expect(credential.cred).toBe('cred-abc')
    expect(fetchFn.urls).toEqual([GRANT_URL, CRED_URL])
  })

  it('直连业务失败（token 无效）时不降级，直接透传鹰角报错', async () => {
    const fetchFn = makeDirectFetch({ grant: () => jsonResponse({ msg: '登录已过期，请重新登录', status: 3 }, 401) })
    await expect(exchangeHgToken('hg-token', BACKEND, fetchFn)).rejects.toBeInstanceOf(AuthFlowError)
    expect(fetchFn.urls).toEqual([GRANT_URL])
  })

  it('直连网络失败时降级走一图流后端', async () => {
    const fetchFn = makeDirectFetch({
      grant: () => {
        throw new TypeError('Failed to fetch')
      }
    })
    const credential = await exchangeHgToken('hg-token', BACKEND, fetchFn)
    expect(credential.cred).toBe('backend-cred')
    expect(fetchFn.urls).toEqual([GRANT_URL, `${BACKEND}/survey/hg/cred-token`])
  })

  it('直连被 WAF 拦截（非 JSON 响应）时降级走一图流后端', async () => {
    const fetchFn = makeDirectFetch({ grant: () => new Response('<html>captcha</html>', { status: 405 }) })
    const credential = await exchangeHgToken('hg-token', BACKEND, fetchFn)
    expect(credential.cred).toBe('backend-cred')
  })

  it('直连与后端都失败时给出两条链路的合并报错', async () => {
    const fetchFn = makeDirectFetch({
      grant: () => {
        throw new TypeError('Failed to fetch')
      },
      backend: () => jsonResponse({ code: 60002, msg: '外部系统接口调用异常' })
    })
    await expect(exchangeHgToken('hg-token', BACKEND, fetchFn)).rejects.toThrow(/无法连接鹰角服务器.*一图流后端/)
  })
})
