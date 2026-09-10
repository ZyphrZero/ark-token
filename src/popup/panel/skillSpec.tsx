import spec1 from '../assets/icons/spec1.png'
import spec2 from '../assets/icons/spec2.png'
import spec3 from '../assets/icons/spec3.png'

/** 专精 1-3 等级角标图（0 = 未专精不显示），叠放在技能图标左上角 */
const SPEC_BADGE_URLS = [spec1, spec2, spec3] as const

/** 技能专精角标：level 取 1-3，越界（含未专精 0）不渲染；定位样式由调用方 CSS 提供 */
export function SkillSpecBadge({ level, className }: { level: number; className: string }) {
  if (level < 1 || level > SPEC_BADGE_URLS.length) return null
  return <img className={className} src={SPEC_BADGE_URLS[level - 1]} alt={`专精 ${level}`} />
}
