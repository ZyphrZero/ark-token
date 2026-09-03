import { syncAccount } from '../core/sync'
import { loadState, saveState } from '../storage/store'
import type { GameAccount } from '../core/types'

/**
 * MV3 service worker：
 * - 处理弹窗/管理页发来的同步请求（在后台执行，弹窗关闭也能继续）
 * - 按 settings 维护 chrome.alarms 定时自动同步
 */

const AUTO_SYNC_ALARM = 'yituliu-auto-sync'

/** 正在同步的账号 id，防止重复触发 */
const inFlight = new Set<string>()

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

async function runSync(account: GameAccount, backendBaseUrl: string, skipVerify = false): Promise<void> {
  if (inFlight.has(account.id)) {
    return
  }
  inFlight.add(account.id)
  try {
    await patchAccount(account.id, { lastSync: { time: Date.now(), status: 'syncing' } })
    const outcome = await syncAccount(account, backendBaseUrl, { skipVerify })
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
  const state = await loadState()
  const account = state.accounts.find(item => item.id === accountId)
  if (!account) {
    return '账号不存在'
  }
  await runSync(account, state.settings.backendBaseUrl)
  return 'ok'
}

async function syncAll(): Promise<void> {
  const state = await loadState()
  for (const account of state.accounts) {
    await runSync(account, state.settings.backendBaseUrl)
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
  | { type: 'applyAutoSync' }
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
            await syncAll()
            sendResponse({ ok: true })
          }
          break
        case 'applyAutoSync':
          await applyAutoSyncAlarm()
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
  if (alarm.name === AUTO_SYNC_ALARM) {
    void syncAll()
  }
})

chrome.runtime.onInstalled.addListener(() => {
  void applyAutoSyncAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  void applyAutoSyncAlarm()
})
