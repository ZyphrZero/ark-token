import { useEffect, useState } from 'react'

import { exchangeHgToken } from '../core/hgAuth'
import { fetchOperatorInfo } from '../core/yituliuApi'
import { loadState, removeAccount, subscribeState, upsertAccount } from '../storage/store'
import type { GameAccount, PluginState } from '../core/types'
import { formatTimeAgo } from '../utils/time'

const YITULIU_TOKEN_PAGE = 'https://ark.yituliu.cn/account/home'

interface AccountEditorProps {
  account: GameAccount
  backendBaseUrl: string
  onStateChanged: (state: PluginState) => void
}

function AccountEditor({ account, backendBaseUrl, onStateChanged }: AccountEditorProps) {
  const [readToken, setReadToken] = useState(account.yituliu.readToken ?? '')
  const [writeToken, setWriteToken] = useState(account.yituliu.writeToken ?? '')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveTokens() {
    const trimmedRead = readToken.trim()
    const trimmedWrite = writeToken.trim()
    const nextState = await upsertAccount({
      ...account,
      yituliu: {
        readToken: trimmedRead.length > 0 ? trimmedRead : undefined,
        writeToken: trimmedWrite.length > 0 ? trimmedWrite : undefined
      }
    })
    onStateChanged(nextState)
    setFeedback({ kind: 'ok', text: '一图流 token 已保存' })
  }

  async function testReadToken() {
    const trimmed = readToken.trim()
    if (!trimmed) {
      setFeedback({ kind: 'err', text: '请先填写读 token 再测试' })
      return
    }
    setBusy(true)
    try {
      const operators = await fetchOperatorInfo(trimmed, backendBaseUrl)
      setFeedback({ kind: 'ok', text: `读 token 有效：一图流已保存 ${operators.length} 名干员数据` })
    } catch (error) {
      setFeedback({ kind: 'err', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  async function refreshSklandCredential() {
    if (!account.hgToken) {
      return
    }
    setBusy(true)
    try {
      const credential = await exchangeHgToken(account.hgToken, backendBaseUrl)
      const nextState = await upsertAccount({ ...account, skland: credential })
      onStateChanged(nextState)
      setFeedback({ kind: 'ok', text: '森空岛凭证已刷新' })
    } catch (error) {
      setFeedback({ kind: 'err', text: `刷新失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(`确定删除账号「${account.nickName || account.uid}」吗？插件中的凭证与 token 将一并清除。`)
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
          {account.yituliu.writeToken ? <span className="badge ok">写 token 已配置</span> : <span className="badge err">缺少写 token</span>}
          {account.yituliu.readToken ? <span className="badge ok">读 token 已配置</span> : <span className="badge">未配置读 token</span>}
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

      <div className="grid-2">
        <div>
          <label className="field">一图流 读 token（用于同步后校验，可选）</label>
          <input type="password" value={readToken} placeholder="32 位 token，官网生成后粘贴" onChange={event => setReadToken(event.target.value)} />
        </div>
        <div>
          <label className="field">一图流 写 token（上传数据必填）</label>
          <input type="password" value={writeToken} placeholder="32 位 token，官网生成后粘贴" onChange={event => setWriteToken(event.target.value)} />
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => void saveTokens()}>保存 token</button>
        <button className="btn" disabled={busy} onClick={() => void testReadToken()}>测试读 token</button>
        {account.hgToken && (
          <button className="btn" disabled={busy} onClick={() => void refreshSklandCredential()}>刷新森空岛凭证</button>
        )}
        <button className="btn btn-danger" onClick={() => void deleteAccount()}>删除账号</button>
      </div>

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}

      <p className="hint" style={{ marginTop: 10 }}>
        token 在一图流官网
        <a href={YITULIU_TOKEN_PAGE} target="_blank" rel="noreferrer">「用户中心 → 第三方 API Token」</a>
        页面生成：读权限对应「只读 Token」，写权限对应「只写 Token」。注意生成新 token 会使旧 token 失效。
      </p>
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
        <p className="hint">先添加一个明日方舟账号（扫码 / 官网 Token / 森空岛凭证），再为它配置一图流读写 token。</p>
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
