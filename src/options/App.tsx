import { useCallback, useEffect, useState } from 'react'

import AccountManager from './AccountManager'
import AddAccountWizard from './AddAccountWizard'
import SettingsPanel from './SettingsPanel'

type TabKey = 'accounts' | 'add' | 'settings'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'accounts', label: '账号管理' },
  { key: 'add', label: '添加账号' },
  { key: 'settings', label: '设置' }
]

function tabFromHash(): TabKey {
  return window.location.hash === '#add' ? 'add' : 'accounts'
}

export default function App() {
  const [tab, setTab] = useState<TabKey>(tabFromHash)

  // URL hash 只作为「添加账号」的深链入口；用 replaceState 同步，
  // 不触发 hashchange，避免与状态互相覆盖
  const switchTab = useCallback((key: TabKey) => {
    setTab(key)
    const expectedHash = key === 'add' ? '#add' : ''
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

  return (
    <div className="options">
      <header className="options-header">
        <h1>一图流多账号助手</h1>
        <a href="https://ark.yituliu.cn/account/home" target="_blank" rel="noreferrer">
          打开一图流 Token 管理页 ↗
        </a>
      </header>

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
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
