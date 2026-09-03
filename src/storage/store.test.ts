import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SETTINGS,
  changeSecurityPassphrase,
  getSecurityStatus,
  loadState,
  lockSecurity,
  removeAccount,
  resetSecurity,
  saveState,
  setActiveAccount,
  setupSecurity,
  STORAGE_KEY,
  subscribeState,
  unlockSecurity,
  updateSettings,
  upsertAccount
} from './store'
import type { GameAccount, PluginState } from '../core/types'
import { PluginLockedError, SecurityError } from '../core/errors'
import type { StorageArea } from './store'
import type { SessionArea } from './sessionKey'

const LOW_ITERATIONS = 1000

function makeAccount(id: string, uid: string): GameAccount {
  return {
    id,
    uid,
    nickName: `博士${id}`,
    channelName: '官服',
    channelMasterId: 1,
    skland: { cred: `cred-${id}`, token: `token-${id}`, obtainedAt: 1 }
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

/** 额外暴露原始落盘内容，用于断言磁盘上不存在明文凭据 */
function inspectableStorage(initial: Record<string, unknown> = {}): StorageArea & { raw(): Record<string, unknown> } {
  let data = { ...initial }
  return {
    get(callback) {
      callback(data)
    },
    set(items, callback) {
      data = { ...data, ...items }
      callback?.()
    },
    raw: () => data
  }
}

function memorySession(initial: Record<string, unknown> = {}): SessionArea {
  let data = { ...initial }
  return {
    get(callback) {
      callback(data)
    },
    set(items, callback) {
      data = { ...data, ...items }
      callback?.()
    },
    remove(name, callback) {
      delete data[name]
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

describe('旧版数据迁移：账号上的读写 token 合并到设置层', () => {
  /** 旧版内存/落盘形态：读写 token 挂在每个账号上 */
  function legacyAccount(id: string, uid: string, tokens: Record<string, string>): Record<string, unknown> {
    return { ...makeAccount(id, uid), yituliu: tokens } as unknown as Record<string, unknown>
  }

  function persistedAccounts(storage: StorageArea & { raw(): Record<string, unknown> }): Record<string, unknown>[] {
    return (storage.raw()[STORAGE_KEY] as { accounts: Record<string, unknown>[] }).accounts
  }

  it('明文旧数据：读取即迁移并从账号上剥离', async () => {
    const disk = inspectableStorage({
      [STORAGE_KEY]: {
        accounts: [legacyAccount('a1', '111', { writeToken: 'f'.repeat(32), readToken: 'e'.repeat(32) })],
        activeAccountId: 'a1',
        settings: { ...DEFAULT_SETTINGS }
      }
    })
    const state = await loadState(disk)
    expect(state.settings.yituliuTokens).toEqual({ readToken: 'e'.repeat(32), writeToken: 'f'.repeat(32) })
    expect(state.accounts[0]).not.toHaveProperty('yituliu')

    await saveState(state, disk)
    expect(persistedAccounts(disk)[0]).not.toHaveProperty('yituliu')
  })

  it('多个账号各持部分 token 时分别合并（读/写取首个非空），设置层已有值优先', async () => {
    const disk = inspectableStorage({
      [STORAGE_KEY]: {
        accounts: [
          legacyAccount('a1', '111', { writeToken: 'f'.repeat(32) }),
          legacyAccount('a2', '222', { readToken: 'e'.repeat(32), writeToken: 'old-write' })
        ],
        activeAccountId: 'a1',
        settings: { ...DEFAULT_SETTINGS, yituliuTokens: { readToken: 'kept-read' } }
      }
    })
    const state = await loadState(disk)
    expect(state.settings.yituliuTokens).toEqual({ readToken: 'kept-read', writeToken: 'f'.repeat(32) })
  })

  it('加密模式下旧格式账号：解锁读取后迁移，写回不再携带旧字段', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)

    // 模拟旧版本落盘：往已加密账号上补一个 yituliu 字段
    const persisted = disk.raw()[STORAGE_KEY] as { accounts: Record<string, unknown>[] }
    persisted.accounts[0].yituliu = { writeToken: 'f'.repeat(32) }

    const state = await loadState(disk, session)
    expect(state.settings.yituliuTokens).toEqual({ writeToken: 'f'.repeat(32) })
    expect(state.accounts[0]).not.toHaveProperty('yituliu')

    await saveState(state, disk, session)
    expect(persistedAccounts(disk)[0]).not.toHaveProperty('yituliu')
    // 再读一次仍完整（信封解密 + 迁移幂等）
    expect((await loadState(disk, session)).settings.yituliuTokens).toEqual({ writeToken: 'f'.repeat(32) })
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

describe('主密码加密', () => {
  it('未设置主密码时状态为未配置且视为已解锁', async () => {
    await expect(getSecurityStatus({ area })).resolves.toEqual({ configured: false, unlocked: true })
  })

  it('主密码过短时拒绝设置', async () => {
    await expect(setupSecurity('short', { area, session: memorySession(), iterations: LOW_ITERATIONS }))
      .rejects.toBeInstanceOf(SecurityError)
  })

  it('设置后磁盘上不存在任何明文凭据，内存读回为明文', async () => {
    await upsertAccount(makeAccount('a1', '111'), area)
    await updateSettings({ yituliuTokens: { writeToken: 'f'.repeat(32) } }, area)
    const disk = inspectableStorage()
    // 把已写入的明文状态拷到可检磁盘上再开启加密，模拟老用户迁移
    disk.set({ [STORAGE_KEY]: await new Promise<unknown>(resolve => area.get(items => resolve(items[STORAGE_KEY]))) })
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })

    const raw = JSON.stringify(disk.raw())
    expect(raw).not.toContain('cred-a1')
    expect(raw).not.toContain('token-a1')
    expect(raw).not.toContain('f'.repeat(32))
    expect(raw).toContain('"iv"')

    const state = await loadState(disk, session)
    expect(state.accounts[0].skland.cred).toBe('cred-a1')
    expect(state.settings.yituliuTokens.writeToken).toBe('f'.repeat(32))
    expect(state.security?.version).toBe(1)
    await expect(getSecurityStatus({ area: disk, session })).resolves.toEqual({ configured: true, unlocked: true })
  })

  it('锁定后读回脱敏状态，且禁止写入防止脱敏数据覆盖密文', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)
    await updateSettings({ yituliuTokens: { writeToken: 'f'.repeat(32) } }, disk, session)
    await lockSecurity({ area: disk, session })

    const locked = await loadState(disk, session)
    expect(locked.accounts[0].skland.cred).toBe('')
    expect(locked.settings.yituliuTokens.writeToken).toBeUndefined()
    expect(locked.accounts[0].uid).toBe('111')
    await expect(getSecurityStatus({ area: disk, session })).resolves.toEqual({ configured: true, unlocked: false })

    await expect(saveState(locked, disk, session)).rejects.toBeInstanceOf(PluginLockedError)
    await expect(upsertAccount(makeAccount('a2', '222'), disk, session)).rejects.toBeInstanceOf(PluginLockedError)
    // 锁定期间密文原样保留
    expect(JSON.stringify(disk.raw())).not.toContain('cred-a1')
  })

  it('错误口令解锁失败，正确口令解锁后数据完整', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)
    const before = await loadState(disk, session)
    await lockSecurity({ area: disk, session })

    await expect(unlockSecurity('错误的主密码88', { area: disk, session })).rejects.toBeInstanceOf(SecurityError)
    await expect(getSecurityStatus({ area: disk, session })).resolves.toEqual({ configured: true, unlocked: false })

    await unlockSecurity('主密码测试8888', { area: disk, session })
    expect(await loadState(disk, session)).toEqual(before)
  })

  it('加密模式下新增账号同样落盘为密文', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)

    const raw = JSON.stringify(disk.raw())
    expect(raw).not.toContain('cred-a1')
    expect((await loadState(disk, session)).accounts[0].skland.cred).toBe('cred-a1')
  })

  it('修改主密码后旧口令失效、新口令可用、数据不变', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('旧主密码888888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)
    const before = await loadState(disk, session)

    await changeSecurityPassphrase('旧主密码888888', '新主密码888888', { area: disk, session, iterations: LOW_ITERATIONS })
    // security 配置（盐/校验器）换密码后必然变化，只比较业务数据
    const after = await loadState(disk, session)
    expect(after.accounts).toEqual(before.accounts)
    expect(after.activeAccountId).toBe(before.activeAccountId)
    expect(after.settings).toEqual(before.settings)
    expect(JSON.stringify(disk.raw())).not.toContain('cred-a1')

    await lockSecurity({ area: disk, session })
    await expect(unlockSecurity('旧主密码888888', { area: disk, session })).rejects.toBeInstanceOf(SecurityError)
    await unlockSecurity('新主密码888888', { area: disk, session })
    const reopened = await loadState(disk, session)
    expect(reopened.accounts).toEqual(before.accounts)
    expect(reopened.activeAccountId).toBe(before.activeAccountId)
  })

  it('重置安全配置清空账号并回到明文模式，其他设置保留、token 密文一并清空', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)
    await updateSettings({ autoSyncEnabled: true, yituliuTokens: { writeToken: 'f'.repeat(32) } }, disk, session)

    const state = await resetSecurity({ area: disk, session })
    expect(state.accounts).toEqual([])
    expect(state.security).toBeUndefined()
    expect(state.settings.autoSyncEnabled).toBe(true)
    expect(state.settings.yituliuTokens).toEqual({})
    expect(await getSecurityStatus({ area: disk, session })).toEqual({ configured: false, unlocked: true })
    expect(JSON.stringify(disk.raw())).not.toContain('cred-a1')
    expect(JSON.stringify(disk.raw())).not.toContain('f'.repeat(32))
  })

  it('subscribeState 推送的是按解锁状态解密后的状态', async () => {
    const disk = inspectableStorage()
    const session = memorySession()
    await setupSecurity('主密码测试8888', { area: disk, session, iterations: LOW_ITERATIONS })
    await upsertAccount(makeAccount('a1', '111'), disk, session)

    const received: PluginState[] = []
    const unsubscribe = subscribeState(state => received.push(state), disk, session)
    // 模拟 chrome.storage.onChanged：携带落盘的密文 newValue
    fireOnChanged({ [STORAGE_KEY]: { newValue: disk.raw()[STORAGE_KEY] } })
    unsubscribe()
    // 回调经 WebCrypto 异步解密后触发，完成时间可能晚于一个宏任务
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0].accounts.map(account => account.id)).toEqual(['a1'])
    expect(received[0].accounts[0].skland.cred).toBe('cred-a1')
  })
})

/** stub chrome.storage.onChanged，使 subscribeState 可在 Node 测试环境中注入内存存储 */
const onChangedListeners = new Set<(changes: Record<string, { newValue?: unknown }>, areaName: string) => void>()

beforeEach(() => {
  onChangedListeners.clear()
  ;(globalThis as unknown as { chrome?: unknown }).chrome = {
    storage: {
      onChanged: {
        addListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) =>
          onChangedListeners.add(listener),
        removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) =>
          onChangedListeners.delete(listener)
      }
    }
  }
})

function fireOnChanged(changes: Record<string, { newValue?: unknown }>, areaName = 'local'): void {
  for (const listener of [...onChangedListeners]) {
    listener(changes, areaName)
  }
}
