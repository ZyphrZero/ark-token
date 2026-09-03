import { useCallback, useEffect, useState } from 'react'

import { loadState, setActiveAccount, subscribeState } from '../storage/store'
import type { GameAccount, PluginState } from '../core/types'
import { formatTimeAgo } from '../utils/time'

function sendSyncMessage(accountId?: string): Promise<{ ok: boolean; message?: string }> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'sync', accountId }, response => {
      // 弹窗在等待期间关闭会走 here，resolve 无副作用
      resolve(response ?? { ok: true })
    })
  })
}

function openOptions(addAccount = false): void {
  const url = chrome.runtime.getURL('src/options/index.html') + (addAccount ? '#add' : '')
  void chrome.tabs.create({ url })
}

function AccountCard({ account, active, onActivate, onSync }: {
  account: GameAccount
  active: boolean
  onActivate: () => void
  onSync: () => void
}) {
  const lastSync = account.lastSync
  const syncing = lastSync?.status === 'syncing'

  let statusText: string
  let statusClass: string
  if (syncing) {
    statusText = '同步中…'
    statusClass = 'status-syncing'
  } else if (lastSync?.status === 'success') {
    statusText = `${formatTimeAgo(lastSync.time)}同步成功（${lastSync.operatorCount ?? '?'} 名干员）`
    statusClass = 'status-success'
  } else if (lastSync?.status === 'failed') {
    statusText = `${formatTimeAgo(lastSync.time)}同步失败：${lastSync.message ?? '未知原因'}`
    statusClass = 'status-failed'
  } else {
    statusText = '尚未同步过'
    statusClass = 'status-idle'
  }

  return (
    <div
      className={`account-card${active ? ' active' : ''}`}
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          onActivate()
        }
      }}
    >
      <div className="account-head">
        <span className="account-name">{account.nickName || '未命名博士'}</span>
        {active && <span className="active-badge">当前</span>}
      </div>
      <div className="account-meta">
        <span className="account-uid">UID {account.uid}</span>
        <span className="account-channel">{account.channelName || '未知区服'}</span>
      </div>
      <div className={`account-status ${statusClass}`}>{statusText}</div>
      <div className="account-actions">
        {account.yituliu.writeToken ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={syncing}
            onClick={event => {
              event.stopPropagation()
              onSync()
            }}
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        ) : (
          <button
            className="btn btn-warn btn-sm"
            onClick={event => {
              event.stopPropagation()
              openOptions()
            }}
          >
            未配置写 token，去设置
          </button>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<PluginState | null>(null)

  useEffect(() => {
    void loadState().then(setState)
    return subscribeState(setState)
  }, [])

  const handleActivate = useCallback((accountId: string) => {
    void setActiveAccount(accountId)
  }, [])

  const handleSync = useCallback((accountId: string) => {
    void sendSyncMessage(accountId)
  }, [])

  const handleSyncAll = useCallback(() => {
    void sendSyncMessage()
  }, [])

  const accounts = state?.accounts ?? []
  const anySyncing = accounts.some(account => account.lastSync?.status === 'syncing')

  return (
    <div className="popup">
      <header className="popup-header">
        <h1>一图流多账号助手</h1>
        <button className="icon-btn" title="打开管理页" onClick={() => openOptions(false)}>
          ⚙
        </button>
      </header>

      <main className="popup-body">
        {accounts.length === 0 ? (
          <div className="empty">
            <p>还没有添加账号</p>
            <button className="btn btn-primary" onClick={() => openOptions(true)}>
              ＋ 添加第一个账号
            </button>
          </div>
        ) : (
          accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              active={account.id === state?.activeAccountId}
              onActivate={() => handleActivate(account.id)}
              onSync={() => handleSync(account.id)}
            />
          ))
        )}
      </main>

      {accounts.length > 0 && (
        <footer className="popup-footer">
          <button className="btn btn-ghost" onClick={() => openOptions(true)}>
            ＋ 添加账号
          </button>
          <button className="btn btn-secondary" disabled={anySyncing} onClick={handleSyncAll}>
            {anySyncing ? '同步中…' : '全部同步'}
          </button>
        </footer>
      )}
    </div>
  )
}
