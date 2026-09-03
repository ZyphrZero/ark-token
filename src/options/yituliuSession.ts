import { AuthFlowError } from '../core/errors'

/**
 * 从浏览器中已打开的一图流标签页读取登录会话。
 *
 * 一图流的登录凭证 USER_TOKEN / UID 存于 ark.yituliu.cn 页面的 localStorage
 * （后端 /auth/** 接口只认 Authorization 头，无 Cookie 通道），因此通过
 * chrome.scripting 在一图流标签页内执行脚本读取。
 * 依赖 manifest 中的 scripting 权限与 ark.yituliu.cn 的 host permission。
 */

/** 后端要求会话 token 长度 > 30（含前缀），过短视为无效 */
const MIN_SESSION_TOKEN_LENGTH = 20

interface YituliuLocalStorage {
  userToken: string | null
  uid: string | null
}

function readLocalStorageInPage(): YituliuLocalStorage {
  return {
    userToken: localStorage.getItem('USER_TOKEN'),
    uid: localStorage.getItem('UID')
  }
}

/** 遍历一图流标签页，返回第一个能读到有效 USER_TOKEN 的会话 */
export async function readYituliuSession(): Promise<{ userToken: string; uid?: string }> {
  let tabs: chrome.tabs.Tab[]
  try {
    tabs = await chrome.tabs.query({ url: 'https://ark.yituliu.cn/*' })
  } catch {
    throw new AuthFlowError('无法查询浏览器标签页，请重新加载插件后重试')
  }
  if (tabs.length === 0) {
    throw new AuthFlowError('未找到一图流网页：请先在浏览器中打开并登录 ark.yituliu.cn，再回来点击自动获取')
  }

  for (const tab of tabs) {
    if (tab.id == null) {
      continue
    }
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readLocalStorageInPage
      })
      const userToken = result?.result?.userToken
      if (typeof userToken === 'string' && userToken.length >= MIN_SESSION_TOKEN_LENGTH) {
        const uid = result?.result?.uid
        return { userToken, uid: typeof uid === 'string' && uid.length > 0 ? uid : undefined }
      }
    } catch {
      // 该标签页可能仍在加载或为受限页面，继续尝试下一个
    }
  }
  throw new AuthFlowError(
    '一图流网页中没有登录状态：请先在浏览器中登录 ark.yituliu.cn 后重试；仍获取不到时请在官网手动生成 token 填入'
  )
}
