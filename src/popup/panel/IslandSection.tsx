import { useState } from 'react'

import type { SklandBindingInfo } from '../../core/skland-info'
import { computeDroneCount, droneSpeedBonusPercent } from '../../core/status/building'
import { SectionHeader, SegmentedTabs, StatReadout } from '../../ui/components'
import { DroneIcon } from '../../ui/icons'
import BuildingTab from './building/BuildingTab'
import RecruitTab from './recruit/RecruitTab'
import { useNow } from '../useNow'

type IslandTab = 'recruit' | 'building'

const TABS: { key: IslandTab; label: string }[] = [
  { key: 'recruit', label: '公招' },
  { key: 'building', label: '基建' }
]

/**
 * 罗德岛区块：标题右侧常驻无人机实时读数（两个 tab 共享），
 * 下方分段式 Tabs 切换 公招 / 基建。
 */
export default function IslandSection({ info }: { info: SklandBindingInfo }) {
  const [tab, setTab] = useState<IslandTab>('recruit')
  const now = useNow(1000)
  const labor = info.building?.labor
  const drone = labor ? computeDroneCount(labor, now) : null
  // 充能速度加成（中枢进驻技能），快照无法推导（已满）时不显示
  const droneBonus = labor ? droneSpeedBonusPercent(labor) : null

  return (
    <section className="island-section">
      <SectionHeader title="罗德岛" sub="Rhodes Island">
        {labor && drone !== null && (
          <span className="drone-chip" title="无人机（含控制中枢充能加成）">
            <DroneIcon size={14} />
            <StatReadout value={drone} max={labor.maxValue} />
            {droneBonus !== null && <i className="drone-bonus">+{droneBonus}%</i>}
          </span>
        )}
      </SectionHeader>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="tab-content">
        <div className="tab-pane" key={tab}>
          {tab === 'recruit' ? <RecruitTab info={info} /> : <BuildingTab info={info} />}
        </div>
      </div>
    </section>
  )
}
