/** 把时间戳转成「x 分钟前 / x 小时前 / 日期 时间」的友好文案 */
export function formatTimeAgo(timestamp: number, now = Date.now()): string {
  const diffMs = now - timestamp
  if (diffMs < 0) {
    return '刚刚'
  }
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) {
    return '刚刚'
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }
  const date = new Date(timestamp)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** 毫秒 → 「X 小时 Y 分钟」；不足 1 小时只显示分钟，负数按 0 处理 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  }
  return `${minutes} 分钟`
}

/** 毫秒 → 「X 分 Y 秒」（理智下一恢复倒计时用） */
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} 分 ${pad(seconds)} 秒`
}

/** 时间戳 → 「HH:mm」；跨天时显示「MM-dd HH:mm」 */
export function formatClockTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const sameDay = new Date(now).toDateString() === date.toDateString()
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return sameDay ? clock : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}`
}
