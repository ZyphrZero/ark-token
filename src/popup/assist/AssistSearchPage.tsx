import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import type {
  AssistCharacter,
  AssistCharacterResult,
  AssistInfo,
  AssistSearchPlayer,
  AssistSearchRequest,
  AssistSearchResult,
  AssistUserInfo
} from '../../core/sklandAssist'
import type { GameAccount } from '../../core/types'
import {
  sendAddFriendMessage,
  sendAssistInfoMessage,
  sendAssistUserInfoMessage,
  sendSearchAssistMessage
} from '../panelActions'
import { assistAvatarUrl, assistCharacterUrl, assistEquipUrl, assistSkillUrl } from './assets'

const PROFESSION_NAMES: Record<string, string> = {
  WARRIOR: '近卫',
  SNIPER: '狙击',
  TANK: '重装',
  MEDIC: '医疗',
  CASTER: '术师',
  SUPPORT: '辅助',
  PIONEER: '先锋',
  SPECIAL: '特种'
}

type Feedback = { kind: 'ok' | 'err'; text: string }

type SearchValues = {
  charId: string
  evolvePhase: string
  level: string
  skillId: string
  skillLevel: string
  equipId: string
  equipLevel: string
}

const INITIAL_SEARCH: SearchValues = {
  charId: '',
  evolvePhase: '',
  level: '',
  skillId: '',
  skillLevel: '0',
  equipId: '',
  equipLevel: '0'
}

function optionLabel(character: AssistCharacter): string {
  return `${character.name} · ${'★'.repeat(character.rarity + 1)} · ${PROFESSION_NAMES[character.profession] ?? character.profession}`
}

function levelOptions(info: AssistInfo | null, character: AssistCharacter | undefined): { phase: number; level: number; label: string }[] {
  if (!info || !character) {
    return []
  }
  return info.levelMax
    .filter(item => item.rarity === character.rarity)
    .map(item => ({
      phase: item.evolvePhase,
      level: item.maxLevel,
      label: item.evolvePhase === 0 ? `精英化 0（最高 ${item.maxLevel}）` : `精英化 ${item.evolvePhase}（最高 ${item.maxLevel}）`
    }))
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

function AssistOperator({ operator, character }: { operator: AssistCharacterResult | undefined; character?: AssistCharacter }) {
  if (!operator) {
    return <div className="assist-operator assist-operator-empty">暂无助战</div>
  }
  return (
    <div className="assist-operator">
      <ImageWithFallback
        className="assist-operator-art"
        src={assistCharacterUrl(operator.charId, operator.skinId)}
        alt={character?.name ?? operator.charId}
      />
      <div className="assist-operator-meta">
        <strong>{character?.name ?? operator.charId}</strong>
        <span>精英化 {operator.evolvePhase} · Lv.{operator.level}</span>
        <span>{'★'.repeat(operator.rarity + 1)} · 潜能 {operator.potentialRank + 1}</span>
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
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [friendStates, setFriendStates] = useState<Record<string, { busy: boolean; feedback?: Feedback }>>({})

  const characters = useMemo(() => new Map((info?.characters ?? []).map(character => [character.id, character])), [info])
  const selectedCharacter = search.charId ? characters.get(search.charId) : undefined
  const availableLevels = levelOptions(info, selectedCharacter)
  const maxLevel = availableLevels.find(item => item.phase === Number(search.evolvePhase))?.level ?? 0

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
    if (key === 'charId') {
      setSearch(previous => ({ ...previous, charId: value, evolvePhase: '', level: '', skillId: '', skillLevel: '0', equipId: '', equipLevel: '0' }))
      return
    }
    setSearch(previous => ({ ...previous, [key]: value }))
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
      const request: Omit<AssistSearchRequest, 'uid'> = {
        charId: search.charId,
        level: { evolvePhase: Number(search.evolvePhase || 0), level: Number(search.level || 0) },
        skill: { id: search.skillId, level: Number(search.skillLevel || 0) },
        equip: { id: search.equipId, level: Number(search.equipLevel || 0) }
      }
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
          <div className="assist-empty"><div className="message err">当前账号尚未完成明日方舟身份认证，暂时无法检索助战。</div></div>
        ) : (
          <>
            <div className="assist-identity">检索账号：{userInfo.gameNickname || account.nickName} · UID {account.uid}</div>
            <form className="assist-filter" onSubmit={event => void handleSearch(event)}>
              <div className="assist-filter-title">筛选条件</div>
              <label className="assist-field">干员
                <select value={search.charId} onChange={event => updateSearch('charId', event.target.value)}>
                  <option value="">选择干员</option>
                  {info?.characters.map(character => <option key={character.id} value={character.id}>{optionLabel(character)}</option>)}
                </select>
              </label>
              <div className="assist-filter-grid">
                <label className="assist-field">精英化
                  <select value={search.evolvePhase} onChange={event => updateSearch('evolvePhase', event.target.value)} disabled={!selectedCharacter}>
                    <option value="">不限</option>
                    {availableLevels.map(item => <option key={item.phase} value={item.phase}>{item.label}</option>)}
                  </select>
                </label>
                <label className="assist-field">等级
                  <select value={search.level} onChange={event => updateSearch('level', event.target.value)} disabled={!selectedCharacter || !search.evolvePhase}>
                    <option value="">不限</option>
                    {maxLevel > 0 && Array.from({ length: maxLevel }, (_, index) => <option key={index + 1} value={index + 1}>Lv.{index + 1}</option>)}
                  </select>
                </label>
              </div>
              <label className="assist-field">技能
                <select value={search.skillId} onChange={event => updateSearch('skillId', event.target.value)} disabled={!selectedCharacter}>
                  <option value="">不限技能</option>
                  {(selectedCharacter?.skills ?? []).map((skill, index) => <option key={skill.id} value={skill.id}>技能 {index + 1} · {skill.name ?? skill.id}</option>)}
                </select>
              </label>
              <label className="assist-field">技能等级
                <select value={search.skillLevel} onChange={event => updateSearch('skillLevel', event.target.value)} disabled={!search.skillId}>
                  {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{index === 0 ? '不限' : `至少 ${index} 级`}</option>)}
                </select>
              </label>
              <label className="assist-field">模组
                <select value={search.equipId} onChange={event => updateSearch('equipId', event.target.value)} disabled={!selectedCharacter}>
                  <option value="">不限模组</option>
                  {(selectedCharacter?.equips ?? []).map(equip => <option key={equip.id} value={equip.id}>{equip.name ?? equip.id}</option>)}
                </select>
              </label>
              <label className="assist-field">模组等级
                <select value={search.equipLevel} onChange={event => updateSearch('equipLevel', event.target.value)} disabled={!search.equipId}>
                {Array.from({ length: 4 }, (_, index) => <option key={index} value={index}>{index === 0 ? '不限' : `至少 ${index} 级`}</option>)}
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
