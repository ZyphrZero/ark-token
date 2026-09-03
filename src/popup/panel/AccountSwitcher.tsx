import type { GameAccount } from '../../core/types'
import listArrow from '../assets/list-arrow.svg'
import { openOptions } from '../panelActions'

/**
 * 账号切换侧滑面板（Figma 165:4994）：
 * 容器 270 宽 / 顶部 40px「角色列表 CHARACTER」标题栏 + 底线装饰 / 绑定角色项 254x70（背景 #2d2e30）。
 * 当前激活账号以 primary 边框与「当前」徽标标识（设计外的功能标识）。
 */
export default function AccountSwitcher({ accounts, activeAccountId, onActivate, onClose }: {
  accounts: GameAccount[]
  activeAccountId: string | null
  onActivate: (accountId: string) => void
  onClose: () => void
}) {
  return (
    <div className="switcher-overlay" onClick={onClose}>
      <div className="switcher-panel" onClick={event => event.stopPropagation()}>
        <div className="switcher-header">
          <span className="switcher-heading">
            <span className="cn">角色列表</span>
            <span className="en">CHARACTER</span>
          </span>
          <button type="button" className="icon-btn" title="打开管理页" onClick={() => openOptions()}>
            ⚙
          </button>
        </div>
        <div className="switcher-list">
          {accounts.map(account => {
            const active = account.id === activeAccountId
            return (
              <button
                key={account.id}
                type="button"
                className={`switcher-item${active ? ' active' : ''}`}
                onClick={() => {
                  onActivate(account.id)
                  onClose()
                }}
              >
                <span className="switcher-meta">
                  <span className="switcher-name">
                    Dr. {account.nickName || '未命名博士'}
                    {active && <span className="switcher-badge">当前</span>}
                  </span>
                  <span className="switcher-sub">
                    <span>角色区服：{account.channelName || '未知区服'}</span>
                    <span className="uid font-bender">UID: {account.uid}</span>
                  </span>
                </span>
                <img className="switcher-arrow" src={listArrow} alt="" />
              </button>
            )
          })}
        </div>
        <div className="switcher-footer">
          <button type="button" className="btn btn-sm" onClick={() => openOptions('#add')}>＋ 添加账号</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openOptions()}>管理页</button>
        </div>
      </div>
    </div>
  )
}
