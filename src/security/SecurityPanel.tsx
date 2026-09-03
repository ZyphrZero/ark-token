import { useCallback, useEffect, useState } from 'react'

import { SecurityError } from '../core/errors'
import { changeSecurityPassphrase, getSecurityStatus, lockSecurity, resetSecurity, type SecurityStatus } from '../storage/store'
import SetupScreen from './SetupScreen'

/** 设置页的安全面板：未设置主密码时提供开启入口，已设置时管理锁定/改密/重置 */
export default function SecurityPanel({ onSecurityChange }: { onSecurityChange?: () => void }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [changing, setChanging] = useState(false)
  const [oldPassphrase, setOldPassphrase] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const refresh = useCallback(() => {
    void getSecurityStatus().then(setStatus)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function report(kind: 'ok' | 'err', text: string): void {
    setFeedback({ kind, text })
    refresh()
    onSecurityChange?.()
  }

  async function run(action: () => Promise<void>, okText: string): Promise<void> {
    try {
      await action()
      report('ok', okText)
    } catch (cause) {
      const text = cause instanceof SecurityError ? cause.message : `${cause instanceof Error ? cause.message : String(cause)}`
      report('err', text)
    }
  }

  if (!status) {
    return <div className="card">加载中…</div>
  }

  if (!status.configured) {
    return (
      <div>
        <SetupScreen onDone={() => report('ok', '加密保护已开启，本会话已解锁')} />
      </div>
    )
  }

  async function submitChange(): Promise<void> {
    if (newPassphrase !== confirmPassphrase) {
      setFeedback({ kind: 'err', text: '两次输入的新主密码不一致' })
      return
    }
    await run(async () => {
      await changeSecurityPassphrase(oldPassphrase, newPassphrase)
    }, '主密码已修改，所有凭据已用新密钥重新加密')
    setOldPassphrase('')
    setNewPassphrase('')
    setConfirmPassphrase('')
    setChanging(false)
  }

  async function doReset(): Promise<void> {
    // 两步确认代替弹窗：第一步只点亮确认态
    if (!confirmingReset) {
      setConfirmingReset(true)
      return
    }
    setConfirmingReset(false)
    await run(async () => {
      await resetSecurity()
    }, '已重置：全部账号与主密码已清除，请重新添加账号')
  }

  return (
    <div className="card">
      <h2>安全</h2>
      <p className="hint">
        凭据（森空岛凭证、官网 HG Token、一图流读写 token）使用 AES-GCM 加密后保存在本机，
        主密码本身与解密密钥不落盘；重启浏览器会自动锁定，届时需重新输入主密码。
      </p>

      <div className={`message ${status.unlocked ? 'ok' : 'info'}`}>
        {status.unlocked ? '当前已解锁：本浏览器会话内可正常同步与修改凭据' : '当前已锁定：同步与凭据修改不可用，请在弹窗或重新打开本页时解锁'}
      </div>

      {status.unlocked && (
        <div className="actions">
          <button className="btn" onClick={() => void run(() => lockSecurity(), '已锁定')}>立即锁定</button>
          <button className="btn" onClick={() => setChanging(value => !value)}>
            {changing ? '收起修改主密码' : '修改主密码'}
          </button>
        </div>
      )}

      {changing && status.unlocked && (
        <div className="security-form">
          <label className="field">当前主密码</label>
          <input type="password" value={oldPassphrase} onChange={event => setOldPassphrase(event.target.value)} />
          <label className="field">新主密码（至少 8 个字符）</label>
          <input type="password" value={newPassphrase} onChange={event => setNewPassphrase(event.target.value)} />
          <label className="field">确认新主密码</label>
          <input
            type="password"
            value={confirmPassphrase}
            onChange={event => setConfirmPassphrase(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                void submitChange()
              }
            }}
          />
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={!oldPassphrase || newPassphrase.trim().length < 8 || confirmPassphrase.length === 0}
              onClick={() => void submitChange()}
            >
              确认修改
            </button>
          </div>
        </div>
      )}

      <h3>忘记主密码</h3>
      <p className="hint">
        主密码无法找回。重置会清空全部账号（加密凭据无法解密）并移除主密码，其他设置保留；
        账号可重新添加，一图流读写 token 需重新填写。
      </p>
      <div className="actions">
        <button className="btn btn-danger" onClick={() => void doReset()}>
          {confirmingReset ? '⚠ 再点一次确认清空全部账号' : '重置主密码（清空全部账号）'}
        </button>
      </div>

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
    </div>
  )
}
