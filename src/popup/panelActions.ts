/** 弹窗与后台 service worker 的消息通信及页面跳转辅助 */

export function openOptions(hash: '' | '#add' | '#settings' = ''): void {
  const url = chrome.runtime.getURL('src/options/index.html') + hash
  void chrome.tabs.create({ url })
}

interface BackgroundResponse {
  ok: boolean
  message?: string
}

function sendMessage(message: unknown): Promise<BackgroundResponse> {
  return new Promise(resolve => {
    // 弹窗在等待期间关闭时走 here，resolve 无副作用（后台任务仍会继续执行）
    chrome.runtime.sendMessage(message, response => resolve(response ?? { ok: true }))
  })
}

/** 同步账号数据到一图流（cultivate 拉取 + 上传） */
export function sendSyncMessage(accountId?: string): Promise<BackgroundResponse> {
  return sendMessage({ type: 'sync', accountId })
}

/** 刷新状态面板缓存（仅拉森空岛 player/info，不上传） */
export function sendRefreshInfoMessage(accountId?: string): Promise<BackgroundResponse> {
  return sendMessage({ type: 'refreshInfo', accountId })
}
