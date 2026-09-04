import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  applyEvolvePhaseChange,
  assistAvatarUrl,
  assistCharacterUrl,
  assistEquipUrl,
  assistEvolvePhaseIconUrl,
  assistPotentialIconUrl,
  assistProfessionIconUrl,
  assistSkillUrl,
  buildAssistSearchRequest,
  createDefaultFilter,
  EQUIP_BADGE_ID,
  filterAssistCharacters,
  getEquipLevelOptions,
  getEquipOptions,
  getEvolvePhaseOptions,
  getLevelRequirementOptions,
  getSkillRequirementOptions,
  getSkillSlotOptions,
  matchesNameQuery,
  PROFESSION_NAMES,
  PROFESSION_ORDER,
  type AssistCharacter,
  type AssistCharacterResult,
  type AssistFilter,
  type AssistInfo,
  type AssistSearchPlayer,
  type AssistSearchResult,
  type AssistUserInfo
} from '../../core/assist'
import type { GameAccount } from '../../core/types'
import {
  sendAddFriendMessage,
  sendAssistAuthorizeMessage,
  sendAssistInfoMessage,
  sendAssistUserInfoMessage,
  sendSearchAssistMessage
} from '../panelActions'

type Feedback = { kind: 'ok' | 'err'; text: string }

type SearchValues = {
  /** 干员职业筛选（空 = 不限） */
  profession: string
  /** 干员稀有度筛选，存 0-based rarity（空 = 不限） */
  rarity: string
  /** 干员名称模糊搜索（空 = 不筛） */
  nameQuery: string
  charId: string
  evolvePhase: string
  /** 等级需求模式：0=不限、1=所选精英化满级、2=精二 ≥N 级 */
  level: string
  skillId: string
  skillLevel: string
  equipId: string
  equipLevel: string
}

const INITIAL_SEARCH: SearchValues = {
  profession: '',
  rarity: '',
  nameQuery: '',
  charId: '',
  evolvePhase: '',
  level: '0',
  skillId: '',
  skillLevel: '0',
  equipId: '',
  equipLevel: '0'
}

/** 表单字符串状态 → core 数值形态筛选 */
function toAssistFilter(values: SearchValues): AssistFilter {
  return {
    charId: values.charId,
    evolvePhase: Number(values.evolvePhase || 0),
    level: Number(values.level || 0),
    skillId: values.skillId,
    skillLevel: Number(values.skillLevel || 0),
    equipId: values.equipId,
    equipLevel: Number(values.equipLevel || 0)
  }
}

/** core 数值形态筛选 → 表单字符串状态（保留 profession/rarity/nameQuery 等列表筛选项） */
function toFormValues(filter: AssistFilter, previous: SearchValues): SearchValues {
  return {
    ...previous,
    charId: filter.charId,
    evolvePhase: String(filter.evolvePhase),
    level: String(filter.level),
    skillId: filter.skillId,
    skillLevel: String(filter.skillLevel),
    equipId: filter.equipId,
    equipLevel: String(filter.equipLevel)
  }
}

function optionLabel(character: AssistCharacter): string {
  const profession = PROFESSION_NAMES[character.profession] ?? character.profession
  return character.isNew ? `${character.name} · ${profession} · NEW` : `${character.name} · ${profession}`
}

function evolvePhaseLabel(phase: number, maxLevel: number): string {
  return phase === 0 ? `精英化 0（最高 ${maxLevel}）` : `精英化 ${phase}（最高 ${maxLevel}）`
}

function formatLastOnline(value: string): string {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '在线时间未知'
  }
  return `最后在线 ${new Date(timestamp * 1000).toLocaleString()}`
}

