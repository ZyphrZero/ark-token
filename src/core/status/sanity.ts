import type { SklandActionPoint } from '../skland-info'

/** 理智恢复速率：每 6 分钟恢复 1 点 */
export const SANITY_RECOVERY_INTERVAL_MS = 6 * 60_000

export interface SanityInfo {
  max: number
  /** 基于 lastApAddTime 前端推算的当前理智（封顶 max） */
  current: number
  /** 下一理智恢复时刻（毫秒）；已满时为 null */
  nextAddAtMs: number | null
  /** 距下一理智恢复的毫秒数；已满时为 null（可能为负，表示恢复时刻刚过、等待下次刷新纠偏） */
  nextAddInMs: number | null
  /** 全部恢复时刻（毫秒，来自服务端 completeRecoveryTime）；已满时为 null */
  completeRecoveryAtMs: number | null
}

/**
 * 理智实时推算。拉取一次数据后即可在本地随时间推进，
 * 与 rhodes-headquarters 的 useSanityInfo 等价（改写为纯函数，不依赖响应式系统）。
 */
export function computeSanity(ap: SklandActionPoint, nowMs: number): SanityInfo {
  const max = ap.max
  if (ap.current >= max) {
    return { max, current: max, nextAddAtMs: null, nextAddInMs: null, completeRecoveryAtMs: null }
  }

  const lastAddMs = ap.lastApAddTime * 1000
  const elapsedMs = Math.max(0, nowMs - lastAddMs)
  const recovered = Math.floor(elapsedMs / SANITY_RECOVERY_INTERVAL_MS)
  const current = Math.min(ap.current + recovered, max)

  if (current >= max) {
    return { max, current, nextAddAtMs: null, nextAddInMs: null, completeRecoveryAtMs: null }
  }

  // 恢复节奏锚定在 lastApAddTime：第 (current - ap.current + 1) 个恢复点
  const nextAddAtMs = lastAddMs + (current - ap.current + 1) * SANITY_RECOVERY_INTERVAL_MS
  return {
    max,
    current,
    nextAddAtMs,
    nextAddInMs: nextAddAtMs - nowMs,
    completeRecoveryAtMs: ap.completeRecoveryTime > 0 ? ap.completeRecoveryTime * 1000 : null
  }
}
