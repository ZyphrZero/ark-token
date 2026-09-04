import { describe, expect, it } from 'vitest'

import { createAssistSearchSession } from './index'
import type { FetchLike } from '../skland'

const CRED = 'test-cred'
const TOKEN = 'test-token'
const UID = '10001'

const INFO_BODY = {
  characters: [
    {
      id: 'char_100_alpha',
      name: '测试干员',
      rarity: 5,
      profession: 'CASTER',
      skills: [{ id: 'char_100_alpha_s1', name: '技能一' }],
      equips: [{ id: 'char_100_alpha_e1', name: '模组一' }],
      isNew: false
    }
  ],
  levelMax: [
    { evolvePhase: 0, rarity: 5, maxLevel: 50 },
    { evolvePhase: 1, rarity: 5, maxLevel: 80 },
    { evolvePhase: 2, rarity: 5, maxLevel: 90 }
  ]
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function makeFetch(options: { authed: boolean }) {
  const calls: string[] = []
  const fetchFn: FetchLike = async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    calls.push(`${init?.method ?? 'GET'} ${href}`)
    if (href.endsWith('/api/v1/game/assist/info')) {
      return jsonResponse({ code: 0, data: INFO_BODY })
    }
    if (href.includes('/api/v1/game/assist/user-info')) {
      return jsonResponse({
        code: 0,
        data: { gameNickname: '博士', isOfficial: true, isAuth: options.authed }
      })
    }
    if (href.endsWith('/api/v1/user/privacy')) {
      return jsonResponse({ code: 0, message: 'OK', timestamp: '1700000000' })
    }
    if (href.endsWith('/api/v1/game/assist/search')) {
      return jsonResponse({ code: 0, data: { list: [{ uid: '2', name: '对方', level: 120, assistChars: [] }] } })
    }
    throw new Error(`未预期的请求：${href}`)
  }
  return { fetchFn, calls }
}

describe('createAssistSearchSession', () => {
  it('默认流程：拉取目录与身份，生成官方默认筛选并发起检索', async () => {
    const { fetchFn, calls } = makeFetch({ authed: true })
    const session = await createAssistSearchSession(UID, CRED, TOKEN, { fetchFn })

    expect(session.userInfo.isAuth).toBe(true)
    expect(session.characters.map(character => character.id)).toEqual(['char_100_alpha'])

    const filter = session.createFilter('char_100_alpha')
    expect(filter).toEqual({
      charId: 'char_100_alpha',
      evolvePhase: 2,
      level: 0,
      skillId: 'char_100_alpha_s1',
      skillLevel: 0,
      equipId: '__badge__',
      equipLevel: 0
    })

    const result = await session.search(filter)
    expect(result.list[0].uid).toBe('2')
    const searchCall = calls.find(call => call.startsWith('POST'))
    expect(searchCall).toContain('/api/v1/game/assist/search')
    expect(calls.some(call => call.includes('/api/v1/user/privacy'))).toBe(false)
  })

  it('autoAuthorize：未开启游戏关系时自动授权并重拉身份', async () => {
    let authed = false
    const fetchFn: FetchLike = async (url: RequestInfo | URL) => {
      const href = String(url)
      if (href.includes('/api/v1/game/assist/user-info')) {
        return jsonResponse({ code: 0, data: { gameNickname: '博士', isOfficial: true, isAuth: authed } })
      }
      if (href.endsWith('/api/v1/user/privacy')) {
        authed = true
        return jsonResponse({ code: 0, message: 'OK', timestamp: '1700000000' })
      }
      if (href.endsWith('/api/v1/game/assist/info')) {
        return jsonResponse({ code: 0, data: INFO_BODY })
      }
      throw new Error(`未预期的请求：${href}`)
    }

    const session = await createAssistSearchSession(UID, CRED, TOKEN, { fetchFn, autoAuthorize: true })
    expect(authed).toBe(true)
    expect(session.userInfo.isAuth).toBe(true)
  })
})
