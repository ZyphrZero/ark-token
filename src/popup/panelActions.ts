import type { AssistInfo, AssistSearchRequest, AssistSearchResult, AssistUserInfo } from '../core/sklandAssist'

/** 弹窗与后台 service worker 的消息通信及页面跳转辅助 */

export function openOptions(hash: '' | '#add' | '#settings' = ''): void {
  const url = chrome.runtime.getURL('src/options/index.html') + hash
  void chrome.tabs.create({ url })
}

export interface BackgroundResponse<T = unknown> {
  ok: boolean
  message?: string
  data?: T
}

function sendMessage(message: unknown): Promise<BackgroundResponse> {
  return new Promise(resolve => {
    // 弹窗在等待期间关闭时走 here，resolve 无副作用（后台任务仍会继续执行）
    chrome.runtime.sendMessage(message, response => resolve(response ?? { ok: true }))
  })
}

function sendAssistMessage<T>(message: unknown): Promise<BackgroundResponse<T>> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        resolve({ ok: false, message: runtimeError.message || '后台服务不可用，请稍后重试' })
        return
      }
      if (!response || typeof response.ok !== 'boolean') {
        resolve({ ok: false, message: '后台未返回助战请求结果，请稍后重试' })
        return
      }
      resolve(response as BackgroundResponse<T>)
    })
  })
}

/** 同步账号数据到一图流（cultivate 拉取 + 上传） */
export function sendSyncMessage(accountId?: string): Promise<BackgroundResponse> {
  return sendMessage({ type: 'sync', accountId })
}

/** 刷新状态面板缓存（仅拉森空岛 player/info） */
export function sendRefreshInfoMessage(accountId?: string): Promise<BackgroundResponse> {
  return sendMessage({ type: 'refreshInfo', accountId })
}

/** 按指定账号的游戏 UID 发送好友申请；后台不可用时必须明确返回失败 */
export function sendAddFriendMessage(accountId: string, targetUid: string): Promise<BackgroundResponse> {
  return sendAssistMessage({ type: 'addFriend', accountId, targetUid })
}

export function sendAssistInfoMessage(accountId: string): Promise<BackgroundResponse<AssistInfo>> {
  return sendAssistMessage<AssistInfo>({ type: 'assistInfo', accountId })
}

export function sendAssistUserInfoMessage(accountId: string): Promise<BackgroundResponse<AssistUserInfo>> {
  return sendAssistMessage<AssistUserInfo>({ type: 'assistUserInfo', accountId })
}

export function sendSearchAssistMessage(
  accountId: string,
  request: Omit<AssistSearchRequest, 'uid'>
): Promise<BackgroundResponse<AssistSearchResult>> {
  return sendAssistMessage<AssistSearchResult>({ type: 'searchAssist', accountId, request })
}

/** 开启明日方舟游戏关系公开开关（官方助战页的“身份认证”），完成后需重新拉取助战身份 */
export function sendAssistAuthorizeMessage(accountId: string): Promise<BackgroundResponse> {
  return sendAssistMessage({ type: 'assistAuthorize', accountId })
}
