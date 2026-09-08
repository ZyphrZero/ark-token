import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

import {
  buffOf,
  buildingSkillsOf,
  buildingSkillUnlockText,
  isBuildingSkillUnlocked,
  operatorData,
  professionKey,
  professionName
} from '../../../core/operator-data'
import type { OperatorProgress } from '../../../core/operator-data'
import BuffDescription from './BuffDescription'
import { skillIconUrl } from './skillIcons'
import { professionIconUrl } from './professionIcons'
import { MARGIN, placeTooltip } from './tooltipPlacement'
import type { Placement } from './tooltipPlacement'

/** 浮层宽度：popup 只有 400px 宽，留出两侧安全边距后取整 */
const TOOLTIP_WIDTH = 300

/**
 * 基建技能浮层（悬浮进驻干员头像时显示该干员的全部基建技能）。
 *
 * **必须 portal 到 body**：干员头像在 `.building-scroll`（`overflow-y: auto`）内，
 * 就地绝对定位会被裁掉。扩展 popup 是操作系统级窗口、`body` 固定 400×600，
 * 内容画不到窗口外，故位置必须落在视口内——定位口径见 tooltipPlacement.ts
 * （只走上下不走左右，保证不遮挡头像）。
 *
 * 高度先渲染再实测（useLayoutEffect），首帧不可见以免看到跳位。
 * 浮层自身 `pointer-events: none`，不拦截鼠标，避免与头像的 hover 抢事件。
 */
export default function BuildingSkillTooltip({ charId, anchor, progress, onMouseEnter, onMouseLeave }: {
  charId: string
  /** 锚点（头像）的视口矩形，由调用方用 getBoundingClientRect 提供 */
  anchor: DOMRect
  /** 该干员练度（决定每档是否已解锁）；缺失时全部按未解锁显示 */
  progress: OperatorProgress | undefined
  /** 内容超高需要滚动，故浮层可接收鼠标；进入时应取消调用方的关闭计时 */
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}): ReactNode {
  const tiers = buildingSkillsOf(charId)
  const boxRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)

  useLayoutEffect(() => {
    const height = boxRef.current?.scrollHeight ?? 0
    setPlacement(
      placeTooltip(
        anchor,
        { width: TOOLTIP_WIDTH, height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    )
    // anchor 是每次 hover 新建的 DOMRect，charId 变化时内容高度也会变
  }, [anchor, charId])

  if (tiers.length === 0) {
    return null
  }

  const operator = operatorData.operators[charId]
  const operatorName = operator?.name ?? charId
  const professionKeyValue = operator ? professionKey(operator.profession) : undefined
  const professionIcon = professionIconUrl(professionKeyValue)

  return createPortal(
    <div
      ref={boxRef}
      className="skill-tip cut-box"
      style={{
        // 首帧未测高：先放在安全位置并隐藏，测完立即定位显示（避免可见的跳位）
        left: placement?.left ?? MARGIN,
        top: placement?.top ?? MARGIN,
        width: TOOLTIP_WIDTH,
        maxHeight: placement?.maxHeight,
        visibility: placement ? 'visible' : 'hidden'
      }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 干员头部：职业图标 + 名称（让技能说明归属于具体干员） */}
      <div className="skill-tip-operator">
        {professionIcon && <img className="skill-tip-profession" src={professionIcon} alt={professionName(operator?.profession ?? 0)} />}
        <span className="skill-tip-operator-name">{operatorName}</span>
        {operator && <span className="skill-tip-operator-profession">{professionName(operator.profession)}</span>}
      </div>
      {tiers.map(tier => {
        const buff = buffOf(tier.id)
        const unlocked = isBuildingSkillUnlocked(tier, progress)
        const iconUrl = skillIconUrl(tier.icon ?? buff?.icon)
        const description = buff?.descriptionRich ?? ''
        return (
          <div className={`skill-tip-item${unlocked ? '' : ' locked'}`} key={`${tier.slot}-${tier.id}`}>
            <div className="skill-tip-head">
              {iconUrl
                ? <img className="skill-tip-icon" src={iconUrl} alt="" />
                : <span className="skill-tip-icon" />}
              <span className="skill-tip-name">{tier.name || buff?.name || tier.id}</span>
              <span className="skill-tip-badge">{unlocked ? '已解锁' : '未解锁'}</span>
            </div>
            <div className="skill-tip-unlock">{buildingSkillUnlockText(tier)}</div>
            {description && <BuffDescription className="skill-tip-desc" text={description} />}
          </div>
        )
      })}
    </div>,
    document.body
  )
}

/** 该干员是否有基建技能（无技能时不挂 hover 事件，避免空浮层） */
export function hasBuildingSkills(charId: string): boolean {
  return buildingSkillsOf(charId).length > 0
}
