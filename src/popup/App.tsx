import { useCallback, useEffect, useState } from 'react'

import { getSecurityStatus, loadState, setActiveAccount, subscribeState, type SecurityStatus } from '../storage/store'
import { loadInfoCache, subscribeInfoCache, type InfoCache } from '../storage/infoCache'
import type { PluginState } from '../core/types'
import UnlockScreen from '../security/UnlockScreen'
import { CheckerMark } from '../ui/components'
import { AddIcon, LockIcon, RefreshIcon } from '../ui/icons'
import AssistSearchPage from './assist/AssistSearchPage'
import AccountSwitcher from './panel/AccountSwitcher'
import IslandSection from './panel/IslandSection'
import MissionSection from './panel/MissionSection'
import MyOperatorsPage from './panel/MyOperatorsPage'
import PanelFooter from './panel/PanelFooter'
import SanitySection from './panel/SanitySection'
import StatusHeader from './panel/StatusHeader'
import { openOptions, sendRefreshInfoMessage, sendSyncMessage } from './panelActions'

/**
 * 罗德岛终端数据面板主界面：
 * 博士信息头 / 理智实时恢复 / 公招+基建 Tabs（含无人机读数） / 任务进度 / 底栏（刷新与一图流同步）。
 * 面板数据来自 infoCache（后台定时或手动刷新森空岛 player/info），实时数值按时间戳前端推算。
 */
export default function App() {
  const [state, setState] = useState<PluginState | null>(null)
  // 安全状态未确认前不渲染账号数据，避免锁定状态闪现明文占位列表
  const [security, setSecurity] = useState<SecurityStatus | null>(null)
  const [cache, setCache] = useState<InfoCache | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const [operatorsOpen, setOperatorsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void loadState().then(setState)
    void getSecurityStatus().then(setSecurity)
  }, [])

  useEffect(() => {
    refresh()
    void loadInfoCache().then(setCache)
    return subscribeState(setState)
  }, [refresh])

  useEffect(() => subscribeInfoCache(setCache), [])

  const handleActivate = useCallback((accountId: string) => {
    void setActiveAccount(accountId)
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshNote(null)
    try {
      const response = await sendRefreshInfoMessage()
      setRefreshNote(response.ok ? null : (response.message ?? '刷新失败'))
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleSync = useCallback(() => {
    void sendSyncMessage()
  }, [])

  const accounts = state?.accounts ?? []
  const locked = security !== null && security.configured && !security.unlocked
  const activeAccount = accounts.find(account => account.id === state?.activeAccountId) ?? accounts[0]
  const activeEntry = activeAccount ? cache?.[activeAccount.id] : undefined
  const info = activeEntry?.data
  const syncing = activeAccount?.lastSync?.status === 'syncing'

  return (
    <div className="panel">
      {security === null ? null : locked ? (
        <main className="panel-main">
          <UnlockScreen onUnlocked={refresh} />
        </main>
      ) : (
        <>
          {assistOpen && activeAccount ? (
            <AssistSearchPage account={activeAccount} onBack={() => setAssistOpen(false)} />
          ) : operatorsOpen && info ? (
            <MyOperatorsPage key={activeAccount?.id} info={info} onBack={() => setOperatorsOpen(false)} />
          ) : (
            <>
              <main className="panel-main">
                {accounts.length === 0 ? (
                  <div className="panel-empty">
                    <div className="empty-mark"><CheckerMark /><CheckerMark /><CheckerMark /></div>
                    <div className="empty-title">暂无账号</div>
                    <p className="empty-sub">
                      添加森空岛账号后，即可在此查看理智、公招、基建等状态，
                      并把干员练度同步到一图流。
                    </p>
                    <button className="btn btn-primary" onClick={() => openOptions('#add')}>
                      <AddIcon size={12} /> 添加第一个账号
                    </button>
                  </div>
                ) : !info ? (
                  <div className="panel-empty">
                    <div className="empty-mark"><CheckerMark /><CheckerMark /><CheckerMark /></div>
                    <div className="empty-title">还没有面板数据</div>
                    <p className="empty-sub">点击下方刷新按钮，从森空岛拉取当前账号的状态数据</p>
                    <button className="btn btn-primary" disabled={refreshing} onClick={() => void handleRefresh()}>
                      <RefreshIcon size={12} /> {refreshing ? '拉取中…' : '立即刷新'}
                    </button>
                    {refreshNote && <p className="empty-sub">{refreshNote}</p>}
                  </div>
                ) : (
                  <>
                    <StatusHeader
                      status={info.status}
                      onOpenSwitcher={() => setSwitcherOpen(true)}
                      onOpenAssist={() => setAssistOpen(true)}
                      onOpenOperators={() => setOperatorsOpen(true)}
                    />
                    <SanitySection ap={info.status.ap} />
                    <IslandSection info={info} />
                    <MissionSection info={info} />
                  </>
                )}
              </main>

              {/* 未设主密码的安全提示：放底栏上方，不占用主内容区的高度预算 */}
              {!operatorsOpen && !security.configured && accounts.length > 0 && (
                <div className="security-hint">
                  <LockIcon size={12} /> 凭据尚未加密保护
                  <button className="link-btn" onClick={() => openOptions('#settings')}>
                    去设置主密码
                  </button>
                </div>
              )}

              {activeAccount && (
                <PanelFooter
                  fetchedAt={activeEntry?.fetchedAt}
                  refreshing={refreshing}
                  onRefresh={() => void handleRefresh()}
                  canSync={Boolean(state?.settings.yituliuTokens.writeToken)}
                  syncing={syncing}
                  onSync={handleSync}
                  lastSync={activeAccount.lastSync}
                  note={accounts.length > 0 && !info ? null : refreshNote}
                />
              )}

              {switcherOpen && (
                <AccountSwitcher
                  accounts={accounts}
                  activeAccountId={state?.activeAccountId ?? null}
                  onActivate={handleActivate}
                  onClose={() => setSwitcherOpen(false)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
