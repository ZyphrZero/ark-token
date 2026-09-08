import type { SklandBindingInfo, SklandRecruit } from '../../../core/skland-info'
import { parseRecruitSlot } from '../../../core/status/recruit'
import { formatClockTime, formatDuration } from '../../../utils/time'
import { useNow } from '../../useNow'

function RecruitItem({ recruit, index, now }: { recruit: SklandRecruit; index: number; now: number }) {
  const state = parseRecruitSlot(recruit, now)

  return (
    <li className={`recruit-item cut-box recruit-item--${state.status}`}>
      <span className="slot-badge font-bender">{index + 1}</span>
      {state.status === 'completed' && <span className="slot-main">已成功招募到候选人</span>}
      {state.status === 'recruiting' && (
        <>
          <span className="slot-main">招募中...</span>
          <span className="slot-countdown">
            <span>剩余 {formatDuration(state.remainMs ?? 0)}</span>
            <span>{formatClockTime(state.finishAtMs ?? 0, now)} 完成</span>
          </span>
        </>
      )}
      {state.status === 'locked' && <span className="slot-main">尚未解锁公招位</span>}
      {state.status === 'standby' && <span className="slot-main">没有进行中的招募</span>}
    </li>
  )
}

/** 公招 tab：人力办公室联络次数 + 4 槽位状态机与倒计时 */
export default function RecruitTab({ info }: { info: SklandBindingInfo }) {
  const now = useNow(1000)
  const recruits = info.recruit ?? []
  const hire = info.building?.hire

  // 森空岛对新建账号可能只返回部分槽位，补齐为「尚未解锁」
  const slots: SklandRecruit[] = [...recruits]
  while (slots.length < 4) {
    slots.push({ startTs: 0, finishTs: 0, state: 0 })
  }

  return (
    <>
      <div className="hire-row">
        {hire
          ? (
              <>
                <span>联络次数</span>
                <span className="readout font-bender"><b>{hire.refreshCount}</b><i>/3</i></span>
              </>
            )
          : '公招功能可能尚未解锁'}
      </div>
      <ul className="recruit-list">
        {slots.map((recruit, index) => (
          <RecruitItem key={`${recruit.startTs}-${index}`} recruit={recruit} index={index} now={now} />
        ))}
      </ul>
    </>
  )
}
