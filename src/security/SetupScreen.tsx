import { useState } from 'react'

import { SecurityError } from '../core/errors'
import { setupSecurity } from '../storage/store'

/**
 * 首次设置主密码（含确认输入）；成功后本会话自动解锁。
 * 添加账号向导与设置页共用：开启加密后新凭据才不会以明文落盘。
 */
export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) {
      return
    }
    if (passphrase !== confirm) {
      setError('两次输入的主密码不一致')
      return
    }
    setBusy(true)
    setError('')
    try {
      await setupSecurity(passphrase)
      onDone()
    } catch (cause) {
      setError(cause instanceof SecurityError ? cause.message : `设置失败：${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const usable = passphrase.trim().length >= 8 && confirm.length > 0

  return (
    <div className="card">
      <h2>设置主密码</h2>
      <p className="hint">
        主密码用于加密保存在本机的森空岛凭证与一图流 token：即使浏览器的数据文件被第三方软件读取或拷贝，也无法还原凭据明文。
        主密码本身不落盘、无法找回，忘记后只能清空全部账号重新添加，请务必牢记。
      </p>
      <label className="field">主密码（至少 8 个字符）</label>
      <input
        type="password"
        autoFocus
        value={passphrase}
        placeholder="输入主密码"
        onChange={event => setPassphrase(event.target.value)}
      />
      <label className="field">确认主密码</label>
      <input
        type="password"
        value={confirm}
        placeholder="再次输入主密码"
        onChange={event => setConfirm(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            void submit()
          }
        }}
      />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !usable} onClick={() => void submit()}>
          {busy ? '正在加密已有凭据…' : '开启加密保护'}
        </button>
      </div>
      {error && <div className="message err">{error}</div>}
    </div>
  )
}
