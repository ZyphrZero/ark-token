import { fromBase64, toBase64 } from '../core/crypto'

// sessionKey 同样受 TS 5.7+ BufferSource 兼容性影响，importKey 处复制收口
function bufferOf(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes)
}

/**
 * 解锁密钥的会话缓存：chrome.storage.session 只存在于浏览器运行内存，
 * 不写盘、浏览器关闭即清空，因此重启浏览器后需要重新输入主密码解锁。
 */

export interface SessionArea {
  get(callback: (items: Record<string, unknown>) => void): void
  set(items: Record<string, unknown>, callback?: () => void): void
  remove(name: string, callback?: () => void): void
}

export const SESSION_KEY_ITEM = 'yituliu-plugin-key'

export function defaultSessionArea(): SessionArea | undefined {
  return globalThis.chrome?.storage?.session as unknown as SessionArea | undefined
}

function exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.exportKey('raw', key)
}

/** 解锁成功后缓存派生密钥；无 session 存储的环境（如测试注入缺失）直接报错 */
export async function cacheSessionKey(key: CryptoKey, sessionArea?: SessionArea): Promise<void> {
  const area = sessionArea ?? defaultSessionArea()
  if (!area) {
    throw new Error('当前环境不支持 chrome.storage.session，无法缓存解锁密钥')
  }
  const raw = await exportRawKey(key)
  return new Promise(resolve => {
    area.set({ [SESSION_KEY_ITEM]: toBase64(new Uint8Array(raw)) }, () => resolve())
  })
}

export async function loadSessionKey(sessionArea?: SessionArea): Promise<CryptoKey | null> {
  const area = sessionArea ?? defaultSessionArea()
  if (!area) {
    return null
  }
  const raw = await new Promise<unknown>(resolve => {
    area.get(items => resolve(items[SESSION_KEY_ITEM]))
  })
  if (typeof raw !== 'string') {
    return null
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    bufferOf(fromBase64(raw)),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function clearSessionKey(sessionArea?: SessionArea): Promise<void> {
  const area = sessionArea ?? defaultSessionArea()
  if (!area) {
    return
  }
  return new Promise(resolve => {
    area.remove(SESSION_KEY_ITEM, () => resolve())
  })
}

export async function hasSessionKey(sessionArea?: SessionArea): Promise<boolean> {
  const area = sessionArea ?? defaultSessionArea()
  if (!area) {
    return false
  }
  return new Promise(resolve => {
    area.get(items => resolve(typeof items[SESSION_KEY_ITEM] === 'string'))
  })
}
