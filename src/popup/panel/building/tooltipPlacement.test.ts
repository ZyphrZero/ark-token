import { describe, expect, it } from 'vitest'

import { GAP, MARGIN, placeTooltip } from './tooltipPlacement'
import type { Rect } from './tooltipPlacement'

/** popup 固定视口 */
const VIEWPORT = { width: 400, height: 600 }
const SIZE = { width: 300, height: 160 }

/** 42×42 头像锚点 */
function avatar(left: number, top: number): Rect {
  return { left, top, right: left + 42, bottom: top + 42 }
}

/** 两矩形是否相交（用于断言浮层不遮挡头像） */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

function asRect(place: { left: number; top: number }, size: { width: number; height: number }): Rect {
  return { left: place.left, top: place.top, right: place.left + size.width, bottom: place.top + size.height }
}

describe('placeTooltip', () => {
  it('默认放锚点下方，水平与锚点左对齐后钳进视口', () => {
    const anchor = avatar(170, 100)
    const place = placeTooltip(anchor, SIZE, VIEWPORT)
    expect(place.top).toBe(anchor.bottom + GAP)
    // 浮层 300 宽、视口 400，左对齐 170 会越界，钳到 maxLeft = 400 − 6 − 300 = 94
    expect(place.left).toBe(94)
  })

  it('窄浮层可真正与锚点左对齐（不触发钳制）', () => {
    const narrow = { width: 160, height: 120 }
    const place = placeTooltip(avatar(170, 100), narrow, VIEWPORT)
    expect(place.left).toBe(170)
  })

  it('回归：控制中枢 5 人时最左头像不被遮挡（原实现会钳到 x=126 盖住头像）', () => {
    // 5×42 + 4×3 间隙 → 最左头像 x≈170
    const anchor = avatar(170, 120)
    const place = placeTooltip(anchor, SIZE, VIEWPORT)
    expect(overlaps(asRect(place, SIZE), anchor)).toBe(false)
  })

  it('任意头像位置都不遮挡锚点（横扫整个视口）', () => {
    for (let left = 0; left <= VIEWPORT.width - 42; left += 7) {
      for (let top = 0; top <= VIEWPORT.height - 42; top += 11) {
        const anchor = avatar(left, top)
        const place = placeTooltip(anchor, SIZE, VIEWPORT)
        const rect = asRect(place, { width: SIZE.width, height: Math.min(SIZE.height, place.maxHeight) })
        expect(overlaps(rect, anchor)).toBe(false)
      }
    }
  })

  it('高浮层（4 技能最坏 ~440px）横扫：限高后仍不遮挡且不出界', () => {
    const tall = { width: 300, height: 440 }
    for (let top = 0; top <= VIEWPORT.height - 42; top += 6) {
      const anchor = avatar(170, top)
      const place = placeTooltip(anchor, tall, VIEWPORT)
      // 实际渲染高度受 max-height 限制
      const rect = asRect(place, { width: tall.width, height: Math.min(tall.height, place.maxHeight) })
      expect(overlaps(rect, anchor)).toBe(false)
      expect(rect.top).toBeGreaterThanOrEqual(MARGIN)
      expect(rect.bottom).toBeLessThanOrEqual(VIEWPORT.height - MARGIN)
    }
  })

  it('下方空间不足时翻到上方', () => {
    // 锚点贴底：下方剩余 < 160
    const anchor = avatar(170, 520)
    const place = placeTooltip(anchor, SIZE, VIEWPORT)
    expect(place.top).toBe(anchor.top - GAP - SIZE.height)
    expect(place.top).toBeGreaterThanOrEqual(MARGIN)
  })

  it('上下都放不下时取空间更大一侧并限高（内部滚动，不靠位移躲避）', () => {
    const tall = { width: 300, height: 520 }
    // 锚点在中间偏下 → 上方空间更大
    const anchor = avatar(170, 300)
    const place = placeTooltip(anchor, tall, VIEWPORT)
    expect(place.maxHeight).toBeLessThan(tall.height)
    expect(place.maxHeight).toBe(anchor.top - GAP - MARGIN)
    // 限高后仍不遮挡锚点
    expect(overlaps(asRect(place, { width: tall.width, height: place.maxHeight }), anchor)).toBe(false)
  })

  it('水平钳进视口：靠右头像不会让浮层越出右边界', () => {
    const anchor = avatar(VIEWPORT.width - 42, 100)
    const place = placeTooltip(anchor, SIZE, VIEWPORT)
    expect(place.left + SIZE.width).toBeLessThanOrEqual(VIEWPORT.width - MARGIN)
    expect(place.left).toBeGreaterThanOrEqual(MARGIN)
  })

  it('水平左边界同样钳制', () => {
    const place = placeTooltip(avatar(0, 100), SIZE, VIEWPORT)
    expect(place.left).toBe(MARGIN)
  })
})
