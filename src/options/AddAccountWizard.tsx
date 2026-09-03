import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

import {
  exchangeHgToken,
  fetchHgTokenFromOfficialSite,
  parseHgTokenInput,
  parseSklandCredentialInput
} from '../core/hgAuth'
import { checkQrStatus, createQrSession, type QrSession } from '../core/qrLogin'
import { fetchSklandBinding } from '../core/skland'
import { getSecurityStatus, loadState, upsertAccount } from '../storage/store'
import SetupScreen from '../security/SetupScreen'
import type { SklandBinding, SklandCredential } from '../core/types'

type Method = 'qr' | 'hg' | 'cred'

const METHODS: { key: Method; title: string; desc: string }[] = [
  { key: 'qr', title: '扫码登录（推荐）', desc: '用手机森空岛 APP 扫二维码即可，操作最简单，适合添加多个账号。' },
  { key: 'hg', title: '官网 HG Token', desc: '登录鹰角官网后把通行凭证粘贴进来；若浏览器已登录官网，也可一键自动读取。凭证失效时可自动刷新。' },
  { key: 'cred', title: '森空岛凭证粘贴', desc: '与一图流网站的导入教程相同：登录森空岛网页后，在控制台执行命令复制凭证再粘贴。' }
]

const SKLAND_CONSOLE_CODE = "copy(localStorage.getItem('SK_OAUTH_CRED_KEY')+','+localStorage.getItem('SK_TOKEN_CACHE_KEY'))"

interface WizardState {
  credential: SklandCredential
  hgToken?: string
}

