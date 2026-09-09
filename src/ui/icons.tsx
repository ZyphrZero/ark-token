/*
 * 罗德岛终端 · 统一图标库
 * 规范：24×24 视图框、currentColor、stroke 1.8 线性风格（实心图标单独注明），
 * 替代此前 emoji / img 引用 SVG 的混用方案；size 可按场景覆盖。
 */
import type { ReactNode } from 'react'

type IconProps = { size?: number; className?: string }

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** 刷新（底栏手动刷新，配 .spin 旋转） */
export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Svg>
  )
}

/** 切换账号（双向箭头） */
export function SwitchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h13" />
      <path d="m14 5 3 3-3 3" />
      <path d="M20 16H7" />
      <path d="m10 13-3 3 3 3" />
    </Svg>
  )
}

/** 助战检索（双人：前方干员 + 后方支援） */
export function SupportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3.2 2.4-5.2 5.5-5.2s5.5 2 5.5 5.2" />
      <path d="M16 5.3a2.8 2.8 0 0 1 0 5.4" />
      <path d="M17.5 14.6c2 .7 3 2.4 3 4.9" />
    </Svg>
  )
}

/** 干员档案（身份卡） */
export function OperatorsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <circle cx="9" cy="10" r="2" />
      <path d="M6 16c0-2 1.3-3 3-3s3 1 3 3M15 9h3M15 13h3" />
    </Svg>
  )
}

/** 设置（齿轮） */
export function PortraitViewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <circle cx="12" cy="9" r="2" />
      <path d="M9 17v-1a3 3 0 0 1 6 0v1" />
    </Svg>
  )
}

export function GridViewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  )
}

export function ListViewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  )
}

/** 设置（齿轮） */
export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

/** 添加（加号） */
export function AddIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  )
}

/** 返回（左尖角） */
export function BackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 5-7 7 7 7" />
    </Svg>
  )
}

/** 右尖角（列表项引导箭头） */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  )
}

/** 锁（加密保护） */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <path d="M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
    </Svg>
  )
}

/** 无人机（四旋翼） */
export function DroneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="m7.4 7.4 3 3m6.2-6.2-3 3m-6.2 6.2 3-3m6.2 6.2-3-3" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** 星（稀有度，实心） */
export function StarIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.6 14.9 8.5l6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z"
      />
    </svg>
  )
}

/** 基建设施等级刻度（菱形竖标，颜色跟随 currentColor） */
export function LevelMark({ size = 6 }: { size?: number }) {
  return (
    <svg width={size} height={size * 2.6} viewBox="0 0 6 16" fill="none" aria-hidden="true">
      <path d="M0 3V13L3 16L6 13V3L3 0L0 3Z" fill="currentColor" />
    </svg>
  )
}
