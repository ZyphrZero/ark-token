/**
 * 浮层定位（纯函数，便于单测）。
 *
 * 约束：扩展 popup 是操作系统级窗口，`body` 固定 400×600，**内容无法画到窗口外**
 * （与网页里浮层可溢出视口不同），所以位置必须落在视口内。
 *
 * 策略：**只走上下、不走左右**。400px 宽的窗口里，干员头像靠右排列（控制中枢 5 人时
 * 最左头像 x≈170），左右两侧都放不下 ~300px 的浮层，强行左右放会被钳回来盖住头像
 * （原实现的缺陷）。垂直方向有 600px，放下方/上方既宽敞又绝不遮挡锚点。
 *
 * 高度放不下时返回 maxHeight 让浮层内部滚动，而不是移到锚点上方遮挡。
 */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Placement {
  left: number
  top: number
  /** 可用高度上限；浮层超出时内部滚动（不靠位移躲避，避免遮挡锚点） */
  maxHeight: number
}

/** 视口安全边距 */
export const MARGIN = 6
/** 锚点与浮层的间隙 */
export const GAP = 6

/**
 * 计算浮层位置。
 * - 垂直：优先放锚点下方；下方不够则放上方；两侧都不够时取空间更大的一侧并限高滚动。
 * - 水平：左边与锚点左边对齐，再钳进视口（因为垂直已错开，水平钳制不会造成遮挡）。
 */
export function placeTooltip(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): Placement {
  const spaceBelow = viewport.height - MARGIN - (anchor.bottom + GAP)
  const spaceAbove = anchor.top - GAP - MARGIN

  let top: number
  let maxHeight: number
  if (size.height <= spaceBelow) {
    top = anchor.bottom + GAP
    maxHeight = spaceBelow
  } else if (size.height <= spaceAbove) {
    top = anchor.top - GAP - size.height
    maxHeight = spaceAbove
  } else if (spaceBelow >= spaceAbove) {
    // 两侧都放不下：取空间更大的一侧，限高由浮层内部滚动消化
    top = anchor.bottom + GAP
    maxHeight = Math.max(0, spaceBelow)
  } else {
    maxHeight = Math.max(0, spaceAbove)
    top = anchor.top - GAP - maxHeight
  }

  const maxLeft = viewport.width - MARGIN - size.width
  const left = Math.max(MARGIN, Math.min(anchor.left, maxLeft))

  return { left, top, maxHeight }
}
