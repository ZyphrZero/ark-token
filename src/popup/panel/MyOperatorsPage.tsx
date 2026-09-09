import { useMemo, useRef, useState, type CSSProperties } from 'react'

import { professionKey, professionName } from '../../core/operator-data'
import type { SklandBindingInfo } from '../../core/skland-info'
import {
  buildOperatorRoster,
  DEFAULT_OPERATOR_FILTERS,
  filterOperatorRoster,
  type OperatorFilters,
  type RosterOperator
} from '../../core/status/operators'
import { CheckerMark, CheckerStripe } from '../../ui/components'
import { BackIcon, GridViewIcon, ListViewIcon, LockIcon, PortraitViewIcon, RefreshIcon, StarIcon } from '../../ui/icons'
import { professionIconUrl } from './building/professionIcons'
import './operators.css'

const PROFESSIONS = [8, 1, 3, 2, 6, 4, 5, 7]
const RARITY_COLORS: Record<number, string> = {
  6: '#ffad55',
  5: '#f4d76f',
  4: '#c5b4ea',
  3: '#78b9e8',
  2: '#b7d38b',
  1: '#c5c8ce'
}

type OperatorViewMode = 'portrait' | 'square' | 'list'

const VIEW_MODES = [
  { key: 'portrait', label: '立绘卡片', Icon: PortraitViewIcon },
  { key: 'square', label: '方形卡片', Icon: GridViewIcon },
  { key: 'list', label: '文本列表', Icon: ListViewIcon }
] as const

