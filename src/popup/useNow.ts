import { useEffect, useState } from 'react'

/**
 * 实时时钟 hook：每 intervalMs 触发一次重渲染。
 * 驱动理智/公招/无人机等基于时间戳的前端推算，不在 tick 内发起任何网络请求。
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
