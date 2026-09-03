import { useEffect, useState } from 'react'

import { fetchOperatorInfo } from '../core/yituliuApi'
import { resolveYituliuTokens, type TokenSource } from '../core/yituliuAccountApi'
import { DEFAULT_BACKEND_BASE_URL, loadState, subscribeState, updateSettings } from '../storage/store'
import type { ExtensionSettings } from '../core/types'
import { readYituliuSession } from './yituliuSession'

const INTERVAL_OPTIONS = [6, 12, 24, 48]
const INFO_INTERVAL_OPTIONS = [10, 15, 30, 60]
const YITULIU_TOKEN_PAGE = 'https://ark.yituliu.cn/account/home'

function applyAutoSyncAlarm(): Promise<{ ok: boolean }> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'applyAutoSync' }, response => resolve(response ?? { ok: true }))
  })
}

function applyInfoRefreshAlarm(): Promise<{ ok: boolean }> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'applyInfoRefresh' }, response => resolve(response ?? { ok: true }))
  })
}

function describeTokenSource(source: TokenSource): string {
  if (source === 'generated') {
    return '新生成'
  }
  return '复用官网已有'
}

/** 一图流读写 token：全局一对，自动获取优先，失败提示手动生成 */
function YituliuTokenCard({ settings, onFeedback }: {
  settings: ExtensionSettings
  onFeedback: (feedback: { kind: 'ok' | 'err'; text: string }) => void
}) {
  const [readToken, setReadToken] = useState(settings.yituliuTokens.readToken ?? '')
  const [writeToken, setWriteToken] = useState(settings.yituliuTokens.writeToken ?? '')
  const [busy, setBusy] = useState(false)

  // 存储侧 token 变化（如其他页面保存）时同步到输入框；手动编辑期间不受影响
  useEffect(() => {
    setReadToken(settings.yituliuTokens.readToken ?? '')
    setWriteToken(settings.yituliuTokens.writeToken ?? '')
  }, [settings.yituliuTokens])

  async function persistTokens(nextRead: string, nextWrite: string, okText: string) {
    await updateSettings({
      yituliuTokens: {
        readToken: nextRead.length > 0 ? nextRead : undefined,
        writeToken: nextWrite.length > 0 ? nextWrite : undefined
      }
    })
    setReadToken(nextRead)
    setWriteToken(nextWrite)
    onFeedback({ kind: 'ok', text: okText })
  }

  async function saveTokens() {
    setBusy(true)
    try {
      const trimmedRead = readToken.trim()
      const trimmedWrite = writeToken.trim()
      await persistTokens(trimmedRead, trimmedWrite, '一图流 token 已保存')
    } catch (error) {
      onFeedback({ kind: 'err', text: `保存失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }

  async function autoFetchTokens() {
    setBusy(true)
    try {
      const session = await readYituliuSession()
      const resolved = await resolveYituliuTokens(session, settings.backendBaseUrl)
      const nextRead = resolved.readToken ?? readToken.trim()
      const nextWrite = resolved.writeToken ?? writeToken.trim()
      if (!nextRead && !nextWrite) {
        onFeedback({
          kind: 'err',
          text: `自动获取失败：${resolved.errors.join('；')}。请到官网「用户中心 → 第三方 API Token」手动生成后粘贴`
        })
        return
      }
      const obtained: string[] = []
      if (nextRead) {
        obtained.push(`只读 token（${describeTokenSource(resolved.readSource)}）`)
      }
      if (nextWrite) {
        obtained.push(`只写 token（${describeTokenSource(resolved.writeSource)}）`)
      }
      const suffix = resolved.errors.length > 0
        ? `；另有获取失败的部分：${resolved.errors.join('；')}，可手动补齐`
        : ''
      await persistTokens(nextRead, nextWrite, `已自动获取并保存：${obtained.join('、')}${suffix}`)
    } catch (error) {
      onFeedback({
        kind: 'err',
        text: `自动获取失败：${error instanceof Error ? error.message : String(error)}。可到官网「用户中心 → 第三方 API Token」手动生成后粘贴`
      })
    } finally {
      setBusy(false)
    }
  }

  async function testReadToken() {
    const trimmed = readToken.trim()
    if (!trimmed) {
      onFeedback({ kind: 'err', text: '请先填写读 token 再测试' })
      return
    }
    setBusy(true)
    try {
      const operators = await fetchOperatorInfo(trimmed, settings.backendBaseUrl)
      onFeedback({ kind: 'ok', text: `读 token 有效：一图流已保存 ${operators.length} 名干员数据` })
    } catch (error) {
      onFeedback({ kind: 'err', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>一图流读写 token</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        一图流账号全局仅一对读写 token，所有游戏账号共用；写 token 用于上传数据（必填），读 token 用于同步后校验（可选）。
      </p>

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
        <button className="btn btn-primary" disabled={busy} onClick={() => void autoFetchTokens()}>
          {busy ? '获取中…' : '自动获取读写 token'}
        </button>
        <button className="btn" disabled={busy} onClick={() => void saveTokens()}>保存 token</button>
        <button className="btn" disabled={busy} onClick={() => void testReadToken()}>测试读 token</button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        「自动获取」需要在浏览器中已登录一图流（ark.yituliu.cn），会复用官网已生成的 token，缺失时自动生成。
        获取不到时再到一图流官网
        <a href={YITULIU_TOKEN_PAGE} target="_blank" rel="noreferrer">「用户中心 → 第三方 API Token」</a>
        页面手动生成：读权限对应「只读 Token」，写权限对应「只写 Token」。注意同一权限重新生成会使旧 token 失效。
      </p>
    </div>
  )
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    void loadState().then(state => setSettings(state.settings))
    return subscribeState(state => setSettings(state.settings))
  }, [])

  if (!settings) {
    return <div className="card">加载中…</div>
  }

  async function save() {
    if (!settings) {
      return
    }
    const trimmedBaseUrl = settings.backendBaseUrl.trim().replace(/\/+$/, '')
    const normalized: ExtensionSettings = {
      ...settings,
      backendBaseUrl: trimmedBaseUrl.length > 0 ? trimmedBaseUrl : DEFAULT_BACKEND_BASE_URL
    }
    await updateSettings(normalized)
    await applyAutoSyncAlarm()
    await applyInfoRefreshAlarm()
    setSettings(normalized)
    setFeedback({ kind: 'ok', text: '设置已保存' + (normalized.autoSyncEnabled ? '，定时同步已生效' : '') })
  }

  return (
    <>
      <YituliuTokenCard settings={settings} onFeedback={setFeedback} />

      <div className="card">
        <h2>设置</h2>

        <label className="field">一图流后端地址</label>
        <input
          type="url"
          value={settings.backendBaseUrl}
          onChange={event => setSettings({ ...settings, backendBaseUrl: event.target.value })}
          placeholder={DEFAULT_BACKEND_BASE_URL}
        />
        <p className="hint">
          默认使用线上环境（{DEFAULT_BACKEND_BASE_URL}）。仅在一图流后端开发者要求调试时才改为本地环境
          <code>http://127.0.0.1:10012</code>。
        </p>

        <div className="check-row">
          <input
            id="auto-sync"
            type="checkbox"
            checked={settings.autoSyncEnabled}
            onChange={event => setSettings({ ...settings, autoSyncEnabled: event.target.checked })}
          />
          <label htmlFor="auto-sync">开启定时自动同步（浏览器运行期间按间隔自动更新所有账号）</label>
        </div>

        <label className="field">自动同步间隔</label>
        <select
          value={settings.autoSyncIntervalHours}
          disabled={!settings.autoSyncEnabled}
          onChange={event => setSettings({ ...settings, autoSyncIntervalHours: Number(event.target.value) })}
        >
          {INTERVAL_OPTIONS.map(hours => (
            <option key={hours} value={hours}>
              每 {hours} 小时一次
            </option>
          ))}
        </select>

        <div className="actions">
          <button className="btn btn-primary" onClick={() => void save()}>保存设置</button>
        </div>
      </div>

      <div className="card">
        <h2>状态面板与通知</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          状态面板数据来自森空岛 player/info，仅缓存到本地用于展示，与一图流数据上传无关；
          理智、公招等实时数值由插件按时间戳推算，定时刷新仅用于纠偏与安排桌面通知。
        </p>

        <div className="check-row">
          <input
            id="info-refresh"
            type="checkbox"
            checked={settings.infoRefreshEnabled}
            onChange={event => setSettings({ ...settings, infoRefreshEnabled: event.target.checked })}
          />
          <label htmlFor="info-refresh">定时刷新状态面板数据（浏览器运行期间生效）</label>
        </div>

        <label className="field">面板刷新间隔</label>
        <select
          value={settings.infoRefreshIntervalMinutes}
          disabled={!settings.infoRefreshEnabled}
          onChange={event => setSettings({ ...settings, infoRefreshIntervalMinutes: Number(event.target.value) })}
        >
          {INFO_INTERVAL_OPTIONS.map(minutes => (
            <option key={minutes} value={minutes}>
              每 {minutes} 分钟一次
            </option>
          ))}
        </select>

        <div className="check-row">
          <input
            id="refresh-all"
            type="checkbox"
            checked={settings.refreshAllAccounts}
            disabled={!settings.infoRefreshEnabled}
            onChange={event => setSettings({ ...settings, refreshAllAccounts: event.target.checked })}
          />
          <label htmlFor="refresh-all">刷新全部账号（关闭时仅刷新当前激活账号；多账号需要通知时建议开启）</label>
        </div>

        <div className="check-row">
          <input
            id="recruit-notify"
            type="checkbox"
            checked={settings.recruitNotifyEnabled}
            onChange={event => setSettings({ ...settings, recruitNotifyEnabled: event.target.checked })}
          />
          <label htmlFor="recruit-notify">公开招募完成时发送桌面通知（3 分钟内先后完成的槽位合并为一条）</label>
        </div>

        <div className="check-row">
          <input
            id="sanity-notify"
            type="checkbox"
            checked={settings.sanityNotifyEnabled}
            onChange={event => setSettings({ ...settings, sanityNotifyEnabled: event.target.checked })}
          />
          <label htmlFor="sanity-notify">理智完全恢复时发送桌面通知</label>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={() => void save()}>保存设置</button>
        </div>
      </div>

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
    </>
  )
}
