import type { SklandActionPoint } from '../../core/skland-info'
import { computeSanity } from '../../core/status/sanity'
import { formatDuration, formatMinutesSeconds, formatRecoveryTime } from '../../utils/time'
import { MeterBar, SectionHeader, StatReadout } from '../../ui/components'
import { SanityIcon } from '../../ui/icons'
import { useNow } from '../useNow'

/** 理智区块：大号读数 + 斜角进度条 + 下一恢复/全恢复时刻（前端按时间戳实时推算） */
export default function SanitySection({ ap }: { ap: SklandActionPoint }) {
  const now = useNow(1000)
  const sanity = computeSanity(ap, now)
  const full = sanity.current >= sanity.max

  return (
    <section className="sanity-section">
      <SectionHeader title="理智" sub="Sanity" />
      <div className="sanity-body">
        <SanityIcon size={64} className="sanity-watermark" />
        <div className="sanity-main">
          <span className="sanity-icon"><SanityIcon size={22} /></span>
          <StatReadout className="sanity-value" value={sanity.current} max={sanity.max} />
          <MeterBar className="sanity-meter" value={sanity.current} max={sanity.max} />
          {full
            ? <span className="sanity-full">理智已完全恢复</span>
            : <span className="sanity-next">+1 · {formatMinutesSeconds(sanity.nextAddInMs ?? 0)}</span>}
        </div>
        <div className="sanity-sub">
          <span>全部恢复 <span className="font-bender">{full ? '—' : formatDuration((sanity.completeRecoveryAtMs ?? 0) - now)}</span></span>
          <span>预计 <span className="font-bender">{full ? '—' : formatRecoveryTime(sanity.completeRecoveryAtMs ?? 0, now)}</span></span>
        </div>
      </div>
    </section>
  )
}