function QrLoginPanel({ backendBaseUrl, onSuccess, onError }: {
  backendBaseUrl: string
  onSuccess: (state: WizardState) => void
  onError: (message: string) => void
}) {
  const [session, setSession] = useState<QrSession | null>(null)
  const [qrImage, setQrImage] = useState('')
  const [statusText, setStatusText] = useState('正在生成二维码…')
  const [expired, setExpired] = useState(false)
  const cancelledRef = useRef(false)

  const start = useCallback(async () => {
    cancelledRef.current = false
    setExpired(false)
    setStatusText('正在生成二维码…')
    try {
      const newSession = await createQrSession(backendBaseUrl)
      if (cancelledRef.current) {
        return
      }
      setSession(newSession)
      setQrImage(await QRCode.toDataURL(newSession.qrContent, { width: 220, margin: 1 }))
      setStatusText('请用手机森空岛 APP 扫码')
    } catch (error) {
      onError(`生成二维码失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [backendBaseUrl, onError])

  useEffect(() => {
    void start()
    return () => {
      cancelledRef.current = true
    }
  }, [start])

  useEffect(() => {
    if (!session) {
      return
    }
    const timer = window.setInterval(async () => {
      try {
        const result = await checkQrStatus(backendBaseUrl, session.scanId)
        if (cancelledRef.current) {
          return
        }
        if (result.status === 0) {
          window.clearInterval(timer)
          if (result.credential) {
            onSuccess({ credential: result.credential })
          } else {
            onError('扫码成功但后端未返回凭证，请重试')
          }
        } else if (result.status === 102) {
          window.clearInterval(timer)
          setExpired(true)
          setStatusText('二维码已过期，请重新生成')
        } else if (result.status === 101) {
          setStatusText('已扫码，请在手机上确认')
        } else if (result.status === 100) {
          setStatusText('请用手机森空岛 APP 扫码')
        }
      } catch (error) {
        // 轮询期间的偶发错误不中断流程，下一轮会重试
        if (cancelledRef.current) {
          return
        }
        setStatusText(`查询扫码状态出错，继续重试中（${error instanceof Error ? error.message : String(error)}）`)
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [session, backendBaseUrl, onSuccess, onError])

  return (
    <div className="qr-box">
      {qrImage ? <img src={qrImage} alt="森空岛扫码登录二维码" width={220} height={220} /> : <div className="hint">二维码生成中…</div>}
      <div className="hint">{statusText}</div>
      {expired && (
        <button className="btn" onClick={() => void start()}>重新生成二维码</button>
      )}
    </div>
  )
}

function HgTokenPanel({ backendBaseUrl, onSuccess, onError }: {
  backendBaseUrl: string
  onSuccess: (state: WizardState) => void
  onError: (message: string) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function autoRead() {
    setBusy(true)
    try {
      const hgToken = await fetchHgTokenFromOfficialSite()
      setInput(hgToken)
      await exchange(hgToken)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function exchange(rawInput: string) {
    setBusy(true)
    try {
      const hgToken = parseHgTokenInput(rawInput)
      const credential = await exchangeHgToken(hgToken, backendBaseUrl)
      onSuccess({ credential, hgToken })
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="field">粘贴官网返回的 JSON 或 Token</label>
      <textarea
        value={input}
        placeholder='登录 ak.hypergryph.com 后访问 web-api.hypergryph.com/account/info/hg，复制整段 JSON 粘贴到此处'
        onChange={event => setInput(event.target.value)}
      />
      <p className="hint">
        官网 Token 在退出登录后即失效；若换取时报「需要进行设备验证」，请在森空岛 APP 中关闭「新设备登录身份验证」。
        粘贴的 Token 只保存在本机浏览器中，用于凭证失效时自动刷新。
      </p>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || input.trim().length === 0} onClick={() => void exchange(input)}>
          {busy ? '处理中…' : '换取森空岛凭证'}
        </button>
        <button className="btn" disabled={busy} onClick={() => void autoRead()}>从已登录的官网一键读取</button>
      </div>
    </div>
  )
}

function CredPastePanel({ onSuccess, onError }: {
  onSuccess: (state: WizardState) => void
  onError: (message: string) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const { cred, token } = parseSklandCredentialInput(input)
      onSuccess({ credential: { cred, token, obtainedAt: Date.now() } })
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="hint">
        1. 打开并登录
        <a href="https://www.skland.com/index" target="_blank" rel="noreferrer">森空岛网页版</a>；
        2. 按 F12 打开控制台，执行
        <code>{SKLAND_CONSOLE_CODE}</code>
        （自动复制到剪贴板）；3. 粘贴到下面输入框。
        <br />
        注意：命令必须在<strong>森空岛页面的控制台</strong>执行且已登录；若粘贴出来提示「null」，说明未登录或执行位置不对，推荐改用最上方的扫码登录。
      </p>
      <label className="field">森空岛凭证（cred,token）</label>
      <textarea
        value={input}
        placeholder="粘贴控制台复制到的内容，形如：一串字母,另一串字母"
        onChange={event => setInput(event.target.value)}
      />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || input.trim().length === 0} onClick={() => void submit()}>
          下一步
        </button>
      </div>
    </div>
  )
}

function BindingPicker({ wizardState, onFinished, onError }: {
  wizardState: WizardState
  onFinished: (addedCount: number) => void
  onError: (message: string) => void
}) {
  const [bindings, setBindings] = useState<SklandBinding[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchSklandBinding(wizardState.credential.cred, wizardState.credential.token)
        if (cancelled) {
          return
        }
        setBindings(list)
        setSelected(new Set(list.map(binding => binding.uid)))
        if (list.length === 0) {
          onError('该凭证没有绑定任何明日方舟账号，请先在森空岛 APP 中绑定')
        }
      } catch (error) {
        if (!cancelled) {
          onError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wizardState, onError])

  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!bindings) {
    return <div className="hint">正在获取绑定的明日方舟账号…</div>
  }

  function toggle(uid: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(uid)) {
        next.delete(uid)
      } else {
        next.add(uid)
      }
      return next
    })
  }

  async function addSelected() {
    if (!bindings) {
      return
    }
    const state = await loadState()
    let addedCount = 0
    for (const binding of bindings) {
      if (!selected.has(binding.uid)) {
        continue
      }
      const existing = state.accounts.find(account => account.uid === binding.uid)
      const account = {
        id: existing?.id ?? crypto.randomUUID(),
        uid: binding.uid,
        nickName: binding.nickName,
        channelMasterId: binding.channelMasterId,
        channelName: binding.channelName,
        skland: wizardState.credential,
        hgToken: wizardState.hgToken,
        lastSync: existing?.lastSync
      }
      const nextState = await upsertAccount(account)
      state.accounts = nextState.accounts
      state.activeAccountId = nextState.activeAccountId
      addedCount += 1
    }
    onFinished(addedCount)
  }

  return (
    <div>
      <h3>选择要添加的明日方舟账号</h3>
      <p className="hint">勾选的每个账号都会加入插件账号列表；同一账号重复添加会更新其凭证。一图流读写 token 在「设置」中全局配置，与账号无关。</p>
      <div style={{ marginTop: 10 }}>
        {bindings.map(binding => (
          <label className="binding-row" key={binding.uid}>
            <input
              type="checkbox"
              checked={selected.has(binding.uid)}
              onChange={() => toggle(binding.uid)}
            />
            <span className="name">
              {binding.nickName || '未命名博士'}
              {binding.isDefault ? <span className="badge" style={{ marginLeft: 8 }}>默认</span> : null}
            </span>
            <span className="meta">UID {binding.uid} · {binding.channelName || '未知区服'}</span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => void addSelected()}>
          添加所选的 {selected.size} 个账号
        </button>
      </div>
    </div>
  )
}

export default function AddAccountWizard({ onFinished }: { onFinished: () => void }) {
  const [backendBaseUrl, setBackendBaseUrl] = useState('https://backend.yituliu.cn')
  const [wizardState, setWizardState] = useState<WizardState | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  // 未设置主密码时先要求设置，保证新凭据不会以明文落盘；null 表示安全状态未确认
  const [securityReady, setSecurityReady] = useState<boolean | null>(null)

  useEffect(() => {
    void getSecurityStatus().then(status => setSecurityReady(!status.configured || status.unlocked))
    void loadState().then(state => setBackendBaseUrl(state.settings.backendBaseUrl))
  }, [])

  const handleCredential = useCallback((next: WizardState) => {
    setWizardState(next)
    setFeedback({ kind: 'info', text: '森空岛登录成功，正在获取绑定的明日方舟账号…' })
  }, [])

  const handleError = useCallback((message: string) => {
    setFeedback({ kind: 'err', text: message })
  }, [])

  if (securityReady === null) {
    return (
      <div className="card">
        <h2>添加明日方舟账号</h2>
        <p className="hint">加载中…</p>
      </div>
    )
  }

  if (!securityReady) {
    return <SetupScreen onDone={() => setSecurityReady(true)} />
  }

  return (
    <div className="card">
      <h2>{wizardState ? '选择账号' : '添加明日方舟账号'}</h2>

      {!wizardState ? (
        <>
          <p className="hint" style={{ marginBottom: 12 }}>
            三种方式获取的都是「森空岛凭证」，插件用它拉取干员与账号数据，再通过一图流读写 token 更新到一图流。
          </p>
          <div className="method-picker">
            <QrLoginPanel backendBaseUrl={backendBaseUrl} onSuccess={handleCredential} onError={handleError} />
          </div>
          <h3>或使用以下方式</h3>
          <HgTokenPanel backendBaseUrl={backendBaseUrl} onSuccess={handleCredential} onError={handleError} />
          <h3>或</h3>
          <CredPastePanel onSuccess={handleCredential} onError={handleError} />
        </>
      ) : (
        <BindingPicker
          wizardState={wizardState}
          onError={handleError}
          onFinished={addedCount => {
            setFeedback({ kind: 'ok', text: `已添加 ${addedCount} 个账号。下一步：到「设置」中点击「自动获取读写 token」（需浏览器已登录一图流），获取不到时再手动生成填写。` })
            setWizardState(null)
            window.setTimeout(onFinished, 1200)
          }}
        />
      )}

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
    </div>
  )
}
