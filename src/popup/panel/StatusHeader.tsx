import type { SklandPlayerStatus } from '../../core/skland-info'
import headerWordmark from '../assets/header-wordmark.svg'
import switchIcon from '../assets/switch-icon.svg'
import supportIcon from '../assets/support-icon.svg'

/**
 * 博士信息头（Figma 123:4376）：
 * 320x70 圆角8 / 头像60 / 等级20px+8px标签 / UID 12px / 名字16px / 24x24 白圆切换钮 / 底部装饰条。
 */
export default function StatusHeader({ status, onOpenSwitcher, onOpenAssist }: {
  status: SklandPlayerStatus
  onOpenSwitcher: () => void
  onOpenAssist: () => void
}) {
  const avatarUrl = `https://web.hycdn.cn/arknights/game/assets/avatar/${encodeURIComponent(status.avatar.id)}.png`
  return (
    <header className="status-header">
      <img className="doctor-avatar" src={avatarUrl} alt="" />
      <div className="doctor-meta">
        <div className="doctor-top">
          <div className="doctor-level">
            <span className="lv-num font-bender">{status.level}</span>
            <span className="lv-label">
              <span>Lv.</span>
              <span>博士等级</span>
            </span>
          </div>
          <span className="doctor-uid font-bender">UID: {status.uid}</span>
        </div>
        <div className="doctor-name">Dr. {status.name}</div>
      </div>
      <div className="status-header-actions">
        <button className="switcher-trigger assist-trigger" title="助战检索" onClick={onOpenAssist}>
          <img src={supportIcon} alt="" />
        </button>
        <button className="switcher-trigger" title="切换账号" onClick={onOpenSwitcher}>
          <img src={switchIcon} alt="" />
        </button>
      </div>
      <img className="header-wordmark" src={headerWordmark} alt="" />
    </header>
  )
}
