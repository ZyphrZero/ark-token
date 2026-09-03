import { useEffect, useState } from 'react'

import { exchangeHgToken } from '../core/hgAuth'
import { loadState, removeAccount, subscribeState, upsertAccount } from '../storage/store'
import type { GameAccount, PluginState } from '../core/types'
import { formatTimeAgo } from '../utils/time'

interface AccountEditorProps {
  account: GameAccount
  backendBaseUrl: string
  onStateChanged: (state: PluginState) => void
}

function AccountEditor({ account, backendBaseUrl, onStateChanged }: AccountEditorProps) {
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function refreshSklandCredential() {
    if (!account.hgToken) {
      return
    }
    setBusy(true)
    try {
      const credential = await exchangeHgToken(account.hgToken, backendBaseUrl)
      onStateChanged(await upsertAccount({ ...account, skland: credential }))
      setFeedback({ kind: 'ok', text: '森空岛凭证已刷新' })
    } catch (error) {
      setFeedback({ kind: 'err', text: `刷新失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(`确定删除账号「${account.nickName || account.uid}」吗？插件中的凭证将一并清除。`)
    if (!confirmed) {
      return
    }
    onStateChanged(await removeAccount(account.id))
  }

  const lastSync = account.lastSync

  return (
    <div className="account-block">
      <div className="title-row">
        <div>
          <span className="name">{account.nickName || '未命名博士'}</span>
          <span className="meta" style={{ marginLeft: 10, color: '#6b7280', fontSize: 12 }}>
            UID {account.uid} · {account.channelName || '未知区服'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {account.hgToken ? <span className="badge">支持凭证自动刷新</span> : null}
        </div>
      </div>

      {lastSync && (
        <div className="last-sync">
          上次同步：{formatTimeAgo(lastSync.time)} ·{' '}
          {lastSync.status === 'success'
            ? `成功，${lastSync.operatorCount ?? '?'} 名干员`
            : lastSync.status === 'syncing'
              ? '同步中…'
              : `失败（${lastSync.message ?? '未知原因'}）`}
        </div>
      )}

      <div className="actions">
        {account.hgToken && (
          <button className="btn" disabled={busy} onClick={() => void refreshSklandCredential()}>刷新森空岛凭证</button>
        )}
        <button className="btn btn-danger" onClick={() => void deleteAccount()}>删除账号</button>
      </div>

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
    </div>
  )
}

export default function AccountManager({ onSwitchToAdd }: { onSwitchToAdd: () => void }) {
  const [state, setState] = useState<PluginState | null>(null)

  useEffect(() => {
    void loadState().then(setState)
    return subscribeState(setState)
  }, [])

  if (!state) {
    return <div className="card">加载中…</div>
  }

  if (state.accounts.length === 0) {
    return (
      <div className="card">
        <h2>还没有账号</h2>
        <p className="hint">先添加一个明日方舟账号（扫码 / 官网 Token / 森空岛凭证），再在「设置」中配置一图流读写 token。</p>
        <div className="actions">
          <button className="btn btn-primary" onClick={onSwitchToAdd}>＋ 去添加账号</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {state.accounts.map(account => (
        <AccountEditor
          key={account.id}
          account={account}
          backendBaseUrl={state.settings.backendBaseUrl}
          onStateChanged={setState}
        />
      ))}
    </>
  )
}
