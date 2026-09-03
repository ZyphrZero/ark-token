import { describe, expect, it } from 'vitest'

import { describeYituliuError } from './errors'
import { fetchOperatorInfo, uploadOperatorData } from './yituliuApi'
import type { PlayerInfoPayload } from './types'

const BACKEND = 'https://backend.example.test'
const WRITE_TOKEN = 'f'.repeat(32)
const READ_TOKEN = 'e'.repeat(32)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

const SAMPLE_PAYLOAD: PlayerInfoPayload = {
  token: '',
  uid: '135297507',
  nickName: '博士',
  channelName: '官服',
  channelMasterId: 1,
  operatorDataList: [
    {
      charId: 'char_002_amiya',
      own: true,
      level: 50,
      elite: 2,
      potential: 6,
      rarity: 5,
      mainSkill: 7,
      skill1: 7,
      skill2: 0,
      skill3: 0,
      modX: 0,
      modY: 0,
      modD: 0,
      modA: 0,
      modB: 0
    }
  ],
  itemList: []
}

describe('uploadOperatorData', () => {
  it('写 token 原样放 Authorization 头（无前缀），路径与报文正确', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${BACKEND}/open-api/operator/upload`)
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(WRITE_TOKEN)
      const body = JSON.parse(String(init?.body)) as PlayerInfoPayload
      expect(body.uid).toBe('135297507')
      expect(body.operatorDataList[0]?.charId).toBe('char_002_amiya')
      return jsonResponse({ code: 200, msg: '操作成功', data: { affectedRows: 120, updateTime: '2026/09/03 10:00:00' } })
    }

    const result = await uploadOperatorData(SAMPLE_PAYLOAD, WRITE_TOKEN, BACKEND, fetchFn as typeof fetch)
    expect(result.affectedRows).toBe(120)
    expect(result.updateTime).toBe('2026/09/03 10:00:00')
  })

  it('业务错误码抛出 YituliuError（20027 token 失效）', async () => {
    const fetchFn = async () => jsonResponse({ code: 20027, msg: '用户token格式错误或用户未登录' })
    await expect(uploadOperatorData(SAMPLE_PAYLOAD, WRITE_TOKEN, BACKEND, fetchFn as typeof fetch))
      .rejects.toThrow(/token 无效或已过期/)
  })

  it('限流错误码 39007 给出可读提示', async () => {
    const fetchFn = async () => jsonResponse({ code: 39007, msg: '上传过于频繁' })
    await expect(uploadOperatorData(SAMPLE_PAYLOAD, WRITE_TOKEN, BACKEND, fetchFn as typeof fetch))
      .rejects.toThrow(/5 秒/)
  })
})

describe('fetchOperatorInfo', () => {
  it('读 token 放 Authorization 头并解析 V2 数据', async () => {
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${BACKEND}/open-api/operator/info`)
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(READ_TOKEN)
      return jsonResponse({
        code: 200,
        data: [
          {
            id: 'char_002_amiya',
            level: 50,
            evolvePhase: 2,
            mainSkillLevel: 7,
            potentialRank: 5,
            skills: [],
            equips: []
          }
        ]
      })
    }

    const operators = await fetchOperatorInfo(READ_TOKEN, BACKEND, fetchFn as typeof fetch)
    expect(operators).toHaveLength(1)
    expect(operators[0]?.id).toBe('char_002_amiya')
  })
})

describe('describeYituliuError', () => {
  it('已知错误码映射为中文提示', () => {
    expect(describeYituliuError(20010, '')).toContain('权限不足')
    expect(describeYituliuError(10016, '')).toContain('森空岛')
  })

  it('未知错误码保留原始信息', () => {
    expect(describeYituliuError(99999, '服务维护中')).toContain('服务维护中')
  })
})
