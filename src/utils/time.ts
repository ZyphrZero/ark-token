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
