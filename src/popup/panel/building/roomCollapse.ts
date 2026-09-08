import { useCallback, useState } from 'react'

/**
 * 基建房间的折叠状态（按房间持久化）。
 *
 * 用 localStorage 而非 chrome.storage：popup 每次打开都是新页面，chrome.storage 是
 * **异步**的，首帧读不到状态会先按展开渲染再收起，能看到明显跳动；localStorage 同步
 * 可读，首帧即为正确状态。折叠偏好不含敏感信息，也不需要跨设备同步，故不进
 * chrome.storage 的账号状态（那里有加密与 schema 迁移成本）。
 *
 * 只存**已折叠**的房间 key：默认全部展开，新增房间（玩家扩建基建）自然按展开呈现。
 */
export const ROOM_COLLAPSE_STORAGE_KEY = 'ark-token:building-collapsed'

/** 存储接口，方便测试注入（node 环境无 localStorage） */
export interface RoomCollapseStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 默认用 window.localStorage（同步可读，首帧即为正确状态） */
const defaultStorage = (): RoomCollapseStorage | null =>
  typeof localStorage === 'undefined' ? null : localStorage

/** 读取已折叠的房间 key；存储不可用/数据损坏时退回空集（全部展开） */
export function loadCollapsedKeys(storage: RoomCollapseStorage | null | undefined): Set<string> {
  try {
    const raw = storage?.getItem(ROOM_COLLAPSE_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    // 读失败不影响功能，按全部展开处理
    return new Set()
  }
}

/** 持久化（写 localStorage）；存储不可用/配额满时静默，不影响本会话交互 */
export function persistKeys(storage: RoomCollapseStorage | null | undefined, keys: Set<string>): void {
  try {
    storage?.setItem(ROOM_COLLAPSE_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // 写失败（配额/隐私模式）只丢失偏好，不影响本次会话内的折叠交互
  }
}

export interface RoomCollapse {
  /** 该房间当前是否折叠 */
  isCollapsed: (roomKey: string) => boolean
  /** 切换折叠状态并持久化 */
  toggle: (roomKey: string) => void
  /** 当前折叠的房间数（供「全部展开」等整体操作判断） */
  collapsedCount: number
  /** 全部展开（清空折叠集合） */
  expandAll: () => void
  /** 全部折叠 */
  collapseAll: (roomKeys: string[]) => void
}

/** 基建房间折叠状态（在 BuildingTab 顶层调用一次，向下传递，避免多份状态互相覆盖） */
export function useRoomCollapse(): RoomCollapse {
  // 惰性初始化：仅首帧读一次 localStorage
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsedKeys(defaultStorage()))

  const toggle = useCallback((roomKey: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (!next.delete(roomKey)) {
        next.add(roomKey)
      }
      persistKeys(defaultStorage(), next)
      return next
    })
  }, [])

  const isCollapsed = useCallback((roomKey: string) => collapsed.has(roomKey), [collapsed])
  const expandAll = useCallback(() => {
    setCollapsed(new Set())
    persistKeys(defaultStorage(), new Set())
  }, [])
  const collapseAll = useCallback((roomKeys: string[]) => {
    const next = new Set(roomKeys)
    setCollapsed(next)
    persistKeys(defaultStorage(), next)
  }, [])

  return {
    isCollapsed,
    toggle,
    collapsedCount: collapsed.size,
    expandAll,
    collapseAll
  }
}
