import { describe, expect, it } from 'vitest'

import { computeSanity, SANITY_RECOVERY_INTERVAL_MS } from './sanity'
import type { SklandActionPoint } from '../skland-info'

const NOW = 1_700_000_000_000

function ap(partial: Partial<SklandActionPoint>): SklandActionPoint {
  return {
    current: 40,
    max: 135,
    lastApAddTime: Math.floor(NOW / 1000) - 600,
    completeRecoveryTime: Math.floor(NOW / 1000) + 3600,
    ...partial
  }
}

describe('computeSanity', () => {
  it('按每 6 分钟 1 点推算当前理智', () => {
    // lastApAddTime 为 10 分钟前：恢复 floor(10/6) = 1 点
    const info = computeSanity(ap({ current: 40 }), NOW)
    expect(info.current).toBe(41)
    expect(info.max).toBe(135)
  })

  it('不足一个恢复周期时不增加', () => {
    const info = computeSanity(ap({ current: 40, lastApAddTime: Math.floor(NOW / 1000) - 300 }), NOW)
    expect(info.current).toBe(40)
    expect(info.nextAddInMs).toBe(SANITY_RECOVERY_INTERVAL_MS - 300_000)
  })

  it('恢复量封顶 max，且不再给出下一恢复点', () => {
    const info = computeSanity(ap({ current: 134, lastApAddTime: Math.floor(NOW / 1000) - 3600 }), NOW)
    expect(info.current).toBe(135)
    expect(info.nextAddAtMs).toBeNull()
    expect(info.nextAddInMs).toBeNull()
    expect(info.completeRecoveryAtMs).toBeNull()
  })

  it('抓取时已满理智直接返回满值', () => {
    const info = computeSanity(ap({ current: 135, max: 135 }), NOW)
    expect(info.current).toBe(135)
    expect(info.nextAddAtMs).toBeNull()
  })

  it('下一恢复点锚定 lastApAddTime 的整数倍周期', () => {
    const lastAddSec = Math.floor(NOW / 1000) - 700
    const info = computeSanity(ap({ current: 40, lastApAddTime: lastAddSec }), NOW)
    // 已恢复 floor(700/360)=1 点，下一个恢复点在第 2 个周期
    expect(info.nextAddAtMs).toBe(lastAddSec * 1000 + 2 * SANITY_RECOVERY_INTERVAL_MS)
    expect(info.completeRecoveryAtMs).toBe((Math.floor(NOW / 1000) + 3600) * 1000)
  })

  it('时钟早于 lastApAddTime（负偏移）时按 0 恢复处理', () => {
    const info = computeSanity(ap({ current: 40, lastApAddTime: Math.floor(NOW / 1000) + 300 }), NOW)
    expect(info.current).toBe(40)
  })
})
