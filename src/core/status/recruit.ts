import type { SklandRecruit } from '../skland-info'

export type RecruitSlotStatus = 'locked' | 'standby' | 'recruiting' | 'completed'

export interface RecruitSlotState {
  status: RecruitSlotStatus
  /** 完成时刻（毫秒）；locked/standby 无意义为 null */
  finishAtMs: number | null
  /** 距完成剩余毫秒；仅 recruiting 为非 null（可能为负，表示刚过完成时刻） */
  remainMs: number | null
}

/**
 * 公招槽位状态机：state 0=未解锁 1=待开始 2=招募中（按 finishTs 判断是否已完成）3=已完成。
 * 与 rhodes-headquarters 的 useRecruits 等价（改写为纯函数）。
 */
export function parseRecruitSlot(recruit: SklandRecruit, nowMs: number): RecruitSlotState {
  switch (recruit.state) {
    case 0:
      return { status: 'locked', finishAtMs: null, remainMs: null }
    case 1:
      return { status: 'standby', finishAtMs: null, remainMs: null }
    case 3:
      return { status: 'completed', finishAtMs: null, remainMs: null }
    case 2: {
      const finishAtMs = recruit.finishTs * 1000
      const remainMs = finishAtMs - nowMs
      return remainMs > 0
        ? { status: 'recruiting', finishAtMs, remainMs }
        : { status: 'completed', finishAtMs, remainMs: null }
    }
    default:
      // 未知状态按未解锁兜底，避免面板崩溃
      return { status: 'locked', finishAtMs: null, remainMs: null }
  }
}

export interface MergedRecruitNotice {
  /** 用作通知调度的唯一标识（对齐 rhodes-headquarters 的 once-alarm id 方案） */
  key: string
  title: string
  /** 完成时刻（毫秒），合并组内取较晚者 */
  finishAtMs: number
}

/** 3 分钟内先后完成的槽位合并为一条通知 */
const MERGE_WINDOW_MS = 3 * 60_000

/**
 * 合并公招完成通知：移植自 rhodes-headquarters 的 mergeRecruits，
 * 仅保留正在招募（state=2）且完成时刻在未来 的槽位，避免给锁定/待开始槽位排无效通知。
 */
export function mergeRecruitNotifications(recruits: SklandRecruit[], nowMs: number): MergedRecruitNotice[] {
  const pending = recruits
    .map((recruit, index) => ({ recruit, index }))
    .filter(({ recruit }) => recruit.state === 2)
    .map(({ recruit, index }) => ({
      key: `recruit-${recruit.startTs}-${index}`,
      title: `公招栏位${index + 1}`,
      finishAtMs: recruit.finishTs * 1000
    }))
    .filter(item => item.finishAtMs > nowMs)
    .sort((a, b) => a.finishAtMs - b.finishAtMs)

  return pending.reduce<MergedRecruitNotice[]>((acc, cur) => {
    const last = acc[acc.length - 1]
    if (last && cur.finishAtMs - last.finishAtMs <= MERGE_WINDOW_MS) {
      acc[acc.length - 1] = {
        key: cur.key,
        title: `${last.title}、${cur.title}`,
        finishAtMs: cur.finishAtMs
      }
      return acc
    }
    acc.push(cur)
    return acc
  }, [])
}
