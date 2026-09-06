import { exchangeHgToken } from '../core/hgAuth'
import { fetchSklandPlayerInfo, isSklandCredentialExpired } from '../core/skland'
import type { SklandBindingInfo } from '../core/skland-info'
import { mergeRecruitNotifications } from '../core/status/recruit'
import type { ExtensionSettings, GameAccount } from '../core/types'
import { getSecurityStatus, loadState, saveState } from '../storage/store'
import { saveAccountInfo } from '../storage/infoCache'

/**
 * 状态面板数据刷新与桌面通知调度（在 MV3 service worker 中执行）。
 *
 * 面板刷新只拉森空岛 player/info 写入本地缓存，与一图流上传同步（syncAccount）完全解耦；
 * 理智/公招等实时数值由前端基于时间戳推算，定时刷新仅用于纠偏与重排通知。
 */

export const INFO_REFRESH_ALARM = 'yituliu-info-refresh'

/** 通知 alarm 统一前缀：yituliu-notify-{accountId}:{kind}... */
const NOTIFY_ALARM_PREFIX = 'yituliu-notify-'

function recruitAlarmName(accountId: string, key: string): string {
  return `${NOTIFY_ALARM_PREFIX}${accountId}:recruit-${key}`
}

function sanityAlarmName(accountId: string): string {
  return `${NOTIFY_ALARM_PREFIX}${accountId}:sanity`
}

/** 设置了主密码且未解锁时凭据不可用；定时刷新静默跳过，手动刷新给出提示 */
async function lockedMessage(): Promise<string | null> {
  const status = await getSecurityStatus()
  return status.unlocked ? null : '插件已锁定：请先输入主密码解锁后再刷新面板数据'
}

/** 以补丁方式写回账号，避免覆盖刷新期间用户在管理页保存的修改 */
async function patchAccount(accountId: string, patch: Partial<GameAccount>): Promise<void> {
  const state = await loadState()
  const index = state.accounts.findIndex(item => item.id === accountId)
  if (index < 0) {
    return
  }
  state.accounts[index] = { ...state.accounts[index], ...patch }
  await saveState(state)
}

/**
 * 凭证老化阈值：超过该时长后在面板定时刷新时先主动用 HG token 换新凭证。
 * 森空岛 cred 有效期有限（过期表现为 HTTP 401 + code 10002，抓包见 skland_dump/CAPTURE_STATUS.txt），
 * 每天最多主动续期一次，避免高频授权触发鹰角设备验证风控；未到阈值或续期失败时走下方被动重试兜底。
 */
const CREDENTIAL_PROACTIVE_REFRESH_MS = 24 * 60 * 60 * 1000

/**
 * 森空岛凭证保障：老化时先用官网 HG token 主动续期，请求失败且判定凭证失效时再被动换取重试一次
 * （与 syncAccount 同策略）。主动续期失败不阻断本次刷新——继续用旧凭证请求，真实失败会如实抛出。
 */
async function fetchPlayerInfoWithCredential(
  account: GameAccount,
  backendBaseUrl: string
): Promise<{ info: SklandBindingInfo; refreshed: GameAccount['skland'] | null }> {
  let credential = account.skland
  let refreshed: GameAccount['skland'] | null = null
  if (account.hgToken && Date.now() - credential.obtainedAt > CREDENTIAL_PROACTIVE_REFRESH_MS) {
    try {
      refreshed = await exchangeHgToken(account.hgToken, backendBaseUrl)
      credential = refreshed
    } catch {
      // 主动续期失败（网络/风控）：保留旧凭证继续，过期时由被动重试暴露真实错误
    }
  }
  try {
    const info = await fetchSklandPlayerInfo(account.uid, credential.cred, credential.token)
    return { info, refreshed }
  } catch (error) {
    const credentialExpired = isSklandCredentialExpired(error)
    if (!credentialExpired || !account.hgToken) {
      throw error
    }
    const reRefreshed = await exchangeHgToken(account.hgToken, backendBaseUrl)
    const info = await fetchSklandPlayerInfo(account.uid, reRefreshed.cred, reRefreshed.token)
    return { info, refreshed: reRefreshed }
  }
}

