import { describe, expect, it } from 'vitest'

import { mergeRecruitNotifications, parseRecruitSlot } from './recruit'
import type { SklandRecruit } from '../skland-info'

const NOW = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW / 1000)

function recruit(partial: Partial<SklandRecruit>): SklandRecruit {
  return { startTs: NOW_SEC - 3600, finishTs: NOW_SEC + 3600, state: 2, ...partial }
}

describe('parseRecruitSlot', () => {
  it('state 0 为未解锁', () => {
    expect(parseRecruitSlot(recruit({ state: 0 }), NOW)).toEqual({
      status: 'locked',
      finishAtMs: null,
      remainMs: null
    })
  })

  it('state 1 为待开始', () => {
    expect(parseRecruitSlot(recruit({ state: 1 }), NOW).status).toBe('standby')
  })

  it('state 2 未到 finishTs 为招募中并给出剩余时间', () => {
    const state = parseRecruitSlot(recruit({ finishTs: NOW_SEC + 1800 }), NOW)
    expect(state.status).toBe('recruiting')
    expect(state.remainMs).toBe(1_800_000)
    expect(state.finishAtMs).toBe((NOW_SEC + 1800) * 1000)
  })

  it('state 2 已过 finishTs 转为已完成', () => {
    expect(parseRecruitSlot(recruit({ finishTs: NOW_SEC - 1 }), NOW).status).toBe('completed')
  })

  it('state 3 为已完成', () => {
    expect(parseRecruitSlot(recruit({ state: 3 }), NOW).status).toBe('completed')
  })

  it('未知 state 按未解锁兜底', () => {
    expect(parseRecruitSlot(recruit({ state: 9 as 0 }), NOW).status).toBe('locked')
  })
})

describe('mergeRecruitNotifications', () => {
  it('只保留招募中且完成时刻在未来的槽位', () => {
    const merged = mergeRecruitNotifications([
      recruit({ state: 0, startTs: 0, finishTs: 0 }),
      recruit({ state: 1, startTs: 0, finishTs: 0 }),
      recruit({ state: 3 }),
      recruit({ state: 2, finishTs: NOW_SEC - 10 })
    ], NOW)
    expect(merged).toEqual([])
  })

  it('3 分钟内先后完成的槽位合并为一条通知', () => {
    const merged = mergeRecruitNotifications([
      recruit({ startTs: 100, finishTs: NOW_SEC + 600 }),
      recruit({ startTs: 200, finishTs: NOW_SEC + 600 + 179 })
    ], NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('公招栏位1、公招栏位2')
    // 合并组取较晚的完成时刻
    expect(merged[0]?.finishAtMs).toBe((NOW_SEC + 600 + 179) * 1000)
  })

  it('间隔超过 3 分钟不合并', () => {
    const merged = mergeRecruitNotifications([
      recruit({ startTs: 100, finishTs: NOW_SEC + 600 }),
      recruit({ startTs: 200, finishTs: NOW_SEC + 600 + 181 })
    ], NOW)
    expect(merged).toHaveLength(2)
  })

  it('相邻链式合并（1-2、2-3 各在窗口内）', () => {
    const merged = mergeRecruitNotifications([
      recruit({ startTs: 100, finishTs: NOW_SEC + 600 }),
      recruit({ startTs: 200, finishTs: NOW_SEC + 600 + 120 }),
      recruit({ startTs: 300, finishTs: NOW_SEC + 600 + 240 })
    ], NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('公招栏位1、公招栏位2、公招栏位3')
  })

  it('乱序输入按完成时间排序后再合并', () => {
    const merged = mergeRecruitNotifications([
      recruit({ startTs: 200, finishTs: NOW_SEC + 900 }),
      recruit({ startTs: 100, finishTs: NOW_SEC + 600 })
    ], NOW)
    expect(merged).toHaveLength(2)
    expect(merged[0]?.finishAtMs).toBeLessThan(merged[1]?.finishAtMs ?? Number.MAX_SAFE_INTEGER)
  })
})
