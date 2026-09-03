import type { EncryptedEnvelope } from './types'

/**
 * 凭据静态加密：AES-GCM-256（认证加密）+ PBKDF2-HMAC-SHA256 派生密钥。
 *
 * 主密码本身不落盘；派生密钥只保存在 chrome.storage.session（浏览器运行内存，
 * 关闭浏览器即清空）。磁盘上只存加密信封与 KDF 参数。
 */

export const DEFAULT_PBKDF2_ITERATIONS = 600_000

/** AES-GCM 推荐 12 字节 IV，每条信封独立随机生成 */
const IV_LENGTH = 12
const SALT_LENGTH = 16

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function subtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle
  if (!c) {
    throw new Error('当前环境不支持 WebCrypto，无法加解密凭据')
  }
  return c
}

/**
 * TS 5.7+ 中 Uint8Array 默认是 ArrayBufferLike 视图，WebCrypto 只接受 ArrayBuffer 视图；
 * 统一复制一份收口，长度都在 KB 量级，开销可忽略。
 */
function bufferOf(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes)
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // 分块转换，避免超长密文时 String.fromCharCode 触发调用栈溢出
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** 由主密码派生 AES-GCM 密钥。密钥可导出（仅用于缓存进会话内存，不落盘） */
export async function deriveAesGcmKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await subtle().importKey('raw', bufferOf(textEncoder.encode(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: bufferOf(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedEnvelope> {
  const iv = randomBytes(IV_LENGTH)
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, bufferOf(textEncoder.encode(JSON.stringify(value))))
  return { v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(ciphertext)) }
}

/** 解密失败（密钥错误或密文被篡改）时由 WebCrypto 抛出 OperationError */
export async function decryptJson<T>(key: CryptoKey, envelope: EncryptedEnvelope): Promise<T> {
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: bufferOf(fromBase64(envelope.iv)) },
    key,
    bufferOf(fromBase64(envelope.ct))
  )
  return JSON.parse(textDecoder.decode(plaintext)) as T
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH)
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<EncryptedEnvelope>
  return candidate.v === 1 && typeof candidate.iv === 'string' && typeof candidate.ct === 'string'
}
