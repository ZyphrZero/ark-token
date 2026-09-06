import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { buildSklandHeaders, fetchCultivateData, fetchSklandBinding, fetchSklandPlayerInfo, getSign, isSklandCredentialExpired } from './skland'
import { SklandError } from './errors'

const NOW = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW / 1000)
const TOKEN = 'test-signing-secret'

/** 用 node:crypto 独立实现签名算法（与浏览器端实现互为对照） */
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

describe('fetchSklandPlayerInfo', () => {
  it('拉取状态面板数据，uid 参与签名 query', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/player/info?uid=135297507')
      const headers = init?.headers as Record<string, string>
      expect(headers.cred).toBe('cred-value')
      expect(headers.sign).toBe(expectedSign('/api/v1/game/player/info', 'uid=135297507', headers.timestamp, TOKEN))
      return jsonResponse({
        code: 0,
        data: {
          currentTs: NOW_SEC,
          status: {
            uid: '135297507',
            name: '博士',
            level: 120,
            avatar: { type: 'ICON', id: '1', url: 'https://web.hycdn.cn/arknights/game/assets/avatar/1.png' },
            ap: { current: 40, max: 135, lastApAddTime: NOW_SEC - 60, completeRecoveryTime: NOW_SEC + 3600 },
            charCnt: 200
          },
          recruit: [{ startTs: NOW_SEC - 3600, finishTs: NOW_SEC + 3600, state: 2 }],
          building: null,
          campaign: { reward: { current: 1, total: 2 } },
          tower: { reward: { higherItem: { current: 2, total: 4 }, lowerItem: { current: 1, total: 4 } } },
          routine: { daily: { current: 0, total: 3 }, weekly: { current: 1, total: 6 } },
          chars: [{ charId: 'char_002_amiya', skinId: 'skinid', level: 50, evolvePhase: 2 }]
        }
      })
    }
    const info = await fetchSklandPlayerInfo('135297507', 'cred-value', TOKEN, fetchFn as typeof fetch)
    expect(info.status.name).toBe('博士')
    expect(info.status.ap.current).toBe(40)
    expect(info.recruit).toHaveLength(1)
    expect(info.routine.daily.total).toBe(3)
  })

  it('凭证失效（HTTP 200 + code）时抛出 SklandError', async () => {
    const fetchFn = async () => jsonResponse({ code: 10000003, message: 'token 过期' })
    await expect(fetchSklandPlayerInfo('135297507', 'bad-cred', TOKEN, fetchFn as typeof fetch)).rejects.toThrow(/凭证错误或已失效/)
  })

  it('凭证失效真实形态（HTTP 401 + code 10002 用户未登录，抓包见 skland_dump/CAPTURE_STATUS.txt）抛出带业务码的错误并判定为凭证失效', async () => {
    const fetchFn = async () => jsonResponse({ code: 10002, message: '用户未登录' }, 401)
    const error: unknown = await fetchSklandPlayerInfo('135297507', 'expired-cred', TOKEN, fetchFn as typeof fetch).catch(cause => cause)
    expect(error).toBeInstanceOf(SklandError)
    expect((error as SklandError).sklandCode).toBe(10002)
    expect(isSklandCredentialExpired(error)).toBe(true)
  })

  it('HTTP 401 但 body 非 JSON（代理/WAF 改写）时仍判定为凭证失效', async () => {
    const fetchFn = async () => new Response('<html>Blocked</html>', { status: 401 })
    const error: unknown = await fetchSklandBinding('cred', TOKEN, fetchFn as typeof fetch).catch(cause => cause)
    expect(error).toBeInstanceOf(SklandError)
    expect(isSklandCredentialExpired(error)).toBe(true)
  })

  it('服务端故障（HTTP 503 非 JSON）不误判为凭证失效', async () => {
    const fetchFn = async () => new Response('Service Unavailable', { status: 503 })
    const error: unknown = await fetchSklandPlayerInfo('135297507', 'cred', TOKEN, fetchFn as typeof fetch).catch(cause => cause)
    expect(error).toBeInstanceOf(SklandError)
    expect(isSklandCredentialExpired(error)).toBe(false)
  })

  it('签名时间戳校验失败(10000/10003)提示校准系统时间而非重新扫码', async () => {
    const fetchFn = async () => jsonResponse({ code: 10003, message: '请勿修改设备本地时间' })
    await expect(fetchSklandPlayerInfo('135297507', 'cred', TOKEN, fetchFn as typeof fetch))
      .rejects.toThrow(/签名校验未通过.*系统时间/)
    const fetchFn2 = async () => jsonResponse({ code: 10000, message: '请求异常' })
    await expect(fetchSklandBinding('cred', TOKEN, fetchFn2 as typeof fetch))
      .rejects.toThrow(/签名校验未通过.*系统时间/)
  })
})

describe('凭证失效错误判定', () => {
  it('只将明确的鉴权错误码视为凭证失效', async () => {
    expect(isSklandCredentialExpired(new SklandError('未登录', 10002))).toBe(true)
    expect(isSklandCredentialExpired(new SklandError('凭证过期', 10000003))).toBe(true)
    expect(isSklandCredentialExpired(new SklandError('时间错误', 10003))).toBe(false)
    expect(isSklandCredentialExpired(new SklandError('未知', 500))).toBe(false)
    expect(isSklandCredentialExpired(new Error('not skland'))).toBe(false)
  })

  it('HTTP 401（业务码在 body 中丢失时）同样视为凭证失效', () => {
    expect(isSklandCredentialExpired(new SklandError('HTTP 401', -1, 401))).toBe(true)
    expect(isSklandCredentialExpired(new SklandError('HTTP 503', -1, 503))).toBe(false)
  })
})