import { useCallback, useEffect, useState } from 'react'

import AccountManager from './AccountManager'
import AddAccountWizard from './AddAccountWizard'
import SettingsPanel from './SettingsPanel'
import UnlockScreen from '../security/UnlockScreen'
import SecurityPanel from '../security/SecurityPanel'
import { getSecurityStatus, type SecurityStatus } from '../storage/store'

type TabKey = 'accounts' | 'add' | 'settings'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'accounts', label: '账号管理' },
  { key: 'add', label: '添加账号' },
  { key: 'settings', label: '设置' }
]

function tabFromHash(): TabKey {
  if (window.location.hash === '#add') {
    return 'add'
  }
  if (window.location.hash === '#settings') {
    return 'settings'
  }
  return 'accounts'
}

export default function App() {
  const [tab, setTab] = useState<TabKey>(tabFromHash)
  // 锁定门禁：安全状态未确认前不渲染任何账号内容
  const [security, setSecurity] = useState<SecurityStatus | null>(null)

  const refreshSecurity = useCallback(() => {
    void getSecurityStatus().then(setSecurity)
  }, [])

  useEffect(() => {
    refreshSecurity()
  }, [refreshSecurity])

  // URL hash 只作为「添加账号」「设置」的深链入口；用 replaceState 同步，
  // 不触发 hashchange，避免与状态互相覆盖
  const switchTab = useCallback((key: TabKey) => {
    setTab(key)
    const expectedHash = key === 'add' ? '#add' : key === 'settings' ? '#settings' : ''
    if (window.location.hash !== expectedHash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${expectedHash}`)
    }
  }, [])

  useEffect(() => {
    // 仅响应外部改 hash 的场景（如弹窗再次深链 #add）
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const locked = security !== null && security.configured && !security.unlocked

  return (
    <div className="options">
      <header className="options-header">
        <h1>一图流多账号助手</h1>
        <a href="https://ark.yituliu.cn/account/home" target="_blank" rel="noreferrer">
          打开一图流 Token 管理页 ↗
        </a>
      </header>

      {security === null ? (
        <main className="options-body">
          <div className="card">加载中…</div>
        </main>
      ) : locked ? (
        <main className="options-body">
          <UnlockScreen onUnlocked={refreshSecurity} />
        </main>
      ) : (
        <>
          <nav className="tabs">
            {TABS.map(item => (
              <button
                key={item.key}
                className={`tab${tab === item.key ? ' active' : ''}`}
                onClick={() => switchTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main className="options-body">
            {tab === 'accounts' && <AccountManager onSwitchToAdd={() => switchTab('add')} />}
            {tab === 'add' && <AddAccountWizard onFinished={() => switchTab('accounts')} />}
            {tab === 'settings' && (
              <>
                <SettingsPanel />
                <SecurityPanel onSecurityChange={refreshSecurity} />
              </>
            )}
          </main>
        </>
      )}
    </div>
  )
}
