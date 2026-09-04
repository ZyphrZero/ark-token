import { describe, expect, it } from 'vitest'

import { formatDuration, formatMinutesSeconds, formatRecoveryTime } from './time'

describe('formatMinutesSeconds', () => {
  it('输出「X 分钟 Y 秒」，秒数补零', () => {
    expect(formatMinutesSeconds(3 * 60_000 + 59_000)).toBe('3 分钟 59 秒')
    expect(formatMinutesSeconds(5_000)).toBe('0 分钟 05 秒')
  })

  it('负数按 0 处理', () => {
    expect(formatMinutesSeconds(-1_000)).toBe('0 分钟 00 秒')
  })
})

describe('formatDuration', () => {
  it('小时 + 分钟', () => {
    expect(formatDuration(60 * 60_000)).toBe('1 小时')
    expect(formatDuration(60 * 60_000 + 59 * 60_000)).toBe('1 小时 59 分钟')
    expect(formatDuration(30_000)).toBe('0 分钟')
  })
})

describe('formatRecoveryTime', () => {
  const now = new Date('2026-09-05T10:00:00')

  it('当天显示「今日」，次日显示「明日」', () => {
    expect(formatRecoveryTime(new Date('2026-09-05T18:30').getTime(), now.getTime())).toBe('今日 18 时 30 分')
    expect(formatRecoveryTime(new Date('2026-09-06T01:46').getTime(), now.getTime())).toBe('明日 1 时 46 分')
  })

  it('更远日期显示 N 天后', () => {
    expect(formatRecoveryTime(new Date('2026-09-08T09:05').getTime(), now.getTime())).toBe('3 天后 9 时 5 分')
  })
})
