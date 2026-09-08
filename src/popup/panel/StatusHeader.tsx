import type { SklandPlayerStatus } from '../../core/skland-info'
import { CheckerStripe } from '../../ui/components'
import { SettingsIcon, SupportIcon, SwitchIcon } from '../../ui/icons'
import { openOptions } from '../panelActions'

/**
 * 博士信息头：头像 + 等级/UID/名字 + 右侧操作钮（助战检索/切换账号/管理页），
 * 底部通栏格纹装饰条（替代旧版 wordmark 图片）。
 */
export default function StatusHeader({ status, onOpenSwitcher, onOpenAssist }: {
  status: SklandPlayerStatus
  onOpenSwitcher: () => void
  onOpenAssist: () => void
}) {
  const avatarUrl = `https://web.hycdn.cn/arknights/game/assets/avatar/${encodeURIComponent(status.avatar.id)}.png`
  return (
    <>
      <header className="status-header">
        <img className="doctor-avatar" src={avatarUrl} alt="" />
        <div className="doctor-meta">
          <div className="doctor-top">
            <div className="doctor-level">
              <span className="lv-num">{status.level}</span>
              <span className="lv-label">
                <span>Lv.</span>
                <span>博士等级</span>
              </span>
            </div>
            <span className="doctor-uid">UID: {status.uid}</span>
          </div>
          <div className="doctor-name">Dr. {status.name}</div>
        </div>
        <div className="status-header-actions">
          <button type="button" className="icon-btn" title="助战检索" onClick={onOpenAssist}>
            <SupportIcon size={15} />
          </button>
          <button type="button" className="icon-btn" title="切换账号" onClick={onOpenSwitcher}>
            <SwitchIcon size={15} />
          </button>
          <button type="button" className="icon-btn" title="打开管理页" onClick={() => openOptions()}>
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>
      <CheckerStripe className="status-header-bar" />
    </>
  )
}
