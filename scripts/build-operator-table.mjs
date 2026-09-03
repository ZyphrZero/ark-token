/**
 * 从 assets-source/character_table_simple.v2.json（源表，复制自一图流前端仓库）
 * 生成 src/assets/operator-table.slim.json 精简干员表。
 *
 * 精简表仅保留上传干员数据所需的两类信息：
 *   { [charId]: [rarity, { [uniEquipId]: typeName2 } | null] }
 * - rarity：干员星级（1-6），用于上传时的 rarity 字段
 * - uniEquipId -> typeName2（X/Y/D/A/B）：模组类型，用于把森空岛 equips 归到 modX/modY/modD/modA/modB
 *
 * 源表更新（游戏出新干员/新模组）后，将新的 character_table_simple.v2.json
 * 覆盖 assets-source/ 下同名文件，然后执行：npm run build:operator-table
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(rootDir, 'assets-source/character_table_simple.v2.json')
const outputPath = resolve(rootDir, 'src/assets/operator-table.slim.json')

const source = JSON.parse(readFileSync(sourcePath, 'utf-8'))

const slim = {}
let equipCount = 0
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
  slim[charId] = [rarity, equips]
}

const json = JSON.stringify(slim)
writeFileSync(outputPath, json, 'utf-8')

const operatorCount = Object.keys(slim).length
console.log(`已生成 ${outputPath}`)
console.log(`干员 ${operatorCount} 名，模组映射 ${equipCount} 条，文件 ${(json.length / 1024).toFixed(1)} KB`)
