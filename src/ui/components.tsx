/*
 * 罗德岛终端 · 共享 UI 原语组件
 * 仅做渲染与配色（通过 CSS 变量/类），不含业务判断；
 * 业务计算仍集中在 src/core/status/ 纯函数。
 */
import type { CSSProperties, ReactNode } from 'react'

/** 游戏式黑白格纹装饰块（区块标题左侧角标） */
export function CheckerMark({ className }: { className?: string }) {
  return <span aria-hidden className={className ? `checker ${className}` : 'checker'} />
}

/** 通栏格纹装饰条（信息头底部、浮层头等分隔装饰） */
export function CheckerStripe({ className }: { className?: string }) {
  return <span aria-hidden className={className ? `checker-stripe ${className}` : 'checker-stripe'} />
}

/** 终端式双语区块标题：格纹角标 + 中文大字 + 英文大写小字 + 右侧插槽 */
export function SectionHeader({ title, sub, children, className }: {
  title: string
  sub?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={className ? `section-header ${className}` : 'section-header'}>
      <CheckerMark />
      <h3 className="section-header-title">
        <span className="cn">{title}</span>
        {sub && <span className="en">{sub}</span>}
      </h3>
      {children}
    </div>
  )
}

/** 斜切角卡片容器：--cut 控制切角尺寸，--box-bg 控制内衬表面色 */
export function CutCard({ className, style, children }: {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <div className={className ? `cut-box ${className}` : 'cut-box'} style={style}>
      {children}
    </div>
  )
}

/** 斜角进度条：value/max 归一化，tone 选语义色（--meter-color 可覆盖） */
export function MeterBar({ value, max, className, style }: {
  value: number
  max: number
  className?: string
  style?: CSSProperties
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={className ? `meter ${className}` : 'meter'} style={style} role="progressbar">
      <i style={{ width: `${percent}%` }} />
    </div>
  )
}

/** 数值读数：Bender 大数字 + 可选 /上限，tone 选语义色 */
export function StatReadout({ value, max, className }: {
  value: ReactNode
  max?: ReactNode
  className?: string
}) {
  return (
    <span className={className ? `readout font-bender ${className}` : 'readout font-bender'}>
      <b>{value}</b>
      {max != null && <i>/{max}</i>}
    </span>
  )
}

/** 状态徽标：tone = neutral | accent | ok | warn | danger */
export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'; children?: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

/** 分段式 Tabs：激活项高亮 + 滑动指示条（受控组件） */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
  className?: string
}) {
  const index = Math.max(0, tabs.findIndex(tab => tab.key === value))
  return (
    <div
      className={className ? `seg-tabs ${className}` : 'seg-tabs'}
      style={{ '--seg-count': tabs.length, '--seg-index': index } as CSSProperties}
      role="tablist"
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          className={tab.key === value ? 'active' : ''}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
      <span className="seg-indicator" aria-hidden />
    </div>
  )
}
