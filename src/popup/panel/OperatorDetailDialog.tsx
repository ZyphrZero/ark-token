import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  attributeName,
  currentDetailCandidate,
  formatDetailDescription,
  operatorDetailOf,
  operatorModuleDetailOf,
  operatorRangeOf,
  operatorSkillDetailOf,
  skillLevelIndex,
  skillLevelText,
  type DetailBlackboardEntry,
  type DetailCandidate
} from '../../core/operator-details'
import type { RosterOperator } from '../../core/status/operators'
import { assistEquipUrl, assistPotentialIconUrl, assistSkillUrl } from '../../core/assist/assets'
import { BackIcon, LockIcon } from '../../ui/icons'
import { SkillSpecBadge } from './skillSpec'

function DetailIcon({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return null
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}

function RangeGrid({ rangeId, label }: { rangeId?: string; label: string }) {
  const grids = operatorRangeOf(rangeId)
  const extent = useMemo(() => {
    if (!grids?.length) return null
    const rows = grids.map(grid => grid.row)
    const columns = grids.map(grid => grid.col)
    return {
      minRow: Math.min(...rows),
      minColumn: Math.min(...columns),
      rowCount: Math.max(...rows) - Math.min(...rows) + 1,
      columnCount: Math.max(...columns) - Math.min(...columns) + 1
    }
  }, [grids])

  if (!grids?.length || !extent) {
    return <span className="operator-detail-unavailable">范围数据未收录</span>
  }
  return (
    <span
      className="operator-range-grid"
      role="img"
      aria-label={label}
      style={{ '--range-columns': extent.columnCount, '--range-rows': extent.rowCount } as CSSProperties}
    >
      {grids.map(grid => (
        <i
          key={`${grid.row}-${grid.col}`}
          className={grid.row === 0 && grid.col === 0 ? 'operator-range-origin' : undefined}
          style={{ gridColumn: grid.col - extent.minColumn + 1, gridRow: grid.row - extent.minRow + 1 }}
        />
      ))}
    </span>
  )
}

function DetailText({ text, blackboard = [] }: { text: string; blackboard?: DetailBlackboardEntry[] }) {
  return <p className="operator-detail-description">{formatDetailDescription(text, blackboard)}</p>
}

function CandidateInfo({ title, candidate }: { title: string; candidate: DetailCandidate | undefined }) {
  if (!candidate) return null
  return (
    <div className="operator-detail-effect">
      <b>{candidate.name || title}</b>
      <DetailText text={candidate.description} blackboard={candidate.blackboard} />
      {candidate.rangeId && <RangeGrid rangeId={candidate.rangeId} label={`${candidate.name || title} 的范围`} />}
    </div>
  )
}

function skillTriggerText(skill: { skillType: string; spType: string | number; duration: number; spCost: number; initSp: number; maxChargeTime: number }) {
  const trigger = { MANUAL: '手动触发', AUTO: '自动触发', PASSIVE: '被动' }[skill.skillType] ?? skill.skillType
  const recoveryKey = String(skill.spType)
  const recovery = { INCREASE_WITH_TIME: '自动回复', ATTACK: '攻击回复', DEFENSE: '受击回复', PASSIVE: '被动' }[recoveryKey] ?? recoveryKey
  const parts = [trigger, recovery].filter(Boolean)
  if (skill.spCost > 0) parts.push(`${skill.initSp}/${skill.spCost} SP`)
  if (skill.maxChargeTime > 1) parts.push(`可充能 ${skill.maxChargeTime} 次`)
  if (skill.duration > 0) parts.push(`${skill.duration} 秒`)
  return parts.join(' · ')
}

function ModuleInfo({ operator }: { operator: RosterOperator }) {
  const equips = operator.progress?.equip
  if (!operator.progress) {
    return <p className="operator-detail-unavailable">尚未招募，无法显示当前模组状态</p>
  }
  if (!equips?.length) {
    return <p className="operator-detail-unavailable">当前快照没有模组</p>
  }
  return (
    <div className="operator-detail-module-list">
      {equips.map(equip => {
        const detail = operatorModuleDetailOf(equip.id)
        const phase = detail?.phases.find(item => item.level === equip.level)
        return (
          <article className={`operator-detail-module${equip.locked ? ' is-locked' : ''}`} key={equip.id}>
            <div className="operator-detail-module-heading">
              <DetailIcon src={assistEquipUrl(detail?.icon)} alt="模组图标" className="operator-detail-module-icon" />
              <b>{detail?.name ?? equip.id}</b>
              {equip.locked ? <span><LockIcon size={11} /> 未开启</span> : <span>等级 {equip.level}</span>}
            </div>
            {!equip.locked && phase && (
              <>
                {phase.attributes.length > 0 && (
                  <p className="operator-detail-module-attributes">
                    {phase.attributes.map(attribute => `${attributeName(attribute.key)} ${attribute.value >= 0 ? '+' : ''}${attribute.value}`).join(' · ')}
                  </p>
                )}
                {phase.effects.map((effect, index) => (
                  <CandidateInfo key={`${effect.name}-${index}`} title="模组效果" candidate={effect} />
                ))}
              </>
            )}
            {!equip.locked && !phase && <p className="operator-detail-unavailable">该模组等级效果未收录</p>}
          </article>
        )
      })}
    </div>
  )
}

export default function OperatorDetailDialog({ operator, onClose }: { operator: RosterOperator; onClose: () => void }) {
  const detail = operatorDetailOf(operator.charId)
  const progress = operator.progress
  const potentialRank = progress?.potentialRank
  const skillEntries = progress?.skills?.length
    ? progress.skills.map(skill => ({ id: skill.id, specializeLevel: skill.specializeLevel }))
    : detail?.skillIds.map(id => ({ id, specializeLevel: 0 })) ?? []

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const portraitSrc = progress?.skinId
    ? `https://web.hycdn.cn/arknights/game/assets/char_skin/avatar/${encodeURIComponent(progress.skinId)}.png`
    : `https://web.hycdn.cn/arknights/game/assets/char/avatar/${encodeURIComponent(operator.charId)}.png`
  const baseRange = detail?.phases[progress?.evolvePhase ?? 0]?.rangeId
  const currentTraits = detail?.trait ? currentDetailCandidate(detail.trait, progress?.evolvePhase, potentialRank) : undefined
  const currentTalents = detail?.talents.map(talent => currentDetailCandidate(talent, progress?.evolvePhase, potentialRank)).filter(Boolean) ?? []
  const potentialEffects = potentialRank === undefined ? [] : detail?.potentialEffects.slice(0, potentialRank) ?? []

  return (
    <div className="operator-detail-backdrop" onClick={onClose}>
      <section className="operator-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="operator-detail-title" onClick={event => event.stopPropagation()}>
        <header className="operator-detail-header">
          <button type="button" className="icon-btn" title="关闭干员详情" aria-label="关闭干员详情" onClick={onClose}>
            <BackIcon size={17} />
          </button>
          <img src={portraitSrc} alt="" className="operator-detail-avatar" referrerPolicy="no-referrer" />
          <div>
            <h2 id="operator-detail-title">{operator.name}</h2>
            <span>{progress ? `精英 ${progress.evolvePhase} · Lv.${progress.level}` : '未招募'}</span>
          </div>
          {potentialRank !== undefined && (
            <span className="operator-detail-potential" title={`潜能 ${potentialRank + 1}`}>
              <DetailIcon src={assistPotentialIconUrl(potentialRank)} alt="潜能" />
              <b>{potentialRank + 1}</b>
            </span>
          )}
        </header>

        {!detail ? (
          <p className="operator-detail-unavailable">该干员的战斗详情数据尚未收录</p>
        ) : (
          <div className="operator-detail-scroll">
            <section className="operator-detail-section">
              <h3>干员情报</h3>
              <DetailText text={detail.description} />
              <div className="operator-detail-tags">
                {detail.position && <span>{detail.position === 'MELEE' ? '近战位' : detail.position === 'RANGED' ? '远程位' : detail.position}</span>}
                {detail.tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>
              <CandidateInfo title="特性" candidate={currentTraits} />
              {currentTalents.map((talent, index) => <CandidateInfo key={`${talent?.name}-${index}`} title={`天赋 ${index + 1}`} candidate={talent} />)}
            </section>

            <section className="operator-detail-section operator-detail-range-section">
              <h3>攻击范围</h3>
              <RangeGrid rangeId={baseRange} label={`${operator.name} 当前攻击范围`} />
            </section>

            <section className="operator-detail-section">
              <h3>潜能</h3>
              {potentialRank === undefined ? <p className="operator-detail-unavailable">当前快照未提供潜能数据</p> : (
                <>
                  <p className="operator-detail-current-value">当前潜能 {potentialRank + 1}</p>
                  {potentialEffects.map((effect, index) => <p key={index} className="operator-detail-potential-effect">潜能 {index + 2}：{formatDetailDescription(effect, [])}</p>)}
                </>
              )}
            </section>

            <section className="operator-detail-section">
              <h3>技能</h3>
              {skillEntries.map((entry, index) => {
                const skill = operatorSkillDetailOf(entry.id)
                const level = skill?.levels[skillLevelIndex(progress?.mainSkillLvl, entry.specializeLevel)]
                return (
                  <article className="operator-detail-skill" key={entry.id}>
                    <div className="operator-detail-skill-heading">
                      <span className="operator-detail-skill-icon-wrap">
                        <DetailIcon src={assistSkillUrl(entry.id)} alt="技能图标" className="operator-detail-skill-icon" />
                        <SkillSpecBadge level={entry.specializeLevel} className="operator-detail-skill-spec" />
                      </span>
                      <div>
                        <b>{level?.name ?? `技能 ${index + 1}`}</b>
                        <span>{progress ? skillLevelText(progress.mainSkillLvl, entry.specializeLevel) : '未招募'}</span>
                      </div>
                    </div>
                    {level ? (
                      <>
                        <p className="operator-detail-skill-meta">{skillTriggerText(level)}</p>
                        <DetailText text={level.description} blackboard={level.blackboard} />
                        {level.rangeId && <RangeGrid rangeId={level.rangeId} label={`${level.name} 的范围`} />}
                      </>
                    ) : <p className="operator-detail-unavailable">该技能效果数据未收录</p>}
                  </article>
                )
              })}
            </section>

            <section className="operator-detail-section">
              <h3>模组</h3>
              <ModuleInfo operator={operator} />
            </section>
          </div>
        )}
      </section>
    </div>
  )
}
