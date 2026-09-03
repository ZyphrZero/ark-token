import slimTableJson from '../assets/operator-table.slim.json'
import type { OperatorProgressionData, PlayerInfoPayload, SklandChar, SklandCultivateData } from './types'

/**
 * 干员数据格式化与上传报文组装。
 *
 * 换算规则与一图流前端 `frontend-v2-plus/src/utils/survey/skland.js` 的 formattingOperatorData 一致：
 * - potential = potentialRank + 1
 * - skillN = skills[N-1].level
 * - modX/modY/modD/modA/modB = equips 中 typeName2 对应类型的模组等级
 * - rarity 取本地干员表（v2 表已为 1-6 星），表里没有的干员跳过
 */

/** 精简干员表：{ [charId]: [星级, { [模组ID]: 模组类型 }] } */
type SlimTable = Record<string, [number, Record<string, string> | null]>

export const operatorSlimTable = slimTableJson as unknown as SlimTable

function buildEquipTypeDict(table: SlimTable): Map<string, string> {
  const dict = new Map<string, string>()
  for (const entry of Object.values(table)) {
    const equips = entry[1]
    if (equips) {
      for (const [uniEquipId, typeName2] of Object.entries(equips)) {
        dict.set(uniEquipId, typeName2)
      }
    }
  }
  return dict
}

/** 把森空岛返回的干员列表转成一图流上传格式；table 参数供测试注入 */
export function formatOperatorData(characterList: SklandChar[], table: SlimTable = operatorSlimTable): OperatorProgressionData[] {
  const operatorList: OperatorProgressionData[] = []
  const equipTypeDict = buildEquipTypeDict(table)

  for (const character of characterList) {
    const { id, level, evolvePhase, mainSkillLevel, skills, equips, potentialRank } = character
    const tableEntry = table[id]
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
      rarity: tableEntry[0],
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
