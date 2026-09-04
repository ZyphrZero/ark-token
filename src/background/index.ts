import {
  addFriendByUid,
  fetchAssistInfo,
  fetchAssistUserInfo,
  searchAssist,
  type AssistInfo,
  type AssistSearchRequest,
  type AssistSearchResult,
  type AssistUserInfo
} from '../core/sklandAssist'
import { SklandError } from '../core/errors'
import { exchangeHgToken } from '../core/hgAuth'
import { syncAccount } from '../core/sync'
import { getSecurityStatus, loadState, saveState } from '../storage/store'
import type { GameAccount, YituliuTokens } from '../core/types'
import { applyInfoRefreshAlarm, handleInfoAlarm, refreshInfoById } from './infoRefresh'

/**
 * MV3 service worker：
 * - 处理弹窗/管理页发来的同步请求（在后台执行，弹窗关闭也能继续）
 * - 按 settings 维护 chrome.alarms 定时自动同步
 * - 状态面板数据定时刷新与公招/理智桌面通知（见 infoRefresh.ts）
 */

const AUTO_SYNC_ALARM = 'yituliu-auto-sync'

/** 正在同步的账号 id，防止重复触发 */
const inFlight = new Set<string>()

/** 设置了主密码且未解锁时，凭据不可用；定时任务静默跳过，手动操作给出提示 */
async function lockedMessage(action = '同步'): Promise<string | null> {
  const status = await getSecurityStatus()
  return status.unlocked ? null : `插件已锁定：请先输入主密码解锁后再${action}`
}

/** 以补丁方式写回账号，避免覆盖同步期间用户在管理页保存的 token 等修改 */
async function patchAccount(accountId: string, patch: Partial<GameAccount>): Promise<void> {
  const state = await loadState()
  const index = state.accounts.findIndex(item => item.id === accountId)
  if (index < 0) {
    return
  }
  state.accounts[index] = { ...state.accounts[index], ...patch }
  await saveState(state)
}