function ImageWithFallback({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <span className={`${className} assist-image-placeholder`} aria-label={alt}>{alt.slice(0, 1)}</span>
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}

/** 装饰性小图标（职业/潜能/精英化），加载失败时直接隐藏，不显示占位 */
function IconImg({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return null
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}

function AssistOperator({ operator, character }: { operator: AssistCharacterResult | undefined; character?: AssistCharacter }) {
  if (!operator) {
    return <div className="assist-operator assist-operator-empty">暂无助战</div>
  }
  return (
    <div className="assist-operator">
      <div className="assist-operator-figure">
        <ImageWithFallback
          className="assist-operator-art"
          src={assistCharacterUrl(operator.charId, operator.skinId)}
          alt={character?.name ?? operator.charId}
        />
        <IconImg
          className="assist-operator-profession"
          src={assistProfessionIconUrl(operator.profession)}
          alt={PROFESSION_NAMES[operator.profession] ?? operator.profession}
        />
      </div>
      <div className="assist-operator-meta">
        <strong>{character?.name ?? operator.charId}</strong>
        <span>
          <IconImg className="assist-icon-inline" src={assistEvolvePhaseIconUrl(operator.evolvePhase)} alt="精英化" />
          精英化 {operator.evolvePhase} · Lv.{operator.level}
        </span>
        <span>
          {'★'.repeat(operator.rarity + 1)} · <IconImg className="assist-icon-inline" src={assistPotentialIconUrl(operator.potentialRank)} alt="潜能" /> {operator.potentialRank + 1}
        </span>
      </div>
      <div className="assist-operator-icons">
        {operator.skillId && (
          <span className="assist-icon-stack" title={`技能等级 ${operator.mainSkillLvl}`}>
            <ImageWithFallback className="assist-skill-icon" src={assistSkillUrl(operator.skillId)} alt="技能" />
            <small>技{operator.mainSkillLvl}</small>
          </span>
        )}
        {operator.equip && (
          <span className="assist-icon-stack" title={`模组等级 ${operator.specializeLevel}`}>
            <ImageWithFallback className="assist-equip-icon" src={assistEquipUrl(operator.equip.typeName)} alt="模组" />
            <small>模{operator.specializeLevel}</small>
          </span>
        )}
      </div>
    </div>
  )
}

function AssistResultCard({
  player,
  characters,
  onAddFriend,
  friendState
}: {
  player: AssistSearchPlayer
  characters: Map<string, AssistCharacter>
  onAddFriend: (uid: string) => void
  friendState?: { busy: boolean; feedback?: Feedback }
}) {
  const avatar = player.avatar?.url ?? assistAvatarUrl(player.avatar?.id)
  return (
    <article className="assist-result-card">
      <div className="assist-player-header">
        <ImageWithFallback className="assist-player-avatar" src={avatar} alt="玩家头像" />
        <div className="assist-player-meta">
          <strong>{player.name || '未命名博士'}</strong>
          <span>Lv.{player.level} · UID {player.uid}</span>
          <span>{formatLastOnline(player.lastOnlineTs)} · {player.gameDetailOn ? '详情公开' : '详情未公开'}</span>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={player.hasSend || friendState?.busy}
          onClick={() => onAddFriend(player.uid)}
        >
          {player.hasSend ? '已申请' : friendState?.busy ? '发送中…' : '添加好友'}
        </button>
      </div>
      <div className="assist-operators">
        {player.assistChars.map((operator, index) => (
          <AssistOperator key={`${player.uid}-${operator?.charId ?? index}`} operator={operator} character={operator ? characters.get(operator.charId) : undefined} />
        ))}
      </div>
      {friendState?.feedback && <div className={`message ${friendState.feedback.kind}`}>{friendState.feedback.text}</div>}
    </article>
  )
}

export default function AssistSearchPage({ account, onBack }: { account: GameAccount; onBack: () => void }) {
  const [info, setInfo] = useState<AssistInfo | null>(null)
  const [userInfo, setUserInfo] = useState<AssistUserInfo | null>(null)
  const [search, setSearch] = useState<SearchValues>(INITIAL_SEARCH)
  const [results, setResults] = useState<AssistSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [authFeedback, setAuthFeedback] = useState<Feedback | null>(null)
  const [friendStates, setFriendStates] = useState<Record<string, { busy: boolean; feedback?: Feedback }>>({})

  const characters = useMemo(() => new Map((info?.characters ?? []).map(character => [character.id, character])), [info])
  const selectedCharacter = search.charId ? characters.get(search.charId) : undefined
  const visibleCharacters = filterAssistCharacters(info?.characters ?? [], {
    profession: search.profession || undefined,
    rarity: search.rarity ? Number(search.rarity) : undefined,
    nameQuery: search.nameQuery
  })
  const newCharacters = visibleCharacters.filter(character => character.isNew)
  const restCharacters = visibleCharacters.filter(character => !character.isNew)
  const characterGroups: { key: string; label: string; list: AssistCharacter[] }[] = [
    ...(newCharacters.length > 0 ? [{ key: 'new', label: `新干员 · ${newCharacters.length}`, list: newCharacters }] : []),
    ...[5, 4, 3, 2, 1, 0].flatMap(rarity => {
      const list = restCharacters.filter(character => character.rarity === rarity)
      return list.length > 0 ? [{ key: `rarity-${rarity}`, label: `${'★'.repeat(rarity + 1)} · ${list.length}`, list }] : []
    })
  ]
  const availableLevels = getEvolvePhaseOptions(info, selectedCharacter)
  const { maxLevel: selectedPhaseMaxLevel, e2MinLevel } = getLevelRequirementOptions(info, selectedCharacter, Number(search.evolvePhase))
  const skillOptions = getSkillSlotOptions(selectedCharacter, Number(search.evolvePhase))
  const skillLevelOptions = getSkillRequirementOptions(Number(search.evolvePhase))
  const equipOptions = getEquipOptions(selectedCharacter)
  const equipSelectable = Number(search.evolvePhase) === 2 && equipOptions.length > 0
  const equipLevelOptions = getEquipLevelOptions(search.equipId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setInfo(null)
    setUserInfo(null)
    setResults(null)
    setFriendStates({})
    setSearch(INITIAL_SEARCH)
    try {
      const [infoResponse, userResponse] = await Promise.all([
        sendAssistInfoMessage(account.id),
        sendAssistUserInfoMessage(account.id)
      ])
      if (!infoResponse.ok || !infoResponse.data) {
        throw new Error(infoResponse.message ?? '助战配置加载失败')
      }
      if (!userResponse.ok || !userResponse.data) {
        throw new Error(userResponse.message ?? '当前账号身份加载失败')
      }
      setInfo(infoResponse.data)
      setUserInfo(userResponse.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [account.id])

  useEffect(() => {
    void load()
  }, [load])

  function updateSearch<K extends keyof SearchValues>(key: K, value: SearchValues[K]) {
    if (key === 'profession' || key === 'rarity' || key === 'nameQuery') {
      // 已选干员不符合新筛选条件时清空干员及其级联条件
      setSearch(previous => {
        const profession = key === 'profession' ? value : previous.profession
        const rarity = key === 'rarity' ? value : previous.rarity
        const nameQuery = key === 'nameQuery' ? value : previous.nameQuery
        const current = previous.charId ? characters.get(previous.charId) : undefined
        const stillVisible = current !== undefined
          && (!profession || current.profession === profession)
          && (!rarity || current.rarity === Number(rarity))
          && matchesNameQuery(current, nameQuery)
        if (stillVisible) {
          return { ...previous, [key]: value }
        }
        return { ...previous, [key]: value, charId: '', evolvePhase: '', level: '0', skillId: '', skillLevel: '0', equipId: '', equipLevel: '0' }
      })
      return
    }
    if (key === 'charId') {
      // 官方 select() 默认值：最高精英化 + 等级不限、第一个技能 + 需求不限、证章 + 0
      setSearch(previous => toFormValues(createDefaultFilter(info, value ? characters.get(value) : undefined), previous))
      return
    }
    if (key === 'evolvePhase') {
      // 官方 setFilter 级联：等级重置不限；技能位截断与需求降档；非精二移除模组，精二无选择时恢复证章
      setSearch(previous => toFormValues(
        applyEvolvePhaseChange(toAssistFilter(previous), info, previous.charId ? characters.get(previous.charId) : undefined, Number(value)),
        previous
      ))
      return
    }
    if (key === 'equipId') {
      // 官方切换模组规则：真实模组等级重置为 1，证章重置为 0（不限）
      setSearch(previous => ({ ...previous, equipId: value, equipLevel: value === EQUIP_BADGE_ID ? '0' : '1' }))
      return
    }
    setSearch(previous => ({ ...previous, [key]: value }))
  }

  async function handleAuthorize() {
    setAuthorizing(true)
    setAuthFeedback(null)
    try {
      const response = await sendAssistAuthorizeMessage(account.id)
      if (!response.ok) {
        throw new Error(response.message ?? '授权失败')
      }
      setAuthFeedback({ kind: 'ok', text: '授权成功，正在刷新助战身份…' })
      await load()
    } catch (authError) {
      setAuthFeedback({ kind: 'err', text: authError instanceof Error ? authError.message : String(authError) })
    } finally {
      setAuthorizing(false)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!search.charId) {
      setFeedback({ kind: 'err', text: '请先选择要检索的干员' })
      return
    }
    setSearching(true)
    setFeedback(null)
    setResults(null)
    try {
      const request = buildAssistSearchRequest(toAssistFilter(search), account.uid)
      const response = await sendSearchAssistMessage(account.id, request)
      if (!response.ok || !response.data) {
        throw new Error(response.message ?? '助战检索失败')
      }
      setResults(response.data)
    } catch (searchError) {
      setFeedback({ kind: 'err', text: searchError instanceof Error ? searchError.message : String(searchError) })
    } finally {
      setSearching(false)
    }
  }

  async function handleAddFriend(targetUid: string) {
    setFriendStates(previous => ({ ...previous, [targetUid]: { busy: true } }))
    try {
      const response = await sendAddFriendMessage(account.id, targetUid)
      setFriendStates(previous => ({
        ...previous,
        [targetUid]: { busy: false, feedback: response.ok ? { kind: 'ok', text: response.message ?? '好友申请已发送' } : { kind: 'err', text: response.message ?? '好友申请失败' } }
      }))
      if (response.ok) {
        setResults(previous => previous ? { list: previous.list.map(player => player.uid === targetUid ? { ...player, hasSend: true } : player) } : previous)
      }
    } catch (friendError) {
      setFriendStates(previous => ({ ...previous, [targetUid]: { busy: false, feedback: { kind: 'err', text: friendError instanceof Error ? friendError.message : String(friendError) } } }))
    }
  }

  return (
    <div className="assist-page">
      <header className="assist-page-header">
        <button type="button" className="icon-btn" title="返回状态面板" onClick={onBack}>‹</button>
        <div>
          <h2>助战检索</h2>
          <span>SUPPORT SEARCH</span>
        </div>
        <span className="assist-account-label">{account.nickName || '未命名博士'}</span>
      </header>
      <main className="assist-page-scroll">
        {loading ? <div className="assist-empty">正在加载助战配置…</div> : error ? (
          <div className="assist-empty">
            <div className="message err">{error}</div>
            <button type="button" className="btn btn-sm" onClick={() => void load()}>重新加载</button>
          </div>
        ) : !userInfo?.isAuth ? (
          <div className="assist-empty">
            <div className="message err">
              当前账号未开启明日方舟「游戏关系」公开（即官方助战页的身份认证），暂时无法检索助战。
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={authorizing}
              onClick={() => void handleAuthorize()}
            >
              {authorizing ? '授权中…' : '开启游戏关系并继续'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void load()}>重新检查</button>
            {authFeedback && <div className={`message ${authFeedback.kind}`}>{authFeedback.text}</div>}
          </div>
        ) : (
          <>
            <div className="assist-identity">检索账号：{userInfo.gameNickname || account.nickName} · UID {account.uid}</div>
            <form className="assist-filter" onSubmit={event => void handleSearch(event)}>
              <div className="assist-filter-title">筛选条件</div>
              <div className="assist-filter-grid">
                <label className="assist-field">职业
                  <select value={search.profession} onChange={event => updateSearch('profession', event.target.value)}>
                    <option value="">不限职业</option>
                    {PROFESSION_ORDER.map(profession => (
                      <option key={profession} value={profession}>{PROFESSION_NAMES[profession]}</option>
                    ))}
                  </select>
                </label>
                <label className="assist-field">稀有度
                  <select value={search.rarity} onChange={event => updateSearch('rarity', event.target.value)}>
                    <option value="">不限稀有度</option>
                    {[5, 4, 3, 2, 1, 0].map(rarity => (
                      <option key={rarity} value={rarity}>{'★'.repeat(rarity + 1)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="assist-field">干员搜索
                <input
                  type="text"
                  value={search.nameQuery}
                  placeholder="输入干员名模糊筛选"
                  onChange={event => updateSearch('nameQuery', event.target.value)}
                />
              </label>
              <label className="assist-field assist-field-required">干员
                <select value={search.charId} onChange={event => updateSearch('charId', event.target.value)}>
                  <option value="">
                    {search.profession || search.rarity || search.nameQuery.trim()
                      ? visibleCharacters.length > 0 ? `选择干员（${visibleCharacters.length}）` : '无匹配干员'
                      : '选择干员'}
                  </option>
                  {characterGroups.map(group => (
                    <optgroup key={group.key} label={group.label}>
                      {group.list.map(character => <option key={character.id} value={character.id}>{optionLabel(character)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="assist-filter-grid">
                <label className="assist-field assist-field-required">精英化
                  <select value={search.evolvePhase} onChange={event => updateSearch('evolvePhase', event.target.value)} disabled={!selectedCharacter}>
                    {!search.evolvePhase && <option value="">请先选择干员</option>}
                    {availableLevels.map(item => <option key={item.phase} value={item.phase}>{evolvePhaseLabel(item.phase, item.maxLevel)}</option>)}
                  </select>
                </label>
                <label className="assist-field assist-field-required">等级需求
                  <select value={search.level} onChange={event => updateSearch('level', event.target.value)} disabled={!search.evolvePhase}>
                    <option value="0">不限</option>
                    {e2MinLevel !== null && <option value="2">≥{e2MinLevel}级</option>}
                    {selectedPhaseMaxLevel > 0 && <option value="1">{selectedPhaseMaxLevel}级</option>}
                  </select>
                </label>
              </div>
              <label className="assist-field assist-field-required">技能
                <select value={search.skillId} onChange={event => updateSearch('skillId', event.target.value)} disabled={!selectedCharacter || skillOptions.length === 0}>
                  {!search.skillId && <option value="">{selectedCharacter ? '无技能' : '请先选择干员'}</option>}
                  {skillOptions.map((skill, index) => <option key={skill.id} value={skill.id}>技能 {index + 1} · {skill.name ?? skill.id}</option>)}
                </select>
              </label>
              <label className="assist-field assist-field-required">技能需求
                <select value={search.skillLevel} onChange={event => updateSearch('skillLevel', event.target.value)} disabled={skillOptions.length === 0}>
                  {/* 官方页面取值映射：0=不限、1=RANK 7、2~4=专精 1~3；档位随精英化收窄 */}
                  {skillLevelOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="assist-field assist-field-required">模组
                <select value={search.equipId} onChange={event => updateSearch('equipId', event.target.value)} disabled={!equipSelectable}>
                  {!search.equipId && <option value="">无模组</option>}
                  {equipOptions.map(equip => <option key={equip.id} value={equip.id}>{equip.name ?? equip.id}</option>)}
                </select>
              </label>
              <label className="assist-field assist-field-required">模组等级
                <select value={search.equipLevel} onChange={event => updateSearch('equipLevel', event.target.value)} disabled={!search.equipId}>
                  {!search.equipId && <option value="">—</option>}
                  {equipLevelOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button type="submit" className="btn btn-primary assist-search-button" disabled={searching || !search.charId}>{searching ? '检索中…' : '检索助战'}</button>
              {feedback && <div className={`message ${feedback.kind}`}>{feedback.text}</div>}
            </form>
            {results && <div className="assist-results-heading">检索结果：{results.list.length} 位博士</div>}
            {results?.list.map(player => <AssistResultCard key={player.uid} player={player} characters={characters} onAddFriend={uid => void handleAddFriend(uid)} friendState={friendStates[player.uid]} />)}
            {results && results.list.length === 0 && <div className="assist-empty">没有找到符合条件的助战博士</div>}
          </>
        )}
      </main>
    </div>
  )
}
