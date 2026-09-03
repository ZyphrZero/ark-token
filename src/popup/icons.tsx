/** 面板用内联 SVG 图标（视觉移植自 rhodes-headquarters） */

export function ArrowSwitchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={4}
        d="M42 19H6M30 7l12 12M6.799 29h36m-36 0l12 12"
      />
    </svg>
  )
}

export function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 基建设施等级刻度（菱形竖标） */
export function LevelMark({ color }: { color: string }) {
  return (
    <svg width={6} height={16} viewBox="0 0 6 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 3V13L3 16L6 13V3L3 0L0 3Z" fill={color} />
    </svg>
  )
}
