import type { ReactNode } from 'react'

import type { SklandResidentCharacter } from '../../../core/skland-info'
import { apToMoodPoints, isResidentTired, moodPercent } from '../../../core/status/building'
import apHalf from '../../assets/icons/ap-half.svg'
import apHigh from '../../assets/icons/ap-high.svg'
import apLow from '../../assets/icons/ap-low.svg'
import statusWorking from '../../assets/icons/status-working.svg'

/**
 * 基建进驻干员（Figma 498:681）：头像+40%暗遮罩+工作中角标+心情条+具体心情值。
 * currentAp 由父组件按设施类型外推（工作房间按 1 点/小时扣除、宿舍按倍率恢复），
 * 缺省退回快照值（控制中枢/训练学员等无官方外推口径的房间）。
 */
export default function ResidentCharacter({ resident, charMap, currentAp, showWorking = true }: {
  resident: SklandResidentCharacter
  charMap: Map<string, string>
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
  const skinId = charMap.get(resident.charId)
  const moodIcon = mood < 25 ? apLow : mood < 75 ? apHalf : apHigh

  return (
    <div className="resident">
      <div className="resident-portrait">
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
