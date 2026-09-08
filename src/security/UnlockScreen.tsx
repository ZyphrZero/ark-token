import { useState } from 'react'

import { SecurityError } from '../core/errors'
import { unlockSecurity } from '../storage/store'
import { LockIcon } from '../ui/icons'

/** 锁定屏：解锁前调用方不得渲染任何账号数据；解锁密钥只进入本次浏览器会话内存 */
export default function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy || passphrase.length === 0) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await unlockSecurity(passphrase)
      onUnlocked()
    } catch (cause) {
      setError(cause instanceof SecurityError ? cause.message : `解锁失败：${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-screen">
      <h2><LockIcon size={15} /> 插件已锁定</h2>
      <p className="lock-hint">
        凭据已加密保护，输入主密码解锁。解锁密钥只保存在本次浏览器运行内存中，重启浏览器后需重新解锁。
      </p>
      <input
        className="lock-input"
        type="password"
        autoFocus
        value={passphrase}
        placeholder="主密码"
        onChange={event => setPassphrase(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            void submit()
          }
        }}
      />
      <div className="lock-actions">
        <button className="btn btn-primary" disabled={busy || passphrase.length === 0} onClick={() => void submit()}>
          {busy ? '解锁中…' : '解锁'}
        </button>
      </div>
      {error && <div className="lock-error">{error}</div>}
    </div>
  )
}