function OperatorCard({ operator, viewMode }: { operator: RosterOperator; viewMode: 'portrait' | 'square' }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  const imageKind = viewMode === 'square' ? 'avatar' : 'portrait'
  const portraitSrc = operator.progress?.skinId
    ? `https://web.hycdn.cn/arknights/game/assets/char_skin/${imageKind}/${encodeURIComponent(operator.progress.skinId)}.png`
    : `https://web.hycdn.cn/arknights/game/assets/char/${imageKind}/${encodeURIComponent(operator.charId)}.png`
  const profession = operator.profession === null ? '职业待收录' : professionName(operator.profession)
  const icon = professionIconUrl(operator.profession === null ? undefined : professionKey(operator.profession))
  return (
    <article
      className={`operator-card operator-card--${viewMode}${operator.progress ? '' : ' operator-card--missing'}`}
      style={{ '--rarity-color': RARITY_COLORS[operator.rarity ?? 1] } as CSSProperties}
      aria-label={`${operator.name}，${profession}，${operator.progress ? `精英 ${operator.progress.evolvePhase}，等级 ${operator.progress.level}` : '未招募'}`}
    >
      <div className="operator-card-classification">
        <span className="operator-card-profession" title={profession}>
          {icon ? <img src={icon} alt={profession} /> : '?'}
        </span>
        <span
          className="operator-card-stars"
          aria-label={operator.rarity === null ? '星级待收录' : `${operator.rarity} 星`}
        >
          {Array.from({ length: operator.rarity ?? 0 }, (_, index) => (
            <StarIcon key={index} size={9} />
          ))}
        </span>
      </div>
      <div className="operator-card-portrait">
          {failedSrc !== portraitSrc ? (
            <img
              src={portraitSrc}
              alt={operator.name}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedSrc(portraitSrc)}
            />
          ) : (
            <span className="operator-image-unavailable">图片不可用</span>
          )}
      </div>
      <div className="operator-card-caption">
        <h2 title={operator.name}>{operator.name}</h2>
        <div className="operator-card-progress">
          {operator.progress ? (
            <>
              <span className={`operator-phase operator-phase--${operator.progress.evolvePhase}`}>
                精英 {operator.progress.evolvePhase}
              </span>
              <span className="font-bender">
                <small>Lv.</small>
                {operator.progress.level}
              </span>
            </>
          ) : (
            <span className="operator-unrecruited">
              <LockIcon size={10} />
              未招募
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

function OperatorTextList({ operators }: { operators: RosterOperator[] }) {
  return (
    <table className="operators-table" aria-label="干员文本列表">
      <colgroup>
        <col />
        <col className="operators-table-profession" />
        <col className="operators-table-rarity" />
        <col className="operators-table-phase" />
        <col className="operators-table-level" />
        <col className="operators-table-status" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">干员</th>
          <th scope="col">职业</th>
          <th scope="col">星级</th>
          <th scope="col">精英化</th>
          <th scope="col">等级</th>
          <th scope="col">招募</th>
        </tr>
      </thead>
      <tbody>
        {operators.map(operator => (
          <tr key={operator.charId} style={{ '--rarity-color': RARITY_COLORS[operator.rarity ?? 1] } as CSSProperties}>
            <th scope="row" title={operator.name}>{operator.name}</th>
            <td>{operator.profession === null ? '未知' : professionName(operator.profession)}</td>
            <td className="operator-text-rarity">{operator.rarity === null ? '-' : `${operator.rarity}星`}</td>
            <td className={`operator-phase operator-phase--${operator.progress?.evolvePhase ?? 'none'}`}>
              {operator.progress ? `精英 ${operator.progress.evolvePhase}` : '-'}
            </td>
            <td className="font-bender operator-text-level">{operator.progress?.level ?? '-'}</td>
            <td className={operator.progress ? 'operator-text-owned' : 'operator-text-missing'}>
              {operator.progress ? '已招募' : '未招募'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 复用快照与本地目录；筛选计算留在 core/status/operators。 */
export default function MyOperatorsPage({ info, onBack }: { info: SklandBindingInfo; onBack: () => void }) {
  const [filters, setFilters] = useState<OperatorFilters>(DEFAULT_OPERATOR_FILTERS)
  const [viewMode, setViewMode] = useState<OperatorViewMode>('portrait')
  const [moreOpen, setMoreOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const roster = useMemo(() => (info.chars ? buildOperatorRoster(info.chars) : []), [info.chars])
  const results = useMemo(() => filterOperatorRoster(roster, filters), [roster, filters])
  const owned = useMemo(() => roster.filter((operator) => operator.progress).length, [roster])
  const counts = { all: roster.length, owned, missing: roster.length - owned }
  const activeFilters =
    filters.professions.length +
    filters.rarities.length +
    Number(filters.phase !== '') +
    Number(Boolean(filters.query.trim()))

  function updateFilters(patch: Partial<OperatorFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }))
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function toggleFilter(key: 'professions' | 'rarities', value: number) {
    updateFilters({
      [key]: filters[key].includes(value) ? filters[key].filter((item) => item !== value) : [...filters[key], value]
    })
  }

  function resetFilters() {
    updateFilters({ ...DEFAULT_OPERATOR_FILTERS, recruitment: filters.recruitment })
  }

  function changeViewMode(mode: OperatorViewMode) {
    setViewMode(mode)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  return (
    <main className="operators-page">
      <header className="operators-header">
        <button type="button" className="icon-btn" aria-label="返回状态面板" title="返回状态面板" onClick={onBack}>
          <BackIcon size={16} />
        </button>
        <h1>
          我的干员 <span>OPERATORS</span>
        </h1>
        <span className="operators-doctor" title={`Dr. ${info.status.name}`}>
          Dr. {info.status.name}
        </span>
      </header>
      <CheckerStripe />
      <div className="operators-tabs" role="tablist" aria-label="招募状态">
        {(['owned', 'missing', 'all'] as const).map((key) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={filters.recruitment === key}
            aria-controls="operator-results"
            id={`operators-tab-${key}`}
            onClick={() => updateFilters({ recruitment: key, phase: key === 'missing' ? '' : filters.phase })}
          >
            {{ owned: '已招募', missing: '未招募', all: '全部' }[key]}
            <span className="font-bender">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="operators-search-row">
        <label className="operators-search">
          <span className="operators-search-mark" aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索干员名称"
            aria-label="搜索干员名称"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
          />
        </label>
        <button
          className={`operators-more${moreOpen ? ' active' : ''}`}
          type="button"
          aria-expanded={moreOpen}
          aria-controls="operators-more-filters"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          练度<span aria-hidden="true">{moreOpen ? '−' : '+'}</span>
          {filters.phase !== '' && <i />}
        </button>
      </div>

      <div className="operators-professions" role="group" aria-label="职业筛选">
        {PROFESSIONS.map((profession) => (
          <label key={profession} className="operator-profession-option" title={professionName(profession)}>
            <input
              type="checkbox"
              aria-label={professionName(profession)}
              checked={filters.professions.includes(profession)}
              onChange={() => toggleFilter('professions', profession)}
            />
            <span>
              <img src={professionIconUrl(professionKey(profession))} alt="" />
              <span>{professionName(profession)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="operators-rarities" role="group" aria-label="星级筛选">
        <span className="operators-filter-label">星级</span>
        {[6, 5, 4, 3, 2, 1].map((rarity) => (
          <label
            key={rarity}
            className="operator-rarity-option"
            style={{ '--rarity-color': RARITY_COLORS[rarity] } as CSSProperties}
          >
            <input
              type="checkbox"
              aria-label={`${rarity} 星`}
              checked={filters.rarities.includes(rarity)}
              onChange={() => toggleFilter('rarities', rarity)}
            />
            <span>
              <b className="font-bender">{rarity}</b>
              <StarIcon size={10} />
            </span>
          </label>
        ))}
        <button
          type="button"
          className="operators-reset"
          title="清除筛选"
          aria-label="清除筛选"
          disabled={!activeFilters}
          onClick={resetFilters}
        >
          <RefreshIcon size={13} />
        </button>
      </div>
      {moreOpen && (
        <div className="operators-advanced" id="operators-more-filters">
          <label htmlFor="operator-phase">精英化</label>
          <select
            id="operator-phase"
            value={filters.phase}
            disabled={filters.recruitment === 'missing'}
            onChange={(event) => updateFilters({ phase: event.target.value as OperatorFilters['phase'] })}
          >
            <option value="">不限阶段</option>
            <option value="0">精英 0</option>
            <option value="1">精英 1</option>
            <option value="2">精英 2</option>
          </select>
        </div>
      )}
      <div className="operators-results-bar">
        <span role="status">
          共 <b className="font-bender">{results.length}</b> 名干员{activeFilters > 0 && <small> · 已筛选</small>}
        </span>
        <div className="operators-results-controls">
          <select
            aria-label="干员排序"
            value={filters.sort}
            onChange={(event) => updateFilters({ sort: event.target.value as OperatorFilters['sort'] })}
          >
            <option value="rarity">星级优先</option>
            <option value="level">练度优先</option>
            <option value="name">名称排序</option>
          </select>
          <div className="operators-view-switch" role="group" aria-label="干员显示形式">
            {VIEW_MODES.map(({ key, label, Icon }) => (
              <button
                type="button"
                key={key}
                className={viewMode === key ? 'active' : ''}
                aria-pressed={viewMode === key}
                title={label}
                aria-label={label}
                onClick={() => changeViewMode(key)}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className="operators-scroll"
        ref={scrollRef}
        id="operator-results"
        role="tabpanel"
        aria-labelledby={`operators-tab-${filters.recruitment}`}
        tabIndex={0}
      >
        {!info.chars ? (
          <div className="operators-empty">
            <h2>暂无干员数据</h2>
          </div>
        ) : results.length ? viewMode === 'list' ? (
          <OperatorTextList operators={results} />
        ) : (
          <div className="operators-grid">
            {results.map((operator) => (
              <OperatorCard key={operator.charId} operator={operator} viewMode={viewMode} />
            ))}
          </div>
        ) : (
          <div className="operators-empty">
            <CheckerMark />
            <h2>没有符合条件的干员</h2>
            {activeFilters > 0 && (
              <button type="button" className="btn btn-sm" onClick={resetFilters}>
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
