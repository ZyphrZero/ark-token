import { describe, expect, it } from 'vitest'

import {
  currentDetailCandidate,
  formatDetailDescription,
  skillLevelIndex,
  skillLevelText,
  type DetailCandidate
} from './operator-details'

describe('operator detail helpers', () => {
  it('maps player/info mainSkillLvl and specializeLevel to the game skill level', () => {
    expect(skillLevelIndex(7, 0)).toBe(6)
    expect(skillLevelIndex(7, 1)).toBe(7)
    expect(skillLevelIndex(7, 3)).toBe(9)
    expect(skillLevelText(7, 2)).toBe('专精 2')
  })

  it('uses the last candidate unlocked by the current phase and potential rank', () => {
    const candidates: DetailCandidate[] = [
      { name: '天赋', description: '初始', phase: 0, potential: 0, blackboard: [] },
      { name: '天赋', description: '精二', phase: 2, potential: 0, blackboard: [] },
      { name: '天赋', description: '满潜', phase: 2, potential: 5, blackboard: [] }
    ]
    expect(currentDetailCandidate(candidates, 2, 3)?.description).toBe('精二')
    expect(currentDetailCandidate(candidates, 2, 5)?.description).toBe('满潜')
  })

  it('renders game blackboard values without exposing rich-text markup', () => {
    expect(formatDetailDescription('攻击力<@ba.vup>+{atk:0%}</>，持续{duration}秒', [
      { key: 'atk', value: 0.5 },
      { key: 'duration', value: 30 }
    ])).toBe('攻击力+50%，持续30秒')
  })
})
