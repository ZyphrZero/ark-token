import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { buildSklandHeaders, fetchCultivateData, fetchSklandBinding, getSign } from './skland'

const NOW = 1_700_000_000_000
const TOKEN = 'test-signing-secret'

/** 用 node:crypto 独立实现签名算法（与 crypto-js 实现互为对照） */
function expectedSign(path: string, params: string, timestamp: string, token: string): string {
  const headers = `{"platform":"3","timestamp":"${timestamp}","dId":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0","vName":"1.2.0"}`
  const text = path + params + timestamp + headers
  const hmacHex = createHmac('sha256', token).update(text, 'utf-8').digest('hex')
  return createHash('md5').update(hmacHex, 'utf-8').digest('hex')
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('getSign 森空岛签名', () => {
  it('无 query 参数的签名与独立实现一致', () => {
    const { timestamp, sign } = getSign('/api/v1/game/player/binding', null, TOKEN, NOW)
    expect(timestamp).toBe(String(Math.floor((NOW - 300) / 1000)))
    expect(sign).toBe(expectedSign('/api/v1/game/player/binding', '', timestamp, TOKEN))
  })

  it('带 query 参数的签名与独立实现一致', () => {
    const params = 'uid=135297507'
    const { timestamp, sign } = getSign('/api/v1/game/cultivate/player', params, TOKEN, NOW)
    expect(sign).toBe(expectedSign('/api/v1/game/cultivate/player', params, timestamp, TOKEN))
  })

  it('时间戳含 300ms 提前量', () => {
    const { timestamp } = getSign('/p', null, TOKEN, NOW)
    expect(Number(timestamp)).toBe(Math.floor((NOW - 300) / 1000))
  })
})

describe('buildSklandHeaders', () => {
  it('包含签名所需的全部请求头', () => {
    const headers = buildSklandHeaders('/api/v1/game/player/binding', null, 'cred-value', TOKEN, NOW)
    expect(headers.platform).toBe('3')
    expect(headers.vName).toBe('1.2.0')
    expect(headers.cred).toBe('cred-value')
    expect(headers.sign).toBe(expectedSign('/api/v1/game/player/binding', '', headers.timestamp, TOKEN))
    expect(headers.dId).toContain('Mozilla/5.0')
  })
})

describe('fetchSklandBinding', () => {
  it('解析明日方舟绑定列表', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/player/binding')
      const headers = init?.headers as Record<string, string>
      expect(headers.cred).toBe('cred-value')
      return jsonResponse({
        code: 0,
        data: {
          list: [
            { appCode: 'other-game', bindingList: [{ uid: '0' }] },
            {
              appCode: 'arknights',
              bindingList: [
                { uid: '111', nickName: '博士A', isOfficial: true, isDefault: true, channelMasterId: 1, channelName: '官服' },
                { uid: '222', nickName: '博士B', isOfficial: false, channelMasterId: 2, channelName: 'Bilibili' }
              ]
            }
          ]
        }
      })
    }
    const bindings = await fetchSklandBinding('cred-value', TOKEN, fetchFn as typeof fetch)
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toMatchObject({ uid: '111', nickName: '博士A', channelName: '官服', channelMasterId: 1 })
    expect(bindings[1]?.uid).toBe('222')
  })

  it('凭证失效时抛出 SklandError', async () => {
    const fetchFn = async () => jsonResponse({ code: 10000003, message: 'token 过期' })
    await expect(fetchSklandBinding('bad-cred', TOKEN, fetchFn as typeof fetch)).rejects.toThrow(/凭证错误或已失效/)
  })
})

describe('fetchCultivateData', () => {
  it('拉取并过滤仓库数据，签名 query 参与请求', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/cultivate/player?uid=135297507')
      const headers = init?.headers as Record<string, string>
      expect(headers.sign).toBeTruthy()
      return jsonResponse({
        code: 0,
        data: {
          items: [
            { id: '30012', count: 120 },
            { id: '2001', count: 3 },
            { count: 999 }
          ],
          characters: [{ id: 'char_002_amiya', level: 50 }]
        }
      })
    }
    const data = await fetchCultivateData('135297507', 'cred-value', TOKEN, fetchFn as typeof fetch)
    expect(data.items).toEqual([
      { id: '30012', count: 120 },
      { id: '2001', count: 3 }
    ])
    expect(data.characters).toHaveLength(1)
  })
})
