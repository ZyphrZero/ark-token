import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  addFriendByUid,
  authorizeAssistSupport,
  fetchAssistInfo,
  fetchAssistUserInfo,
  searchAssist
} from './sklandAssist'

const NOW = 1_700_000_000_000
const TOKEN = 'test-signing-secret'
const CRED = 'test-cred'
const SIGN_D_ID = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function encodedContent(value: unknown): string {
  return btoa(new TextEncoder().encode(JSON.stringify(value)).reduce((binary, byte) => binary + String.fromCharCode(byte), ''))
}

function expectedSign(path: string, params: string, token: string): { timestamp: string; sign: string } {
  const timestamp = String(Math.floor((NOW - 300) / 1000))
  const headers = JSON.stringify({ platform: '3', timestamp, dId: SIGN_D_ID, vName: '1.2.0' })
  const text = path + params + timestamp + headers
  const hmacHex = createHmac('sha256', token).update(text, 'utf-8').digest('hex')
  return { timestamp, sign: createHash('md5').update(hmacHex, 'utf-8').digest('hex') }
}

describe('fetchAssistInfo', () => {
  it('请求配置并解码 Base64 JSON', async () => {
    const info = {
      characters: [{ id: 'char_002_amiya', name: '阿米娅', rarity: 4, profession: 'CASTER', skills: [], equips: [] }],
      levelMax: [{ evolvePhase: 2, rarity: 5, maxLevel: 90 }]
    }
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/assist/info')
      expect(init?.method).toBe('GET')
      const headers = init?.headers as Record<string, string>
      const expected = expectedSign('/api/v1/game/assist/info', '', TOKEN)
      expect(headers.cred).toBe(CRED)
      expect(headers.timestamp).toBe(expected.timestamp)
      expect(headers.sign).toBe(expected.sign)
      return jsonResponse({ code: 0, data: { content: encodedContent(info) } })
    }

    await expect(fetchAssistInfo(CRED, TOKEN, fetchFn as typeof fetch, NOW)).resolves.toEqual(info)
  })

  it('兼容直接业务对象、额外 data 嵌套和裸 Base64 响应', async () => {
    const info = {
      characters: [{ id: 'char_002_amiya', name: '阿米娅', rarity: 4, profession: 'CASTER', skills: [], equips: [] }],
      levelMax: [{ evolvePhase: 2, rarity: 5, maxLevel: 90 }]
    }
    const responses: unknown[] = [
      { code: 0, data: info },
      { code: 0, data: { data: { content: encodedContent(info) } } },
      { code: 0, data: encodedContent(info) },
      { content: encodedContent(info) },
      encodedContent(info)
    ]

    for (const payload of responses) {
      const fetchFn = async () => jsonResponse(payload)
      await expect(fetchAssistInfo(CRED, TOKEN, fetchFn as typeof fetch, NOW)).resolves.toEqual(info)
    }
  })

  it('兼容 URL-safe Base64 内容', async () => {
    const info = { characters: [], levelMax: [] }
    const standard = encodedContent(info)
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const fetchFn = async () => jsonResponse({ code: 0, data: { content: urlSafe } })
    await expect(fetchAssistInfo(CRED, TOKEN, fetchFn as typeof fetch, NOW)).resolves.toEqual(info)
  })
})

describe('fetchAssistUserInfo', () => {
  it('对 UID 进行 URL 编码并使用相同 query 签名', async () => {
    const uid = 'uid/with space'
    const params = `uid=${encodeURIComponent(uid)}`
    const userInfo = {
      gameNickname: '博士甲',
      gameAvatar: { type: 'ICON', id: 'avatar_1' },
      isOfficial: true,
      isAuth: true
    }
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`https://zonai.skland.com/api/v1/game/assist/user-info?${params}`)
      const headers = init?.headers as Record<string, string>
      expect(headers.sign).toBe(expectedSign('/api/v1/game/assist/user-info', params, TOKEN).sign)
      return jsonResponse({ code: 0, data: { content: encodedContent(userInfo) } })
    }

    await expect(fetchAssistUserInfo(uid, CRED, TOKEN, fetchFn as typeof fetch, NOW)).resolves.toEqual(userInfo)
  })

  it('拒绝空 UID 而不发网络请求', async () => {
    const fetchFn = async () => {
      throw new Error('不应发起请求')
    }
    await expect(fetchAssistUserInfo('  ', CRED, TOKEN, fetchFn as typeof fetch, NOW)).rejects.toThrow('uid 不能为空')
  })
})

