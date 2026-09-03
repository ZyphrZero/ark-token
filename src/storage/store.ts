import type { ExtensionSettings, GameAccount, PluginState } from '../core/types'

/**
 * chrome.storage.local 存取封装。
 * 所有数据只保存在浏览器本地；token 属敏感凭据，不写入日志、不上报。
 *
 * StorageArea 接口与 chrome.storage.local 结构兼容，测试中可注入内存实现。
 */

export interface StorageArea {
  get(callback: (items: Record<string, unknown>) => void): void
  set(items: Record<string, unknown>, callback?: () => void): void
}

export const STORAGE_KEY = 'yituliu-plugin-state'

export const DEFAULT_BACKEND_BASE_URL = 'https://backend.yituliu.cn'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  autoSyncEnabled: false,
  autoSyncIntervalHours: 24
}

function normalizeState(raw: unknown): PluginState {
  if (!raw || typeof raw !== 'object') {
    // 不能直接展开 DEFAULT_STATE：accounts 数组会被共享引用，随后被 push 污染
    return { accounts: [], activeAccountId: null, settings: { ...DEFAULT_SETTINGS } }
  }
  const partial = raw as Partial<PluginState>
  const settings = { ...DEFAULT_SETTINGS, ...(partial.settings ?? {}) }
  const accounts = Array.isArray(partial.accounts) ? [...partial.accounts] : []
  const activeAccountId =
    partial.activeAccountId && accounts.some(account => account.id === partial.activeAccountId)
      ? partial.activeAccountId
      : (accounts[0]?.id ?? null)
  return { accounts, activeAccountId, settings }
}

export function defaultStorageArea(): StorageArea {
  return globalThis.chrome?.storage?.local as unknown as StorageArea
}

export async function loadState(area: StorageArea = defaultStorageArea()): Promise<PluginState> {
  return new Promise(resolve => {
    area.get(items => {
      resolve(normalizeState(items[STORAGE_KEY]))
    })
  })
}

export async function saveState(state: PluginState, area: StorageArea = defaultStorageArea()): Promise<void> {
  return new Promise(resolve => {
    area.set({ [STORAGE_KEY]: state }, () => resolve())
  })
}

/** 新增或更新账号（按 id 匹配）；首个账号自动设为激活 */
export async function upsertAccount(account: GameAccount, area: StorageArea = defaultStorageArea()): Promise<PluginState> {
  const state = await loadState(area)
  const index = state.accounts.findIndex(item => item.id === account.id)
  if (index >= 0) {
    state.accounts[index] = account
  } else {
    state.accounts.push(account)
  }
  if (!state.activeAccountId) {
    state.activeAccountId = account.id
  }
  await saveState(state, area)
  return state
}

export async function removeAccount(accountId: string, area: StorageArea = defaultStorageArea()): Promise<PluginState> {
  const state = await loadState(area)
  state.accounts = state.accounts.filter(account => account.id !== accountId)
  if (state.activeAccountId === accountId) {
    state.activeAccountId = state.accounts[0]?.id ?? null
  }
  await saveState(state, area)
  return state
}

export async function setActiveAccount(accountId: string, area: StorageArea = defaultStorageArea()): Promise<PluginState> {
  const state = await loadState(area)
  if (!state.accounts.some(account => account.id === accountId)) {
    return state
  }
  state.activeAccountId = accountId
  await saveState(state, area)
  return state
}

export async function updateSettings(patch: Partial<ExtensionSettings>, area: StorageArea = defaultStorageArea()): Promise<PluginState> {
  const state = await loadState(area)
  state.settings = { ...state.settings, ...patch }
  await saveState(state, area)
  return state
}

/** 监听本地存储变化（弹窗/管理页实时刷新）；返回取消订阅函数 */
export function subscribeState(callback: (state: PluginState) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      callback(normalizeState(changes[STORAGE_KEY].newValue))
    }
  }
  globalThis.chrome?.storage?.onChanged?.addListener(listener)
  return () => {
    globalThis.chrome?.storage?.onChanged?.removeListener(listener)
  }
}
