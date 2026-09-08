import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import type { SklandPanelCharacter, SklandResidentCharacter } from '../../../core/skland-info'
import { apToMoodPoints, isResidentTired, moodPercent } from '../../../core/status/building'
import apHalf from '../../assets/icons/ap-half.svg'
import apHigh from '../../assets/icons/ap-high.svg'
import apLow from '../../assets/icons/ap-low.svg'
import statusWorking from '../../assets/icons/status-working.svg'
import BuildingSkillTooltip, { hasBuildingSkills } from './BuildingSkillTooltip'

/**
 * charId → 干员条目（player/info 的 chars[]）。
 * skinId 用于头像 URL，evolvePhase/level 用于基建技能的解锁判定。
 */
export type CharMap = Map<string, SklandPanelCharacter>

/**
 * 基建进驻干员（Figma 498:681）：头像+40%暗遮罩+工作中角标+心情条+具体心情值。
 * currentAp 由父组件按设施类型外推（工作房间按 1 点/小时扣除、宿舍按倍率恢复），
 * 缺省退回快照值（控制中枢/训练学员等无官方外推口径的房间）。
 *
 * 悬浮头像弹出该干员的基建技能浮层（已解锁/未解锁 + 解锁条件 + 效果描述），
 * 浮层 portal 到 body 以避开 .building-scroll 的 overflow 裁切。
 */
export default function ResidentCharacter({ resident, charMap, currentAp, showWorking = true }: {
  resident: SklandResidentCharacter
  charMap: CharMap
  /** 外推后的当前 ap（0.01 秒单位），缺省用快照 resident.ap */
  currentAp?: number
  showWorking?: boolean
}): ReactNode {
  const ap = currentAp ?? resident.ap
  const mood = moodPercent(ap)
  const points = apToMoodPoints(ap)
  const tired = isResidentTired(ap)
  // 工作设施中的疲劳干员：红色蒙版 + 注意力涣散角标（宿舍休息中的干员恢复中，不标）
  const distracted = tired && showWorking
  const char = charMap.get(resident.charId)
  const skinId = char?.skinId
  const moodIcon = mood < 25 ? apLow : mood < 75 ? apHalf : apHigh

  const portraitRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  // 无基建技能的干员（如训练学员/新干员未收录）不挂 hover，避免弹空浮层
  const skillable = hasBuildingSkills(resident.charId)

  /**
   * 关闭计时：仅当指针确实朝浮层移动时才启用（否则立即关闭）。
   * 浮层可滚动因此要接收鼠标，而鼠标从头像移向浮层会先触发头像的 mouseleave——
   * 此时退出点已落在浮层上（elementFromPoint 可见），故保留一小段延迟等浮层的
   * mouseenter 接管；其余方向离开则立即关闭，避免拖沓。
   * 离开浮层本身没有下家可交接，由调用处直接 setAnchor(null) 立即关闭。
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), [])
  const scheduleClose = useCallback((event: ReactMouseEvent) => {
    clearTimeout(closeTimer.current)
    // 退出点是否已落在浮层上：不是则真离开，立即关闭
    const at = document.elementFromPoint(event.clientX, event.clientY)
    if (!at || !at.closest('.skill-tip')) {
      setAnchor(null)
      return
    }
    // 正在移向浮层：延迟到浮层的 mouseenter 接管，期间保持打开
    closeTimer.current = setTimeout(() => setAnchor(null), 100)
  }, [])
  // 卸载时清计时器，避免对已卸载组件 setState
  useEffect(() => cancelClose, [cancelClose])

  return (
    <div className="resident">
      <div
        className="resident-portrait"
        ref={portraitRef}
        // 位置在进入时取一次：popup 内列表滚动时 hover 会先移出再移入，无需实时跟随
        onMouseEnter={skillable
          ? () => {
              cancelClose()
              setAnchor(portraitRef.current?.getBoundingClientRect() ?? null)
            }
          : undefined}
        onMouseLeave={skillable ? scheduleClose : undefined}
      >
        {skinId
          ? (
              <img
                className="resident-avatar"
                src={`https://web.hycdn.cn/arknights/game/assets/char_skin/avatar/${encodeURIComponent(skinId)}.png`}
                alt=""
              />
            )
          : <span className="resident-avatar" style={{ display: 'block' }} />}
        {showWorking && (
          <>
            <span className={`resident-shade${distracted ? ' tired' : ''}`} />
            <span className={`resident-working${distracted ? ' tired' : ''}`}>
              {distracted ? '注意力涣散' : <><img src={statusWorking} alt="" />工作中</>}
            </span>
          </>
        )}
      </div>
      {anchor && (
        <BuildingSkillTooltip
          charId={resident.charId}
          anchor={anchor}
          progress={char}
          onMouseEnter={cancelClose}
          // 离开浮层即真离开（无下家可交接），立即关闭——拖沓只该发生在「正在交接」那一步
          onMouseLeave={() => setAnchor(null)}
        />
      )}
      <div className="resident-mood">
        <img className="resident-mood-icon" src={moodIcon} alt="" />
        <div className="resident-mood-bar">
          <div className="resident-mood-fill" style={{ width: `${mood}%` }} />
        </div>
      </div>
      <span className={`resident-mood-text${tired ? ' tired' : ''}`}>{points.toFixed(1)}</span>
    </div>
  )
}