describe('searchAssist', () => {
  it('发送精确的 POST body，并让 body 参与签名', async () => {
    const request = {
      uid: '135297507',
      charId: 'char_002_amiya',
      level: { evolvePhase: 2, level: 1 },
      skill: { id: 'skchr_amiya_3', level: 3 },
      equip: { id: 'uniequip_002_amiya', level: 2 }
    }
    const body = JSON.stringify(request)
    const result = {
      list: [{
        uid: '987654321',
        name: '助战博士',
        level: 120,
        userId: 'platform-user-id',
        assistChars: [{
          charId: 'char_002_amiya',
          skinId: '',
          level: 90,
          evolvePhase: 2,
          potentialRank: 6,
          skillId: 'skchr_amiya_3',
          mainSkillLvl: 7,
          rarity: 5,
          specializeLevel: 3,
          equip: { id: 'uniequip_002_amiya', level: 2, locked: false },
          profession: 'CASTER'
        }],
        hasSend: false,
        gameDetailOn: true
      }]
    }
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/assist/search')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(body)
      const headers = init?.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers.sign).toBe(expectedSign('/api/v1/game/assist/search', body, TOKEN).sign)
      return jsonResponse({ code: 0, data: { content: encodedContent(result) } })
    }

    await expect(searchAssist(request, CRED, TOKEN, fetchFn as typeof fetch, NOW)).resolves.toEqual(result)
  })

  it('保留搜索结果中的 hasSend 和平台 userId', async () => {
    const result = { list: [{ uid: '1', name: 'A', level: 1, userId: 'platform-1', assistChars: [], hasSend: true, gameDetailOn: false }] }
    const fetchFn = async () => jsonResponse({ code: 0, data: { content: encodedContent(result) } })
    const actual = await searchAssist(
      { uid: 'self', charId: '', level: { evolvePhase: 0, level: 0 }, skill: { id: '', level: 0 }, equip: { id: '', level: 0 } },
      CRED,
      TOKEN,
      fetchFn as typeof fetch,
      NOW
    )
    expect(actual.list[0]).toMatchObject({ uid: '1', userId: 'platform-1', hasSend: true, gameDetailOn: false })
  })
})

describe('addFriendByUid', () => {
  it('只使用自己的游戏 UID 和目标游戏 UID 发起申请', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/game/friend')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ uid: 'self-game-uid', targetUid: 'target-game-uid' }))
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
      return jsonResponse({ code: 0, message: 'OK', timestamp: '1700000000' })
    }

    await expect(addFriendByUid('self-game-uid', 'target-game-uid', CRED, TOKEN, fetchFn as typeof fetch, NOW))
      .resolves.toMatchObject({ code: 0, message: 'OK', timestamp: '1700000000' })
  })

  it('拒绝空的目标 UID', async () => {
    const fetchFn = async () => {
      throw new Error('不应发起请求')
    }
    await expect(addFriendByUid('self', '', CRED, TOKEN, fetchFn as typeof fetch, NOW)).rejects.toThrow('targetUid 不能为空')
  })
})

describe('authorizeAssistSupport', () => {
  it('开启明日方舟游戏关系开关，body 精确且参与签名', async () => {
    const body = JSON.stringify({ games: { privacy: { 1: { gameRelationOn: true } } } })
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://zonai.skland.com/api/v1/user/privacy')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(body)
      const headers = init?.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers.sign).toBe(expectedSign('/api/v1/user/privacy', body, TOKEN).sign)
      return jsonResponse({ code: 0, message: 'OK', timestamp: '1700000000' })
    }

    await expect(authorizeAssistSupport(CRED, TOKEN, fetchFn as typeof fetch, NOW))
      .resolves.toMatchObject({ code: 0, message: 'OK' })
  })

  it('业务错误原样失败', async () => {
    const fetchFn = async () => jsonResponse({ code: 10000003, message: 'token 过期' })
    await expect(authorizeAssistSupport(CRED, TOKEN, fetchFn as typeof fetch, NOW)).rejects.toMatchObject({
      name: 'SklandError',
      sklandCode: 10000003
    })
  })
})

describe('助战接口错误处理', () => {
  it('业务错误保留森空岛错误码', async () => {
    const fetchFn = async () => jsonResponse({ code: 10000003, message: 'token 过期' })
    await expect(fetchAssistInfo(CRED, TOKEN, fetchFn as typeof fetch, NOW)).rejects.toMatchObject({
      name: 'SklandError',
      sklandCode: 10000003
    })
  })

  it('HTTP 错误、缺失 content 和非法 Base64 都会失败', async () => {
    const httpErrorFetch = async () => jsonResponse({}, 503)
    await expect(fetchAssistInfo(CRED, TOKEN, httpErrorFetch as typeof fetch, NOW)).rejects.toThrow('HTTP 503')

    const missingContentFetch = async () => jsonResponse({ code: 0, data: {} })
    await expect(fetchAssistInfo(CRED, TOKEN, missingContentFetch as typeof fetch, NOW)).rejects.toThrow(/未找到可识别的助战数据/)

    const invalidContentFetch = async () => jsonResponse({ code: 0, data: { content: 'not base64!' } })
    await expect(fetchAssistInfo(CRED, TOKEN, invalidContentFetch as typeof fetch, NOW)).rejects.toThrow('不是有效的 Base64')
  })
})
