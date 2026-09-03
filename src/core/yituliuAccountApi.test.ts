import { describe, expect, it } from 'vitest'

import { YituliuError } from './errors'
import {
  fetchOpenApiPermissions,
  fetchOpenApiTokens,
  generateOpenApiToken,
  resolveYituliuTokens,
  type YituliuSession
} from './yituliuAccountApi'
import type { FetchLike } from './skland'

const BACKEND = 'https://backend.example.test'
const SESSION: YituliuSession = { userToken: 'session-token-abc', uid: '10086' }

const PERMISSIONS = [
  { key: 'operatorDataReadAccess', code: 10001, desc: '干员数据读取' },
  { key: 'operatorDataWriteAccess', code: 10002, desc: '干员数据写入' }
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface RouteOverride {
  permissions?: () => Response
  tokens?: () => Response
  generate?: (scope: number[]) => Response
}

function makeFetch(overrides: RouteOverride = {}): FetchLike & { urls: string[]; generateScopes: number[][]; headers: Record<string, string>[] } {
  const urls: string[] = []
  const generateScopes: number[][] = []
  const headers: Record<string, string>[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    if (init?.headers) {
      headers.push(init.headers as Record<string, string>)
    }
    if (url === `${BACKEND}/user/open-api/permissions`) {
      return overrides.permissions?.() ?? jsonResponse({ code: 200, data: PERMISSIONS })
    }
    if (url === `${BACKEND}/auth/user/open-api/tokens`) {
      return overrides.tokens?.() ?? jsonResponse({ code: 200, data: [] })
    }
    if (url === `${BACKEND}/auth/user/open-api/token`) {
      const scope = (JSON.parse(String(init?.body)) as { scope: number[] }).scope
      generateScopes.push(scope)
      return overrides.generate?.(scope) ?? jsonResponse({ code: 200, data: { token: `token-${scope[0]}` } })
    }
    throw new Error(`unexpected url: ${url}`)
  }) as FetchLike & { urls: string[]; generateScopes: number[][]; headers: Record<string, string>[] }
  fetchFn.urls = urls
  fetchFn.generateScopes = generateScopes
  fetchFn.headers = headers
  return fetchFn
}

describe('fetchOpenApiPermissions 权限列表', () => {
  it('返回权限列表（无需会话头）', async () => {
    const fetchFn = makeFetch()
    const list = await fetchOpenApiPermissions(BACKEND, fetchFn)
    expect(list).toEqual(PERMISSIONS)
    expect(fetchFn.headers).toEqual([])
  })

  it('接口异常时返回 null 而不抛错', async () => {
    const fetchFn = makeFetch({ permissions: () => jsonResponse({ code: 500, msg: '服务器错误' }) })
    expect(await fetchOpenApiPermissions(BACKEND, fetchFn)).toBeNull()
  })
})

describe('fetchOpenApiTokens token 列表', () => {
  it('携带 Authorization<token> 与 uid 会话头', async () => {
    const fetchFn = makeFetch({ tokens: () => jsonResponse({ code: 200, data: [{ token: 't1', scope: '[10001]' }] }) })
    await fetchOpenApiTokens(SESSION, BACKEND, fetchFn)
    expect(fetchFn.headers[0].Authorization).toBe('Authorizationsession-token-abc')
    expect(fetchFn.headers[0].uid).toBe('10086')
  })

  it('未登录（20001）时抛出带提示的错误', async () => {
    const fetchFn = makeFetch({ tokens: () => jsonResponse({ code: 20001, msg: '用户未登录' }) })
    const error = await fetchOpenApiTokens(SESSION, BACKEND, fetchFn).catch(e => e)
    expect(error).toBeInstanceOf(YituliuError)
    expect(error.message).toMatch(/重新登录/)
  })
})

describe('generateOpenApiToken 生成 token', () => {
  it('按单一权限 scope 请求并返回 token', async () => {
    const fetchFn = makeFetch()
    const token = await generateOpenApiToken(SESSION, 10002, '只写 Token', BACKEND, fetchFn)
    expect(token).toBe('token-10002')
    expect(fetchFn.generateScopes).toEqual([[10002]])
    expect(fetchFn.urls).toContain(`${BACKEND}/auth/user/open-api/token`)
  })

  it('响应缺少 token 时抛错', async () => {
    const fetchFn = makeFetch({ generate: () => jsonResponse({ code: 200, data: {} }) })
    await expect(generateOpenApiToken(SESSION, 10001, '只读 Token', BACKEND, fetchFn)).rejects.toThrow(/未返回/)
  })
})

describe('resolveYituliuTokens 自动获取编排', () => {
  it('官网已有读写 token 时全部复用，不触发生成', async () => {
    const fetchFn = makeFetch({
      tokens: () => jsonResponse({
        code: 200,
        data: [
          { token: 'existing-read', scope: '[10001]', remark: '只读 Token' },
          { token: 'existing-write', scope: [10002], remark: '只写 Token' }
        ]
      })
    })
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result).toEqual({
      readToken: 'existing-read',
      writeToken: 'existing-write',
      readSource: 'existing',
      writeSource: 'existing',
      errors: []
    })
    expect(fetchFn.generateScopes).toEqual([])
  })

  it('两个 token 都缺失时分别生成读/写', async () => {
    const fetchFn = makeFetch()
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result.readToken).toBe('token-10001')
    expect(result.writeToken).toBe('token-10002')
    expect(result.readSource).toBe('generated')
    expect(result.writeSource).toBe('generated')
    expect(fetchFn.generateScopes).toEqual([[10001], [10002]])
  })

  it('只缺写 token 时仅生成写', async () => {
    const fetchFn = makeFetch({
      tokens: () => jsonResponse({ code: 200, data: [{ token: 'existing-read', scope: '[10001]' }] })
    })
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result.readSource).toBe('existing')
    expect(result.writeSource).toBe('generated')
    expect(fetchFn.generateScopes).toEqual([[10002]])
  })

  it('多权限混合的 token 不参与复用', async () => {
    const fetchFn = makeFetch({
      tokens: () => jsonResponse({ code: 200, data: [{ token: 'mixed', scope: '[10001,10002]' }] })
    })
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result.readToken).toBe('token-10001')
    expect(result.writeToken).toBe('token-10002')
  })

  it('权限接口失败时回退到已知 code 继续生成', async () => {
    const fetchFn = makeFetch({ permissions: () => new Response('WAF', { status: 405 }) })
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result.readToken).toBe('token-10001')
    expect(result.writeToken).toBe('token-10002')
  })

  it('生成失败互不影响：写失败时读仍可用，并记录错误', async () => {
    const fetchFn = makeFetch({
      generate: scope => (scope[0] === 10002
        ? jsonResponse({ code: 39007, msg: '生成过于频繁' })
        : jsonResponse({ code: 200, data: { token: 'new-read' } }))
    })
    const result = await resolveYituliuTokens(SESSION, BACKEND, fetchFn)
    expect(result.readToken).toBe('new-read')
    expect(result.writeToken).toBeUndefined()
    expect(result.writeSource).toBe('failed')
    expect(result.errors.join()).toMatch(/只写 token/)
  })

  it('会话失效时整体抛错（提示重新登录）', async () => {
    const fetchFn = makeFetch({ tokens: () => jsonResponse({ code: 20001, msg: '用户未登录' }) })
    await expect(resolveYituliuTokens(SESSION, BACKEND, fetchFn)).rejects.toThrow(/重新登录/)
    expect(fetchFn.generateScopes).toEqual([])
  })
})
