import type { SklandBindingInfo } from '../core/skland-info'

/**
 * 状态面板数据缓存（chrome.storage.local，独立于主状态 yituliu-plugin-state）。
 *
 * 缓存的是森空岛 player/info 的游戏状态数据（理智/公招/基建/任务进度），
 * 不含任何凭据，明文存储；与 uid/昵称等明文字段的策略一致，
 * 锁定期间面板仍可展示缓存数据（实时数值由前端按时间戳推算）。
 */

import type { StorageArea } from './store'

export const INFO_CACHE_KEY = 'yituliu-plugin-info-cache'

export interface AccountInfoEntry {
  data: SklandBindingInfo
  /** 抓取时刻（毫秒时间戳） */
  fetchedAt: number
}

export type InfoCache = Record<string, AccountInfoEntry>

export function defaultInfoCacheArea(): StorageArea {
  return globalThis.chrome?.storage?.local as unknown as StorageArea
}

function normalizeCache(raw: unknown): InfoCache {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const cache: InfoCache = {}
  for (const [accountId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (entry && typeof entry === 'object' && (entry as AccountInfoEntry).data) {
      cache[accountId] = entry as AccountInfoEntry
    }
  }
  return cache
}

function readRawCache(area: StorageArea): Promise<unknown> {
  return new Promise(resolve => {
    area.get(items => resolve(items[INFO_CACHE_KEY]))
  })
}

export async function loadInfoCache(area: StorageArea = defaultInfoCacheArea()): Promise<InfoCache> {
  return normalizeCache(await readRawCache(area))
}

export async function getAccountInfo(
  accountId: string,
  area: StorageArea = defaultInfoCacheArea()
): Promise<AccountInfoEntry | null> {
  return (await loadInfoCache(area))[accountId] ?? null
}

export async function saveAccountInfo(
  accountId: string,
  data: SklandBindingInfo,
  area: StorageArea = defaultInfoCacheArea()
): Promise<void> {
  const cache = await loadInfoCache(area)
  cache[accountId] = { data, fetchedAt: Date.now() }
  await new Promise<void>(resolve => {
    area.set({ [INFO_CACHE_KEY]: cache }, () => resolve())
  })
}

/** 删除账号时清理对应缓存，避免残留 */
export async function removeAccountInfo(
  accountId: string,
  area: StorageArea = defaultInfoCacheArea()
): Promise<void> {
  const cache = await loadInfoCache(area)
  if (!(accountId in cache)) {
    return
  }
  delete cache[accountId]
  await new Promise<void>(resolve => {
    area.set({ [INFO_CACHE_KEY]: cache }, () => resolve())
  })
}

/** 清空全部缓存（忘记主密码重置等清空账号的场景） */
export async function clearInfoCache(area: StorageArea = defaultInfoCacheArea()): Promise<void> {
  await new Promise<void>(resolve => {
    area.set({ [INFO_CACHE_KEY]: {} }, () => resolve())
  })
}

/** 监听缓存变化（面板实时响应后台刷新）；返回取消订阅函数 */
export function subscribeInfoCache(callback: (cache: InfoCache) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === 'local' && changes[INFO_CACHE_KEY]) {
      callback(normalizeCache(changes[INFO_CACHE_KEY].newValue))
    }
  }
  globalThis.chrome?.storage?.onChanged?.addListener(listener)
  return () => {
    globalThis.chrome?.storage?.onChanged?.removeListener(listener)
  }
}
