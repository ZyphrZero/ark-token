import type { SklandResidentCharacter } from '../../../core/skland-info'
import { residentMoodPercent } from '../../../core/status/building'
import apHalf from '../../assets/icons/ap-half.svg'
import apHigh from '../../assets/icons/ap-high.svg'
import apLow from '../../assets/icons/ap-low.svg'
import statusWorking from '../../assets/icons/status-working.svg'

/** 基建进驻干员（Figma 498:681）：头像+40%暗遮罩+工作中角标+心情条（按 mood 百分比换三态图标） */
export default function ResidentCharacter({ resident, charMap, showWorking = true }: {
  resident: SklandResidentCharacter
  charMap: Map<string, string>
  showWorking?: boolean
}) {
  const mood = residentMoodPercent(resident)
  const skinId = charMap.get(resident.charId)
  const moodIcon = mood < 25 ? apLow : mood < 75 ? apHalf : apHigh

  return (
    <div className="resident">
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
          <span className="resident-shade" />
          <span className="resident-working">
            <img src={statusWorking} alt="" />
            工作中
          </span>
        </>
      )}
      <div className="resident-mood">
        <img className="resident-mood-icon" src={moodIcon} alt="" />
        <div className="resident-mood-fill" style={{ width: `${mood}%` }} />
      </div>
    </div>
  )
}
