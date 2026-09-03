import { describe, expect, it } from 'vitest'

import {
  decryptJson,
  deriveAesGcmKey,
  encryptJson,
  fromBase64,
  isEncryptedEnvelope,
  newSalt,
  toBase64
} from './crypto'

const LOW_ITERATIONS = 1000

async function makeKey(passphrase = '主密码测试'): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const salt = newSalt()
  const key = await deriveAesGcmKey(passphrase, salt, LOW_ITERATIONS)
  return { key, salt }
}

describe('base64 编解码', () => {
  it('任意字节往返一致', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 7])
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('信封加解密', () => {
  it('JSON 对象加解密往返一致', async () => {
    const { key } = await makeKey()
    const secret = { cred: 'cred-abc', token: 'token-xyz', nested: { count: 3 } }
    const envelope = await encryptJson(key, secret)
    expect(isEncryptedEnvelope(envelope)).toBe(true)
    await expect(decryptJson(key, envelope)).resolves.toEqual(secret)
  })

  it('信封不包含明文片段', async () => {
    const { key } = await makeKey()
    const envelope = await encryptJson(key, { cred: 'cred-abc' })
    expect(envelope.ct).not.toContain('cred')
    expect(atob(envelope.ct)).not.toContain('cred-abc')
  })

  it('相同明文两次加密得到不同密文（随机 IV）', async () => {
    const { key } = await makeKey()
    const first = await encryptJson(key, { token: 'same' })
    const second = await encryptJson(key, { token: 'same' })
    expect(first.iv).not.toBe(second.iv)
    expect(first.ct).not.toBe(second.ct)
  })

  it('错误口令派生的密钥无法解密', async () => {
    const { key } = await makeKey('正确口令')
    const envelope = await encryptJson(key, { cred: 'cred-abc' })
    const wrongKey = await deriveAesGcmKey('错误口令', newSalt(), LOW_ITERATIONS)
    await expect(decryptJson(wrongKey, envelope)).rejects.toThrow()
  })

  it('密文被篡改时解密失败（GCM 完整性校验）', async () => {
    const { key } = await makeKey()
    const envelope = await encryptJson(key, { cred: 'cred-abc' })
    const bytes = fromBase64(envelope.ct)
    bytes[0] ^= 0xff
    await expect(decryptJson(key, { ...envelope, ct: toBase64(bytes) })).rejects.toThrow()
  })
})
