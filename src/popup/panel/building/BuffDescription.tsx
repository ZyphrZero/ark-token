import { Fragment } from 'react'
import type { ReactNode } from 'react'

/**
 * 基建技能描述富文本渲染。
 *
 * 上游（arkntools / 游戏数据）用两类标签，统一以 `</>` 闭合、可嵌套：
 * - `<@cc.X>` 着色：`vup` 提升值（绿）、`vdown` 下降值（红）、`kw` 关键词、`rem` 强调
 * - `<$cc.X>` 术语包装：无颜色，仅包住内容（如 `<$cc.angel><@cc.kw>能天使</></>`），
 *   渲染时透传内容
 *
 * 容错：多余的 `</>` 忽略；未闭合的标签在文本结束时自动收尾；未知 `@` 标签按无色渲染
 * （上游新增标签不至于让整条描述消失）。
 */

/** `@` 标签 → CSS 类；未列出的标签无色透传 */
const COLOR_CLASS: Record<string, string> = {
  vup: 'buff-vup',
  vdown: 'buff-vdown',
  kw: 'buff-kw',
  rem: 'buff-rem'
}

interface Frame {
  /** 该层的 CSS 类（术语包装层为 undefined，只透传） */
  className?: string
  children: ReactNode[]
}

/** 标签或文本片段 */
const TOKEN = /<(@|\$)cc\.([^>]*)>|<\/>/g

/**
 * 解析富文本为 React 节点树。
 * 用栈处理嵌套：遇开标签压栈、遇 `</>` 出栈并把该层包成 span 挂到父层。
 */
export function renderBuffDescription(text: string): ReactNode[] {
  const stack: Frame[] = [{ children: [] }]
  let cursor = 0
  let key = 0

  const pushText = (value: string) => {
    if (value) {
      stack[stack.length - 1].children.push(value)
    }
  }

  const closeTop = () => {
    // 栈底是根层，不可弹出（多余的 </> 直接忽略）
    if (stack.length <= 1) {
      return
    }
    const frame = stack.pop()!
    const parent = stack[stack.length - 1]
    parent.children.push(
      frame.className
        ? (
            <span key={`b${key++}`} className={frame.className}>
              {frame.children}
            </span>
          )
        : // 术语包装层无颜色，用 Fragment 透传，不产生多余 DOM
          <Fragment key={`b${key++}`}>{frame.children}</Fragment>
    )
  }

  for (const match of text.matchAll(TOKEN)) {
    pushText(text.slice(cursor, match.index))
    cursor = match.index + match[0].length
    if (match[0] === '</>') {
      closeTop()
      continue
    }
    const [, sigil, name] = match
    // `$` 为术语包装（无色透传）；`@` 按类名着色，未知名无色
    stack.push({ className: sigil === '@' ? COLOR_CLASS[name] : undefined, children: [] })
  }
  pushText(text.slice(cursor))

  // 未闭合的标签自动收尾，避免内容丢失
  while (stack.length > 1) {
    closeTop()
  }
  return stack[0].children
}

/** 技能描述（富文本着色） */
export default function BuffDescription({ text, className }: { text: string; className?: string }): ReactNode {
  return <span className={className}>{renderBuffDescription(text)}</span>
}
