import { useEffect, useState, type FormEvent } from 'react'

import type { GameAccount } from '../../core/types'
import { CheckerMark } from '../../ui/components'
import { AddIcon, ArrowRightIcon, SettingsIcon } from '../../ui/icons'
import { openOptions, sendAddFriendMessage } from '../panelActions'

/**
 * 账号切换侧滑面板：格纹角标双语标题栏 + 斜切角卡片列表。
 * 当前激活账号以终端黄描边与「当前」徽标标识；支持 Esc / 点击遮罩关闭。
 */
export default function AccountSwitcher({ accounts, activeAccountId, onActivate, onClose }: {
  accounts: GameAccount[]
  activeAccountId: string | null
  onActivate: (accountId: string) => void
  onClose: () => void
}) {
  const [targetUid, setTargetUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const activeAccount = accounts.find(account => account.id === activeAccountId) ?? accounts[0]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleAddFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeAccount) {
      setFeedback({ kind: 'err', text: '没有可用的账号' })
      return
    }
    const normalizedTargetUid = targetUid.trim()
    if (!normalizedTargetUid) {
      setFeedback({ kind: 'err', text: '请输入目标好友 UID' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const response = await sendAddFriendMessage(activeAccount.id, normalizedTargetUid)
      if (response.ok) {
        setTargetUid('')
        setFeedback({ kind: 'ok', text: response.message ?? `已向 UID ${normalizedTargetUid} 发送好友申请` })
      } else {
        setFeedback({ kind: 'err', text: response.message ?? '好友申请失败' })
      }
    } catch (error) {
      setFeedback({ kind: 'err', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="switcher-overlay" onClick={onClose}>
      <div className="switcher-panel" onClick={event => event.stopPropagation()}>
        <div className="switcher-header">
          <span className="switcher-heading">
            <CheckerMark />
            <span className="cn">角色列表</span>
            <span className="en">Character</span>
          </span>
          <button type="button" className="icon-btn" title="打开管理页" onClick={() => openOptions()}>
            <SettingsIcon size={14} />
          </button>
        </div>
        <div className="switcher-list">
          {accounts.map(account => {
            const active = account.id === activeAccountId
            return (
              <button
                key={account.id}
                type="button"
                className={`switcher-item cut-box${active ? ' active' : ''}`}
                onClick={() => {
                  onActivate(account.id)
                  onClose()
                }}
              >
                <span className="switcher-meta">
                  <span className="switcher-name">
                    Dr. {account.nickName || '未命名博士'}
                    {active && <span className="switcher-badge">当前</span>}
                  </span>
                  <span className="switcher-sub">
                    <span>角色区服：{account.channelName || '未知区服'}</span>
                    <span className="uid">UID: {account.uid}</span>
                  </span>
                </span>
                <span className="switcher-arrow">
                  <ArrowRightIcon size={16} />
                </span>
              </button>
            )
          })}
        </div>
        {activeAccount && (
          <form className="friend-form" onSubmit={event => void handleAddFriend(event)}>
            <div className="friend-form-title">添加好友</div>
            <div className="friend-form-source">使用：Dr. {activeAccount.nickName || '未命名博士'} · UID {activeAccount.uid}</div>
            <label className="sr-only" htmlFor="friend-target-uid">目标好友 UID</label>
            <input
              id="friend-target-uid"
              type="text"
              inputMode="numeric"
              value={targetUid}
              placeholder="输入对方的游戏 UID"
              disabled={busy}
              onChange={event => setTargetUid(event.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy || targetUid.trim().length === 0}>
              {busy ? '发送中…' : '发送好友申请'}
            </button>
            {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
          </form>
        )}
        <div className="switcher-footer">
          <button type="button" className="btn btn-sm" onClick={() => openOptions('#add')}><AddIcon size={12} /> 添加账号</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openOptions()}>管理页</button>
        </div>
      </div>
    </div>
  )
}
