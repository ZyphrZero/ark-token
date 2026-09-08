import { operatorData } from './operator-data'
import type { OperatorEntry } from './operator-data'
import type { OperatorProgressionData, PlayerInfoPayload, SklandChar, SklandCultivateData } from './types'

/**
 * 干员数据格式化与上传报文组装。
 *
 * 换算规则与一图流前端 `frontend-v2-plus/src/utils/survey/skland.js` 的 formattingOperatorData 一致：
 * - potential = potentialRank + 1
 * - skillN = skills[N-1].level
 * - modX/modY/modD/modA/modB = equips 中 typeName2 对应类型的模组等级
 * - rarity 取本地干员表（全量表，1-6 星），表里没有的干员跳过
 */

/** 全量干员表：{ [charId]: entry } */
export type OperatorTable = Record<string, OperatorEntry>

export const operatorSlimTable = operatorData.operators as unknown as OperatorTable

/** 旧 SlimTable 三元组：{ [charId]: [rarity, equips, skills] }，早期测试注入用 */
export type SlimTable = Record<string, [number, Record<string, string> | null, (string[] | null)?]>

/**
 * 归一化注入表：接受 OperatorTable（对象形）或旧 SlimTable 三元组（[rarity, equips, skills]），
 * 统一转为对象形。缺失字段用兜底，保证 formatOperatorData 单一消费路径。
 */
function toOperatorTable(table: OperatorTable | SlimTable): OperatorTable {
  const firstValue = Object.values(table as OperatorTable)[0]
  if (firstValue == null || Array.isArray(firstValue)) {
    const normalized: OperatorTable = {}
    for (const [charId, entry] of Object.entries(table as SlimTable)) {
      const [rarity, equips, skills] = entry
      normalized[charId] = {
        charId,
        name: '',
        rarity,
        profession: 0,
        position: 0,
        ...(equips ? { equips } : {}),
        ...(skills ? { skills } : {}),
        buildingSkills: []
      }
    }
    return normalized
  }
  return table as OperatorTable
}

/** 从干员表构建 mod 类型字典（可为注入表，测试与生产不同源） */
function buildEquipTypeDict(table: OperatorTable): Map<string, string> {
  const dict = new Map<string, string>()
  for (const entry of Object.values(table)) {
    const equips = entry.equips
    if (equips) {
      for (const [uniEquipId, typeName2] of Object.entries(equips)) {
        dict.set(uniEquipId, typeName2)
      }
    }
  }
  return dict
}

/** 把森空岛返回的干员列表转成一图流上传格式；table 参数供测试注入 */
export function formatOperatorData(
  characterList: SklandChar[],
  table: OperatorTable | SlimTable = operatorSlimTable
): OperatorProgressionData[] {
  const normalized = toOperatorTable(table)
  const operatorList: OperatorProgressionData[] = []
  const equipTypeDict = buildEquipTypeDict(normalized)

  for (const character of characterList) {
    const { id, level, evolvePhase, mainSkillLevel, skills, equips, potentialRank } = character
    const tableEntry = normalized[id]
    if (!tableEntry) {
      // 干员表未收录（通常是源表过期），跳过以保证上传数据的星级/模组映射正确
      continue
    }

    const operator: OperatorProgressionData = {
      own: true,
      charId: id,
      level: level ?? 0,
      elite: evolvePhase ?? 0,
      potential: (potentialRank ?? 0) + 1,
      mainSkill: mainSkillLevel ?? 1,
      rarity: tableEntry.rarity,
      skill1: 0,
      skill2: 0,
      skill3: 0,
      modX: 0,
      modY: 0,
      modD: 0,
      modA: 0,
      modB: 0
    }

    if (skills) {
      for (let i = 0; i < skills.length && i < 3; i += 1) {
        if (skills[i]) {
          operator[`skill${i + 1}` as 'skill1' | 'skill2' | 'skill3'] = skills[i].level
        }
      }
    }

    if (equips) {
      for (const equip of equips) {
        const equipType = equipTypeDict.get(equip.id)
        if (equipType && ['X', 'Y', 'D', 'A', 'B'].includes(equipType)) {
          operator[`mod${equipType}` as 'modX' | 'modY' | 'modD' | 'modA' | 'modB'] = equip.level
        }
      }
    }

    operatorList.push(operator)
  }

  return operatorList
}

/** 组装上传一图流的完整报文（对应后端 PlayerInfoDTO） */
export function buildUploadPayload(
  account: { uid: string; nickName: string; channelName: string; channelMasterId: number },
  cultivate: SklandCultivateData
): PlayerInfoPayload {
  return {
    // 后端 open-api 路径从 Authorization 头取 token，报文中的 token 字段仅占位
    token: '',
    uid: account.uid,
    nickName: account.nickName,
    channelName: account.channelName,
    channelMasterId: account.channelMasterId,
    operatorDataList: formatOperatorData(cultivate.characters),
    itemList: cultivate.items.map(item => ({ itemId: item.id, quantity: item.count }))
  }
}