/** 清掉该账号已排的全部通知 alarm，再按最新数据重排 */
async function rescheduleAccountNotifications(
  accountId: string,
  info: SklandBindingInfo,
  settings: ExtensionSettings
): Promise<void> {
  const prefix = `${NOTIFY_ALARM_PREFIX}${accountId}:`
  const alarms = await chrome.alarms.getAll()
  await Promise.all(
    alarms
      .filter(alarm => alarm.name.startsWith(prefix))
      .map(alarm => chrome.alarms.clear(alarm.name))
  )

  const nowMs = Date.now()
  if (settings.recruitNotifyEnabled) {
    for (const notice of mergeRecruitNotifications(info.recruit ?? [], nowMs)) {
      chrome.alarms.create(recruitAlarmName(accountId, notice.key), { when: notice.finishAtMs })
    }
  }
  if (settings.sanityNotifyEnabled && info.status.ap.completeRecoveryTime > 0) {
    const completeRecoveryMs = info.status.ap.completeRecoveryTime * 1000
    if (completeRecoveryMs > nowMs) {
      chrome.alarms.create(sanityAlarmName(accountId), { when: completeRecoveryMs })
    }
  }
}

/** 刷新单个账号的面板缓存；成功后重排该账号的桌面通知 */
async function refreshAccountInfo(
  account: GameAccount,
  settings: ExtensionSettings
): Promise<{ ok: boolean; message: string }> {
  try {
    const { info, refreshed } = await fetchPlayerInfoWithCredential(account, settings.backendBaseUrl)
    if (refreshed) {
      await patchAccount(account.id, { skland: refreshed })
    }
    await saveAccountInfo(account.id, info)
    await rescheduleAccountNotifications(account.id, info, settings)
    return { ok: true, message: refreshed ? '面板数据已刷新（森空岛凭证已自动刷新）' : '面板数据已刷新' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message }
  }
}

/** 手动刷新：指定账号或当前激活账号 */
export async function refreshInfoById(accountId?: string): Promise<{ ok: boolean; message?: string }> {
  const locked = await lockedMessage()
  if (locked) {
    return { ok: false, message: locked }
  }
  const state = await loadState()
  const account = accountId
    ? state.accounts.find(item => item.id === accountId)
    : state.accounts.find(item => item.id === state.activeAccountId) ?? state.accounts[0]
  if (!account) {
    return { ok: false, message: '账号不存在' }
  }
  const result = await refreshAccountInfo(account, state.settings)
  return { ok: result.ok, message: result.message }
}

/** 定时刷新：按设置刷新当前账号或全部账号（单个失败不影响其余） */
export async function runScheduledInfoRefresh(): Promise<boolean> {
  const locked = await lockedMessage()
  if (locked) {
    return false
  }
  const state = await loadState()
  const targets = state.settings.refreshAllAccounts
    ? state.accounts
    : [state.accounts.find(item => item.id === state.activeAccountId) ?? state.accounts[0]].filter(Boolean)
  for (const account of targets) {
    await refreshAccountInfo(account, state.settings)
  }
  return true
}

export async function applyInfoRefreshAlarm(): Promise<void> {
  await chrome.alarms.clear(INFO_REFRESH_ALARM)
  const state = await loadState()
  if (!state.settings.infoRefreshEnabled || state.accounts.length === 0) {
    return
  }
  const periodMinutes = Math.max(1, state.settings.infoRefreshIntervalMinutes)
  await chrome.alarms.create(INFO_REFRESH_ALARM, {
    delayInMinutes: periodMinutes,
    periodInMinutes: periodMinutes
  })
}

/** 触发桌面通知（alarm 到点调用）；账号昵称明文可取，锁定时也能显示 */
async function fireNotification(alarmName: string): Promise<void> {
  const payload = alarmName.slice(NOTIFY_ALARM_PREFIX.length)
  const separator = payload.indexOf(':')
  if (separator < 0) {
    return
  }
  const accountId = payload.slice(0, separator)
  const kind = payload.slice(separator + 1)
  const state = await loadState()
  const account = state.accounts.find(item => item.id === accountId)
  const who = account ? `【${account.nickName || account.uid}】` : ''

  if (kind === 'sanity') {
    chrome.notifications.create(alarmName, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-256.png'),
      title: '理智已完全恢复',
      message: `${who}博士，理智已全部恢复`
    })
    return
  }
  if (kind.startsWith('recruit-')) {
    chrome.notifications.create(alarmName, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-256.png'),
      title: '公开招募完成',
      message: `${who}公招槽位招募结束，请回游戏收取候选人`
    })
  }
}

/** alarm 分发：面板定时刷新与通知统一在此处理，返回是否为本模块的 alarm */
export async function handleInfoAlarm(alarm: { name: string }): Promise<boolean> {
  if (alarm.name === INFO_REFRESH_ALARM) {
    await runScheduledInfoRefresh()
    return true
  }
  if (alarm.name.startsWith(NOTIFY_ALARM_PREFIX)) {
    await fireNotification(alarm.name)
    return true
  }
  return false
}
