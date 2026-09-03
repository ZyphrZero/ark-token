import type { ReactNode } from 'react'

/** 区块标题：中文粗体 + 英文小字 + 右侧插槽（tab 等），底纹来自 bg-section-title.svg */
export default function SectionTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <h3 className="section-title">
      <span className="title-text">
        <span className="title-cn">{title}</span>
        {sub && <span className="title-en">{sub}</span>}
      </span>
      {children}
    </h3>
  )
}
