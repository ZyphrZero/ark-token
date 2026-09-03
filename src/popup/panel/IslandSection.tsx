import { useState } from 'react'

import type { SklandBindingInfo } from '../../core/skland-info'
import BuildingTab from './building/BuildingTab'
import RecruitTab from './recruit/RecruitTab'
import SectionTitle from './SectionTitle'

type IslandTab = 'recruit' | 'building'

/** 罗德岛区块：公招 / 基建 两个 tab */
export default function IslandSection({ info }: { info: SklandBindingInfo }) {
  const [tab, setTab] = useState<IslandTab>('recruit')

  return (
    <section className="island-section">
      <SectionTitle title="罗德岛" sub="Rhodes Island">
        <div className="tab-pills">
          <button type="button" className={tab === 'recruit' ? 'active' : ''} onClick={() => setTab('recruit')}>
            公招
          </button>
          <button type="button" className={tab === 'building' ? 'active' : ''} onClick={() => setTab('building')}>
            基建
          </button>
        </div>
      </SectionTitle>
      <div className="tab-content">
        {tab === 'recruit' ? <RecruitTab info={info} /> : <BuildingTab info={info} />}
      </div>
    </section>
  )
}
