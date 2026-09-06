/**
 * 从 assets-source/character_table_simple.v2.json（源表，复制自一图流前端仓库）
 * 生成 src/assets/operator-table.slim.json 精简干员表。
 *
 * 精简表保留三类信息：
 *   { [charId]: [rarity, { [uniEquipId]: typeName2 } | null, [技能名...] | null] }
 * - rarity：干员星级（1-6），用于上传时的 rarity 字段
 * - uniEquipId -> typeName2（X/Y/D/A/B）：模组类型，用于把森空岛 equips 归到 modX/modY/modD/modA/modB
 * - 技能名（槽位顺序）：训练室展示正在专精的技能名（core/status/building.ts 的 trainingSkillInfo）
 *
 * 源表更新（游戏出新干员/新模组）后，将新的 character_table_simple.v2.json
 * 覆盖 assets-source/ 下同名文件，然后执行：npm run build:operator-table。
 * 源表滞后缺新干员时，用 assets-source/skill-name-extra.v1.json 补充
 * （{ [charId]: [rarity, [技能名...]] }，提取自 ArknightsGameData 的
 * character_table+skill_table，重新生成见 docs/BUILDING_MOOD_API.md 第九节的提取口径）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(rootDir, 'assets-source/character_table_simple.v2.json')
const extraPath = resolve(rootDir, 'assets-source/skill-name-extra.v1.json')
const outputPath = resolve(rootDir, 'src/assets/operator-table.slim.json')

const source = JSON.parse(readFileSync(sourcePath, 'utf-8'))
const extraSkills = JSON.parse(readFileSync(extraPath, 'utf-8'))

const slim = {}
let equipCount = 0
let skillCount = 0
for (const [charId, info] of Object.entries(source)) {
  const rarity = info.rarity
  if (typeof rarity !== 'number') {
    throw new Error(`干员 ${charId} 缺少 rarity 字段，请检查源表版本`)
  }
  let equips = null
  if (Array.isArray(info.equip) && info.equip.length > 0) {
    equips = {}
    for (const equip of info.equip) {
      const { uniEquipId, typeName2 } = equip
      if (typeof uniEquipId !== 'string' || typeof typeName2 !== 'string') {
        throw new Error(`干员 ${charId} 的模组缺少 uniEquipId/typeName2，请检查源表版本`)
      }
      equips[uniEquipId] = typeName2
      equipCount += 1
    }
  }
  // 技能名按槽位顺序（与森空岛 chars[].skills[] 顺序一致，skillId 逐一对应）
  let skillNames = null
  if (Array.isArray(info.skills) && info.skills.length > 0) {
    skillNames = info.skills.map(skill => {
      if (typeof skill.skillName !== 'string') {
        throw new Error(`干员 ${charId} 的技能缺少 skillName，请检查源表版本`)
      }
      return skill.skillName
    })
    skillCount += skillNames.length
  }
  slim[charId] = [rarity, equips, skillNames]
}
// 补充表只补源表没有的干员，避免两份数据打架；条目为 [rarity, [技能名...]]
for (const [charId, [rarity, names]] of Object.entries(extraSkills)) {
  if (charId in slim) {
    continue
  }
  slim[charId] = [rarity, null, names]
  skillCount += names.length
}

const json = JSON.stringify(slim)
writeFileSync(outputPath, json, 'utf-8')

const operatorCount = Object.keys(slim).length
const extraCount = Object.keys(extraSkills).length
console.log(`已生成 ${outputPath}`)
console.log(`干员 ${operatorCount} 名（源表 ${operatorCount - extraCount} + 补充 ${extraCount}），模组映射 ${equipCount} 条，技能名 ${skillCount} 条，文件 ${(json.length / 1024).toFixed(1)} KB`)
