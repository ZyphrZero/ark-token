import type { SklandBindingInfo } from '../../core/skland-info'

/** 任务进度区块：剿灭作战 / 保全派驻 / 日常周常（数值语义色走 mval--* 类） */
export default function MissionSection({ info }: { info: SklandBindingInfo }) {
  return (
    <section className="mission-section">
      <div className="mission-body">
        <div className="mission-row">
          <span className="mission-label">
            <span className="mission-cn">剿灭作战</span>
            <span className="mission-en">Annihilation</span>
          </span>
          <span className="mission-values">
            <span>
              <b className="mval--red">{info.campaign?.reward?.current ?? 0}</b>
              <span className="mission-total">/{info.campaign?.reward?.total ?? 0}</span>
            </span>
          </span>
        </div>
        <div className="mission-row">
          <span className="mission-label">
            <span className="mission-cn">保全派驻</span>
            <span className="mission-en">Stationary Security Service</span>
          </span>
          <span className="mission-values">
            <span>
              <b className="mval--purple">{info.tower?.reward?.higherItem?.current ?? 0}</b>
              <span className="mission-total">/{info.tower?.reward?.higherItem?.total ?? 0}</span>
            </span>
            <span>
              <b className="mval--yellow">{info.tower?.reward?.lowerItem?.current ?? 0}</b>
              <span className="mission-total">/{info.tower?.reward?.lowerItem?.total ?? 0}</span>
            </span>
          </span>
        </div>
        <div className="mission-row">
          <span className="mission-label">
            <span className="mission-cn">日常/周常</span>
            <span className="mission-en">Routine Mission</span>
          </span>
          <span className="mission-values">
            <span>
              <b className="mval--info">{info.routine?.daily?.current ?? 0}</b>
              <span className="mission-total">/{info.routine?.daily?.total ?? 0}</span>
            </span>
            <span>
              <b className="mval--info">{info.routine?.weekly?.current ?? 0}</b>
              <span className="mission-total">/{info.routine?.weekly?.total ?? 0}</span>
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}