async function runSync(account: GameAccount, yituliuTokens: YituliuTokens, backendBaseUrl: string, skipVerify = false): Promise<void> {
  if (inFlight.has(account.id)) {
    return
  }
  inFlight.add(account.id)
  try {
    await patchAccount(account.id, { lastSync: { time: Date.now(), status: 'syncing' } })
    const outcome = await syncAccount(account, yituliuTokens, backendBaseUrl, { skipVerify })
    await patchAccount(account.id, {
      skland: outcome.account.skland,
      lastSync: outcome.account.lastSync
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await patchAccount(account.id, { lastSync: { time: Date.now(), status: 'failed', message } })
  } finally {
    inFlight.delete(account.id)
  }
}

async function syncById(accountId: string): Promise<string> {
  const locked = await lockedMessage()
  if (locked) {
    return locked
  }
  const state = await loadState()
  const account = state.accounts.find(item => item.id === accountId)
  if (!account) {
    return '账号不存在'
  }
  await runSync(account, state.settings.yituliuTokens, state.settings.backendBaseUrl)
  return 'ok'
}

/** 返回 false 表示因锁定跳过本次同步 */
async function syncAll(): Promise<boolean> {
  if (await lockedMessage()) {
    return false
  }
  const state = await loadState()
  for (const account of state.accounts) {
    await runSync(account, state.settings.yituliuTokens, state.settings.backendBaseUrl)
  }
  return true
}

/** 正在发送的好友申请，避免重复点击造成重复请求 */
const friendInFlight = new Set<string>()
const assistInFlight = new Set<string>()

async function withAssistCredential<T>(
  account: GameAccount,
  operation: (credential: GameAccount['skland']) => Promise<T>,
  backendBaseUrl: string
): Promise<T> {
  try {
    return await operation(account.skland)
  } catch (error) {
    if (!(error instanceof SklandError) || !account.hgToken) {
      throw error
    }
    const refreshed = await exchangeHgToken(account.hgToken, backendBaseUrl)
    const result = await operation(refreshed)
    await patchAccount(account.id, { skland: refreshed })
    return result
  }
}

async function getAssistAccount(accountId: string): Promise<{ account?: GameAccount; error?: string }> {
  const locked = await lockedMessage('使用助战功能')
  if (locked) {
    return { error: locked }
  }
  const state = await loadState()
  const account = state.accounts.find(item => item.id === accountId)
  return account ? { account } : { error: '账号不存在' }
}

async function loadAssistInfoById(accountId: string): Promise<{ ok: boolean; data?: AssistInfo; message?: string }> {
  const selected = await getAssistAccount(accountId)
  if (!selected.account) {
    return { ok: false, message: selected.error }
  }
  const state = await loadState()
  const key = `info:${accountId}`
  if (assistInFlight.has(key)) {
    return { ok: false, message: '助战配置正在加载，请稍候' }
  }
  assistInFlight.add(key)
  try {
    const data = await withAssistCredential(
      selected.account,
      credential => fetchAssistInfo(credential.cred, credential.token),
      state.settings.backendBaseUrl
    )
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    assistInFlight.delete(key)
  }
}

async function loadAssistUserInfoById(accountId: string): Promise<{ ok: boolean; data?: AssistUserInfo; message?: string }> {
  const selected = await getAssistAccount(accountId)
  if (!selected.account) {
    return { ok: false, message: selected.error }
  }
  const state = await loadState()
  const key = `user-info:${accountId}`
  if (assistInFlight.has(key)) {
    return { ok: false, message: '助战身份正在加载，请稍候' }
  }
  assistInFlight.add(key)
  try {
    const data = await withAssistCredential(
      selected.account,
      credential => fetchAssistUserInfo(selected.account!.uid, credential.cred, credential.token),
      state.settings.backendBaseUrl
    )
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    assistInFlight.delete(key)
  }
}

async function searchAssistById(
  accountId: string,
  request: Omit<AssistSearchRequest, 'uid'>
): Promise<{ ok: boolean; data?: AssistSearchResult; message?: string }> {
  const selected = await getAssistAccount(accountId)
  if (!selected.account) {
    return { ok: false, message: selected.error }
  }
  const state = await loadState()
  const key = `search:${accountId}:${JSON.stringify(request)}`
  if (assistInFlight.has(key)) {
    return { ok: false, message: '相同的助战检索正在进行，请稍候' }
  }
  assistInFlight.add(key)
  try {
    const data = await withAssistCredential(
      selected.account,
      credential => searchAssist({ ...request, uid: selected.account!.uid }, credential.cred, credential.token),
      state.settings.backendBaseUrl
    )
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    assistInFlight.delete(key)
  }
}

async function addFriendById(accountId: string, targetUid: string): Promise<{ ok: boolean; message?: string }> {
  const locked = await lockedMessage('添加好友')
  if (locked) {
    return { ok: false, message: locked }
  }

  const normalizedTargetUid = targetUid.trim()
  if (!normalizedTargetUid) {
    return { ok: false, message: '目标 UID 不能为空' }
  }

  const state = await loadState()
  const account = state.accounts.find(item => item.id === accountId)
  if (!account) {
    return { ok: false, message: '账号不存在' }
  }
  if (account.uid.trim() === normalizedTargetUid) {
    return { ok: false, message: '不能添加自己为好友' }
  }

  const requestKey = `${accountId}:${normalizedTargetUid}`
  if (friendInFlight.has(requestKey)) {
    return { ok: false, message: '该好友申请正在处理中，请稍候' }
  }
  friendInFlight.add(requestKey)

  try {
    await withAssistCredential(
      account,
      credential => addFriendByUid(account.uid, normalizedTargetUid, credential.cred, credential.token),
      state.settings.backendBaseUrl
    )
    return { ok: true, message: `已向 UID ${normalizedTargetUid} 发送好友申请` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    friendInFlight.delete(requestKey)
  }
}

export async function applyAutoSyncAlarm(): Promise<void> {
  await chrome.alarms.clear(AUTO_SYNC_ALARM)
  const state = await loadState()
  if (!state.settings.autoSyncEnabled) {
    return
  }
  const periodMinutes = Math.max(1, Math.round(state.settings.autoSyncIntervalHours * 60))
  await chrome.alarms.create(AUTO_SYNC_ALARM, {
    delayInMinutes: periodMinutes,
    periodInMinutes: periodMinutes
  })
}

type PopupMessage =
  | { type: 'sync'; accountId?: string }
  | { type: 'addFriend'; accountId: string; targetUid: string }
  | { type: 'assistInfo'; accountId: string }
  | { type: 'assistUserInfo'; accountId: string }
  | { type: 'searchAssist'; accountId: string; request: Omit<AssistSearchRequest, 'uid'> }
  | { type: 'applyAutoSync' }
  | { type: 'refreshInfo'; accountId?: string }
  | { type: 'applyInfoRefresh' }
  | { type: 'ping' }

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (message?.type) {
        case 'ping':
          sendResponse({ ok: true })
          break
        case 'sync':
          if (message.accountId) {
            const result = await syncById(message.accountId)
            sendResponse({ ok: result === 'ok', message: result === 'ok' ? undefined : result })
          } else {
            const ran = await syncAll()
            sendResponse({ ok: ran, message: ran ? undefined : '插件已锁定：请先输入主密码解锁后再同步' })
          }
          break
        case 'addFriend':
          sendResponse(await addFriendById(message.accountId, message.targetUid))
          break
        case 'assistInfo':
          sendResponse(await loadAssistInfoById(message.accountId))
          break
        case 'assistUserInfo':
          sendResponse(await loadAssistUserInfoById(message.accountId))
          break
        case 'searchAssist':
          sendResponse(await searchAssistById(message.accountId, message.request))
          break
        case 'applyAutoSync':
          await applyAutoSyncAlarm()
          sendResponse({ ok: true })
          break
        case 'refreshInfo':
          sendResponse(await refreshInfoById(message.accountId))
          break
        case 'applyInfoRefresh':
          await applyInfoRefreshAlarm()
          sendResponse({ ok: true })
          break
        default:
          sendResponse({ ok: false, message: '未知消息类型' })
      }
    } catch (error) {
      // service worker 内的意外异常，不能让消息通道挂起
      sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  })()
  // 异步响应
  return true
})

chrome.alarms.onAlarm.addListener(alarm => {
  void (async () => {
    // 面板刷新与通知 alarm 先行分发；未命中再走一图流定时同步
    if (await handleInfoAlarm(alarm)) {
      return
    }
    if (alarm.name === AUTO_SYNC_ALARM) {
      void syncAll()
    }
  })
})

chrome.runtime.onInstalled.addListener(() => {
  void applyAutoSyncAlarm()
  void applyInfoRefreshAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  void applyAutoSyncAlarm()
  void applyInfoRefreshAlarm()
})
