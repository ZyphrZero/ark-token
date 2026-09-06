import { describe, expect, it } from 'vitest'

import { syncAccount } from './sync'
import type { GameAccount, YituliuTokens } from './types'

const BACKEND = 'https://backend.example.test'
const TOKENS: YituliuTokens = { readToken: 'e'.repeat(32), writeToken: 'f'.repeat(32) }

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function sampleAccount(overrides: Partial<GameAccount> = {}): GameAccount {
  return {
    id: 'account-1',
    uid: '135297507',
    nickName: '博士',
    channelName: '官服',
    channelMasterId: 1,
    skland: { cred: 'old-cred', token: 'old-signing-token', obtainedAt: 1 },
    ...overrides
  }
}

function sklandCultivateResponse(): Response {
  return jsonResponse({
    code: 0,
    data: {
      items: [{ id: '30012', count: 5 }],
      characters: [
        {
          id: 'char_002_amiya',
          level: 60,
          evolvePhase: 2,
          mainSkillLevel: 7,
          potentialRank: 5,
          skills: [{ level: 7 }],
          equips: []
        }
      ]
    }
  })
}

describe('syncAccount', () => {
  it('完整链路：拉取森空岛 → 上传一图流 → 读 token 校验', async () => {
    const calls: string[] = []
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlText = String(url)
      calls.push(urlText)
      if (urlText.startsWith('https://zonai.skland.com/api/v1/game/cultivate/player')) {
        expect((init?.headers as Record<string, string>).cred).toBe('old-cred')
        return sklandCultivateResponse()
      }
      if (urlText === `${BACKEND}/open-api/operator/upload`) {
        return jsonResponse({ code: 200, data: { affectedRows: 1 } })
      }
      if (urlText === `${BACKEND}/open-api/operator/info`) {
        return jsonResponse({ code: 200, data: [{ id: 'char_002_amiya' }] })
      }
      throw new Error(`未预期的请求：${urlText}`)
    }

    const outcome = await syncAccount(sampleAccount(), TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch })

    expect(outcome.account.lastSync?.status).toBe('success')
    expect(outcome.account.lastSync?.operatorCount).toBe(1)
    expect(outcome.verifyNote).toContain('一致')
    expect(calls).toEqual([
      'https://zonai.skland.com/api/v1/game/cultivate/player?uid=135297507',
      `${BACKEND}/open-api/operator/upload`,
      `${BACKEND}/open-api/operator/info`
    ])
  })

  it('凭证失效且有官网 token 时自动刷新并重试', async () => {
    let cultivateCalls = 0
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlText = String(url)
      if (urlText.startsWith('https://zonai.skland.com/api/v1/game/cultivate/player')) {
        cultivateCalls += 1
        const cred = (init?.headers as Record<string, string>).cred
        if (cred === 'old-cred') {
          return jsonResponse({ code: 10000003, message: 'token 过期' })
        }
        expect(cred).toBe('new-cred')
        return sklandCultivateResponse()
      }
      if (urlText === `${BACKEND}/survey/hg/cred-token`) {
        return jsonResponse({ code: 200, data: { cred: 'new-cred', token: 'new-signing-token' } })
      }
      if (urlText === `${BACKEND}/open-api/operator/upload`) {
        const headers = new Headers(init?.headers)
        expect(headers.get('Authorization')).toBe('f'.repeat(32))
        return jsonResponse({ code: 200, data: { affectedRows: 1 } })
      }
      if (urlText === `${BACKEND}/open-api/operator/info`) {
        return jsonResponse({ code: 200, data: [{ id: 'char_002_amiya' }] })
      }
      throw new Error(`未预期的请求：${urlText}`)
    }

    const account = sampleAccount({ hgToken: 'hg-token-value' })
    const outcome = await syncAccount(account, TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch })

    expect(cultivateCalls).toBe(2)
    expect(outcome.account.skland.cred).toBe('new-cred')
    expect(outcome.account.skland.token).toBe('new-signing-token')
    expect(outcome.account.lastSync?.status).toBe('success')
    expect(outcome.account.lastSync?.message).toContain('自动刷新')
  })

  it('凭证失效真实形态（HTTP 401 + code 10002 用户未登录，抓包见 skland_dump/CAPTURE_STATUS.txt）同样触发自动刷新重试', async () => {
    let cultivateCalls = 0
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlText = String(url)
      if (urlText.startsWith('https://zonai.skland.com/api/v1/game/cultivate/player')) {
        cultivateCalls += 1
        const cred = (init?.headers as Record<string, string>).cred
        if (cred === 'old-cred') {
          return jsonResponse({ code: 10002, message: '用户未登录' }, 401)
        }
        return sklandCultivateResponse()
      }
      if (urlText === `${BACKEND}/survey/hg/cred-token`) {
        return jsonResponse({ code: 200, data: { cred: 'new-cred', token: 'new-signing-token' } })
      }
      if (urlText === `${BACKEND}/open-api/operator/upload`) {
        return jsonResponse({ code: 200, data: { affectedRows: 1 } })
      }
      throw new Error(`未预期的请求：${urlText}`)
    }

    const account = sampleAccount({ hgToken: 'hg-token-value' })
    const outcome = await syncAccount(account, TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch, skipVerify: true })

    expect(cultivateCalls).toBe(2)
    expect(outcome.account.skland.cred).toBe('new-cred')
    expect(outcome.account.lastSync?.status).toBe('success')
  })

  it('凭证失效且无官网 token 时报错并提示重新登录', async () => {
    const fetchFn = async (url: RequestInfo | URL): Promise<Response> => {
      if (String(url).startsWith('https://zonai.skland.com/')) {
        return jsonResponse({ code: 10000003, message: 'token 过期' })
      }
      throw new Error(`未预期的请求：${url}`)
    }

    await expect(syncAccount(sampleAccount(), TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch }))
      .rejects.toThrow(/凭证错误或已失效/)
  })

  it('缺少写 token 时直接报错', async () => {
    await expect(syncAccount(sampleAccount(), {}, BACKEND, { fetchFn: (async () => {
      throw new Error('不应发起任何请求')
    }) as typeof fetch })).rejects.toThrow(/写 token/)
  })

  it('上传限流错误向上透传为可读提示', async () => {
    const fetchFn = async (url: RequestInfo | URL): Promise<Response> => {
      const urlText = String(url)
      if (urlText.startsWith('https://zonai.skland.com/')) {
        return sklandCultivateResponse()
      }
      return jsonResponse({ code: 39007, msg: '上传间隔小于5秒' })
    }

    await expect(syncAccount(sampleAccount(), TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch, skipVerify: true }))
      .rejects.toThrow(/5 秒/)
  })

  it('森空岛未返回干员时取消上传', async () => {
    const fetchFn = async (): Promise<Response> => jsonResponse({ code: 0, data: { items: [], characters: [] } })
    await expect(syncAccount(sampleAccount(), TOKENS, BACKEND, { fetchFn: fetchFn as typeof fetch }))
      .rejects.toThrow(/未返回任何干员/)
  })
})
