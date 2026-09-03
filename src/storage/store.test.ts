import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  loadState,
  removeAccount,
  saveState,
  setActiveAccount,
  STORAGE_KEY,
  updateSettings,
  upsertAccount
} from './store'
import type { GameAccount } from '../core/types'
import type { StorageArea } from './store'

function makeAccount(id: string, uid: string): GameAccount {
  return {
    id,
    uid,
    nickName: `博士${id}`,
    channelName: '官服',
    channelMasterId: 1,
    skland: { cred: `cred-${id}`, token: `token-${id}`, obtainedAt: 1 },
    yituliu: { writeToken: 'f'.repeat(32) }
  }
}

function memoryStorage(initial: Record<string, unknown> = {}): StorageArea {
  let data = { ...initial }
  return {
    get(callback) {
      // 模拟 chrome.storage.local：只返回请求的 key（本封装始终请求全部）
      callback(data)
    },
    set(items, callback) {
      data = { ...data, ...items }
      callback?.()
    }
  }
}

let area: StorageArea

beforeEach(() => {
  area = memoryStorage()
})

describe('store 状态读写', () => {
  it('空存储返回默认状态', async () => {
    const state = await loadState(area)
    expect(state.accounts).toEqual([])
    expect(state.activeAccountId).toBeNull()
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('损坏数据回落到默认状态', async () => {
    const broken = memoryStorage({ [STORAGE_KEY]: 'not-an-object' })
    const state = await loadState(broken)
    expect(state.accounts).toEqual([])
  })
})

describe('账号管理与隔离', () => {
  it('新增第一个账号后自动激活', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    const state = await loadState(area)
    expect(state.accounts).toHaveLength(1)
    expect(state.activeAccountId).toBe('a1')
  })

  it('按 id 更新账号，其他账号不受影响', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    await upsertAccount(makeAccount('a2', '222'), area)

    const updated: GameAccount = { ...makeAccount('a1', '111'), nickName: '改名博士' }
    await upsertAccount(updated, area)

    const state = await loadState(area)
    expect(state.accounts).toHaveLength(2)
    expect(state.accounts.find(account => account.id === 'a1')?.nickName).toBe('改名博士')
    expect(state.accounts.find(account => account.id === 'a2')?.nickName).toBe('博士a2')
  })

  it('切换激活账号', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    await upsertAccount(makeAccount('a2', '222'), area)
    const state = await setActiveAccount('a2', area)
    expect(state.activeAccountId).toBe('a2')
    expect((await loadState(area)).activeAccountId).toBe('a2')
  })

  it('切换到不存在的账号不生效', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    const state = await setActiveAccount('missing', area)
    expect(state.activeAccountId).toBe('a1')
  })

  it('删除当前激活账号后自动切换到剩余账号', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    await upsertAccount(makeAccount('a2', '222'), area)
    const state = await removeAccount('a1', area)
    expect(state.accounts).toHaveLength(1)
    expect(state.activeAccountId).toBe('a2')
  })

  it('删除最后一个账号后无激活账号', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    const state = await removeAccount('a1', area)
    expect(state.accounts).toEqual([])
    expect(state.activeAccountId).toBeNull()
  })
})

describe('设置更新', () => {
  it('局部更新并与默认值合并', async () => {
    await updateSettings({ autoSyncEnabled: true, autoSyncIntervalHours: 12 }, area)
    const state = await loadState(area)
    expect(state.settings.autoSyncEnabled).toBe(true)
    expect(state.settings.autoSyncIntervalHours).toBe(12)
    expect(state.settings.backendBaseUrl).toBe(DEFAULT_SETTINGS.backendBaseUrl)
  })
})

describe('saveState 往返', () => {
  it('保存后可完整读回', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    const before = await loadState(area)
    await saveState(before, area)
    const after = await loadState(area)
    expect(after).toEqual(before)
  })
})
