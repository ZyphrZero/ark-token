import sanityBolt from '../assets/icons/sanity.svg'
import type { SklandActionPoint } from '../../core/skland-info'
import { computeSanity } from '../../core/status/sanity'
import { formatDuration, formatMinutesSeconds, formatRecoveryTime } from '../../utils/time'
import { useNow } from '../useNow'
import SectionTitle from './SectionTitle'

/** 理智区块：当前/上限 + 下一恢复倒计时 + 全恢复时长与时刻（前端按时间戳实时推算） */
export default function SanitySection({ ap }: { ap: SklandActionPoint }) {
  const now = useNow(1000)
  const sanity = computeSanity(ap, now)
  const full = sanity.current >= sanity.max

  return (
    <section className="sanity-section">
      <SectionTitle title="理智" sub="Sanity" />
      <div className="sanity-body">
        <img className="sanity-bolt" src={sanityBolt} alt="" />
        <div className="sanity-row">
          <span className="sanity-value font-bender">{sanity.current}/{sanity.max}</span>
          {full
            ? <span className="sanity-full">理智已完全恢复!</span>
            : <span>下次恢复：{formatMinutesSeconds(sanity.nextAddInMs ?? 0)}</span>}
        </div>
        <div className="sanity-row">
          <span>全部恢复需要:</span>
          <span>{full ? '-' : formatDuration((sanity.completeRecoveryAtMs ?? 0) - now)}</span>
        </div>
        <div className="sanity-row">
          <span>预计恢复时间:</span>
          <span>{full ? '-' : formatRecoveryTime(sanity.completeRecoveryAtMs ?? 0, now)}</span>
        </div>
      </div>
    </section>
  )
}
