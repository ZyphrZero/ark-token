import { operatorData, type OperatorEntry } from '../operator-data'
import type { SklandPanelCharacter } from '../skland-info'

export interface RosterOperator {
  charId: string
  name: string
  rarity: number | null
  profession: number | null
  progress?: SklandPanelCharacter
}

export interface OperatorFilters {
  recruitment: 'all' | 'owned' | 'missing'
  query: string
  professions: number[]
  rarities: number[]
  phase: '' | '0' | '1' | '2'
  sort: 'rarity' | 'level' | 'name'
}

export const DEFAULT_OPERATOR_FILTERS: OperatorFilters = {
  recruitment: 'owned',
  query: '',
  professions: [],
  rarities: [],
  phase: '',
  sort: 'rarity'
}

/** 本地目录与快照按 charId 合并；保留目录尚未收录的已招募干员。 */
export function buildOperatorRoster(
  characters: readonly SklandPanelCharacter[],
  catalog: Record<string, OperatorEntry> = operatorData.operators
): RosterOperator[] {
  const owned = new Map(characters.map((character) => [character.charId, character]))
  const ids = new Set([...Object.keys(catalog), ...owned.keys()])
  return [...ids].map((charId) => ({
    charId,
    name: catalog[charId]?.name ?? charId,
    rarity: catalog[charId]?.rarity ?? null,
    profession: catalog[charId]?.profession ?? null,
    progress: owned.get(charId)
  }))
}

export function filterOperatorRoster(operators: readonly RosterOperator[], filter: OperatorFilters): RosterOperator[] {
  const query = filter.query.trim().toLocaleLowerCase()
  return operators
    .filter((operator) => {
      if (filter.recruitment === 'owned' && !operator.progress) return false
      if (filter.recruitment === 'missing' && operator.progress) return false
      if (query && !operator.name.toLocaleLowerCase().includes(query)) return false
      if (filter.professions.length && !filter.professions.includes(operator.profession ?? -1)) return false
      if (filter.rarities.length && !filter.rarities.includes(operator.rarity ?? -1)) return false
      if (filter.phase !== '' && operator.progress?.evolvePhase !== Number(filter.phase)) return false
      return true
    })
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'zh-CN') || a.charId.localeCompare(b.charId)
      const byLevel =
        (b.progress?.evolvePhase ?? -1) - (a.progress?.evolvePhase ?? -1) ||
        (b.progress?.level ?? -1) - (a.progress?.level ?? -1)
      const byRarity = (b.rarity ?? 0) - (a.rarity ?? 0)
      if (filter.sort === 'name') return byName
      if (filter.sort === 'level') return byLevel || byRarity || byName
      return byRarity || byLevel || byName
    })
}
