/**
 * 从公开游戏数据生成干员详情的紧凑运行时表。
 *
 * 产物只保留 src/assets/operator-data.json 已收录干员的情报、范围、技能与模组效果，
 * 不将完整游戏表打包进扩展。数据版本固定，更新时显式修改 GAME_DATA_COMMIT。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(rootDir, '.cache/operator-details')
const outputPath = resolve(rootDir, 'src/assets/operator-details.json')
const operatorDataPath = resolve(rootDir, 'src/assets/operator-data.json')
const GAME_DATA_COMMIT = 'cc5bf84b0e6d552d9c13619e2683ff25c5bbeecb'
const GAME_DATA_BASE = `https://cdn.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@${GAME_DATA_COMMIT}/zh_CN/gamedata/excel`

const FILES = ['character_table.json', 'skill_table.json', 'range_table.json', 'uniequip_table.json', 'battle_equip_table.json']

async function loadJson(fileName) {
  const cachePath = join(cacheDir, fileName)
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  }
  const response = await fetch(`${GAME_DATA_BASE}/${fileName}`)
  if (!response.ok) {
    throw new Error(`下载 ${fileName} 失败：HTTP ${response.status}`)
  }
  const text = await response.text()
  const data = JSON.parse(text)
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cachePath, `${text}\n`, 'utf8')
  return data
}

function compactBlackboard(entries) {
  return (entries ?? []).map(({ key, value, valueStr }) => ({ key, value, ...(valueStr ? { valueStr } : {}) }))
}

function compactCandidates(candidates) {
  return (candidates ?? []).map(candidate => ({
    name: candidate.name ?? '',
    description: candidate.description ?? candidate.additionalDescription ?? candidate.upgradeDescription ?? candidate.overrideDescripton ?? '',
    phase: Number(String(candidate.unlockCondition?.phase ?? 'PHASE_0').replace('PHASE_', '')) || 0,
    potential: candidate.requiredPotentialRank ?? 0,
    rangeId: candidate.rangeId ?? undefined,
    blackboard: compactBlackboard(candidate.blackboard)
  })).filter(candidate => candidate.name || candidate.description)
}

function compactModulePhase(phase) {
  const effects = []
  for (const part of phase.parts ?? []) {
    for (const candidates of [
      part.addOrOverrideTalentDataBundle?.candidates,
      part.overrideTraitDataBundle?.candidates
    ]) {
      effects.push(...compactCandidates(candidates))
    }
  }
  return {
    level: phase.equipLevel,
    attributes: compactBlackboard(phase.attributeBlackboard),
    effects
  }
}

function compactSkill(skill) {
  return {
    id: skill.skillId,
    levels: (skill.levels ?? []).map(level => ({
      name: level.name ?? skill.skillId,
      description: level.description ?? '',
      rangeId: level.rangeId ?? undefined,
      skillType: level.skillType ?? '',
      durationType: level.durationType ?? '',
      duration: level.duration ?? 0,
      spType: level.spData?.spType ?? '',
      spCost: level.spData?.spCost ?? 0,
      initSp: level.spData?.initSp ?? 0,
      maxChargeTime: level.spData?.maxChargeTime ?? 1,
      blackboard: compactBlackboard(level.blackboard)
    }))
  }
}

async function main() {
  const [characters, skills, ranges, equipTable, battleEquips] = await Promise.all(FILES.map(loadJson))
  const summary = JSON.parse(readFileSync(operatorDataPath, 'utf8'))
  const operators = {}
  const referencedSkills = new Set()
  const referencedEquips = new Set()

  for (const [charId, catalog] of Object.entries(summary.operators)) {
    const character = characters[charId]
    if (!character) {
      console.warn(`详情源表未收录 ${charId}`)
      continue
    }
    const skillIds = (character.skills ?? []).map(skill => skill.skillId).filter(Boolean)
    skillIds.forEach(id => referencedSkills.add(id))
    const equipIds = Object.keys(catalog.equips ?? {})
    equipIds.forEach(id => referencedEquips.add(id))
    operators[charId] = {
      description: character.description ?? '',
      appellation: character.appellation ?? '',
      position: character.position ?? '',
      subProfessionId: character.subProfessionId ?? '',
      tags: character.tagList ?? [],
      phases: (character.phases ?? []).map(phase => ({ rangeId: phase.rangeId ?? undefined, maxLevel: phase.maxLevel ?? 0 })),
      trait: compactCandidates(character.trait?.candidates),
      talents: (character.talents ?? []).map(talent => compactCandidates(talent.candidates)),
      potentialEffects: (character.potentialRanks ?? []).map(rank => rank.description ?? '').filter(Boolean),
      skillIds,
      equipIds
    }
  }

  const detailSkills = {}
  for (const skillId of referencedSkills) {
    if (skills[skillId]) {
      detailSkills[skillId] = compactSkill(skills[skillId])
    } else {
      console.warn(`详情源表未收录技能 ${skillId}`)
    }
  }

  const equips = {}
  for (const equipId of referencedEquips) {
    const equip = equipTable.equipDict?.[equipId]
    if (!equip) {
      console.warn(`详情源表未收录模组 ${equipId}`)
      continue
    }
    equips[equipId] = {
      name: equip.uniEquipName ?? equipId,
      type: equip.typeName2 ?? undefined,
      icon: equip.typeIcon ?? undefined,
      phases: (battleEquips[equipId]?.phases ?? []).map(compactModulePhase)
    }
  }

  const compactRanges = {}
  for (const [id, range] of Object.entries(ranges)) {
    compactRanges[id] = (range.grids ?? []).map(({ row, col }) => ({ row, col }))
  }

  const data = {
    source: {
      repository: 'Kengxxiao/ArknightsGameData',
      commit: GAME_DATA_COMMIT
    },
    operators,
    skills: detailSkills,
    equips,
    ranges: compactRanges
  }
  writeFileSync(outputPath, `${JSON.stringify(data)}\n`, 'utf8')
  console.log(`operator-details.json 已生成（${Object.keys(operators).length} 干员 / ${Object.keys(detailSkills).length} 技能 / ${Object.keys(equips).length} 模组）`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
