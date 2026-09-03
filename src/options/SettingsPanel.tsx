import { useEffect, useState } from 'react'

import { DEFAULT_BACKEND_BASE_URL, loadState, subscribeState, updateSettings } from '../storage/store'
import type { ExtensionSettings } from '../core/types'

const INTERVAL_OPTIONS = [6, 12, 24, 48]

function applyAutoSyncAlarm(): Promise<{ ok: boolean }> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'applyAutoSync' }, response => resolve(response ?? { ok: true }))
  })
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
    setSettings(normalized)
    setFeedback({ kind: 'ok', text: '设置已保存' + (normalized.autoSyncEnabled ? '，定时同步已生效' : '') })
  }

  return (
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

      {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
    </div>
  )
}
