/**
 * 从 ArknightsGameData 的 building_data.json 生成
 * src/assets/drone-charge-table.json（发电站无人机充能技能表）。
 *
 * 表结构：{ [charId]: [ 槽位[ { phase, level, percent, name, scale?, extra? }, ... ], ... ] }
 * - 外层数组是**技能槽**（不同槽位可同时生效，求和）；内层数组是**同槽升级链**
 *   （α → β 为替换关系，不叠加），按解锁条件升序；消费时每槽取"练度已满足的最后一档"
 *   再跨槽求和，见 core/status/building.ts 的 powerPlantSkillPercent。
 * - phase/level：解锁所需精英阶段与该阶段等级（cond.phase PHASE_N → N）
 * - percent：无条件生效的无人机充能速度加成百分点（条件型技能此项为 0）
 * - scale（可选，数值随快照内其他字段变化）：
 *     'per10Drone' —— 每 10 架无人机上限 +1%，percent 为上限（巡线框架，按 labor.maxValue 计算）
 *     'ramp'       —— 首小时较低、每小时 +1% 爬升，percent 为终值（技术交流·α/β）
 * - extra（可选）：依赖其他干员进驻位置的附加加成 { percent, max?, requires }。
 *   **运行时不计入**（需要干员阵营/子职业等快照外元数据），仅在表中留档并由
 *   powerPlantSkillPercent 返回 partial 标记，供 UI 提示"可能还有附加加成"。
 *
 * 源表不入库（5MB+），使用前下载到 assets-source/building_data.json：
 *   curl -o assets-source/building_data.json \
 *     https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json
 * 然后执行：npm run build:drone-charge-table
 *
 * 口径依据（2026-09-08 真实抓包核实，见 docs/BUILDING_MOOD_API.md 第六节）：
 * 全部 36 个含"无人机充能速度"的基建技能 roomType 均为 POWER，控制中枢不产生充能加成。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(rootDir, 'assets-source/building_data.json')
const outputPath = resolve(rootDir, 'src/assets/drone-charge-table.json')

let source
try {
  source = JSON.parse(readFileSync(sourcePath, 'utf-8'))
} catch (error) {
  throw new Error(
    `读取源表失败：${sourcePath}\n` +
      '源表不入库，请先下载：curl -o assets-source/building_data.json ' +
      'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json\n' +
      `原始错误：${error.message}`
  )
}

const stripTags = text => String(text ?? '').replace(/<[^>]*>/g, '')

/** 校验基础加成常量仍是 5%（powerData.basicSpeedBuff），变了要同步 building.ts */
const basicSpeedBuff = source.powerData?.basicSpeedBuff
if (basicSpeedBuff !== 0.05) {
  throw new Error(
    `powerData.basicSpeedBuff 已变为 ${basicSpeedBuff}（预期 0.05），` +
      '请同步 core/status/building.ts 的 POWER_PLANT_BASE_CHARGE_PERCENT'
  )
}

/** 校验发电量表仍是 [60,130,270]，变了要同步 POWER_ELECTRICITY */
const electricity = source.rooms?.POWER?.phases?.map(phase => phase.electricity)
if (JSON.stringify(electricity) !== JSON.stringify([60, 130, 270])) {
  throw new Error(
    `rooms.POWER 发电量已变为 ${JSON.stringify(electricity)}（预期 [60,130,270]），` +
      '请同步 core/status/building.ts 的 POWER_ELECTRICITY'
  )
}

/**
 * 从技能描述解析充能加成。已知句式全部显式匹配，出现新句式直接抛错
 * （宁可构建失败也不静默漏算）。返回 { percent, scale?, extra? }：
 * percent 为无条件部分，extra 为依赖其他干员进驻的附加部分。
 */
function parseChargePercent(buffName, description) {
  // 巡线框架：每 10 架无人机上限 +1%，上限 percent
  const patrol = /每10架无人机上限\+1%无人机充能速度（最多\+(\d+)%）/.exec(description)
  if (patrol) {
    return { percent: Number(patrol[1]), scale: 'per10Drone' }
  }
  // 技术交流·α/β：随连续工作小时爬升，取终值
  const ramp = /无人机充能速度首小时\+\d+%，此后每小时\+1%，最终达到\+(\d+)%/.exec(description)
  if (ramp) {
    return { percent: Number(ramp[1]), scale: 'ramp' }
  }
  // 生态科主任：基础 +N%，每有 1 名同阵营干员额外 +M%（最多 K 名）
  const perMate = /无人机充能速度\+(\d+)%，基建内[^，]*每有1名(.+?)（最多(\d+)名），充能速度额外\+(\d+)%/.exec(
    description
  )
  if (perMate) {
    return {
      percent: Number(perMate[1]),
      extra: { percent: Number(perMate[4]), max: Number(perMate[3]), requires: perMate[2] }
    }
  }
  // 机械工学：基础 +N%，若指定干员进驻指定房间额外 +M%
  const withExtra = /无人机(?:每小时)?充能速度\+(\d+)%，如果(.+?)，则?无人机充能速度额外\+(\d+)%/.exec(
    description
  )
  if (withExtra) {
    return {
      percent: Number(withExtra[1]),
      extra: { percent: Number(withExtra[3]), requires: withExtra[2] }
    }
  }
  // “愉快的对谈”/咒文共鸣/维护中/鸡励机制：整条技能都是条件型，无条件部分为 0
  const onlyExtra = /如果(.+?)，则无人机充能速度\+(\d+)%/.exec(description)
  if (onlyExtra) {
    return { percent: 0, extra: { percent: Number(onlyExtra[2]), requires: onlyExtra[1] } }
  }
  // 固定值（占绝大多数）
  const fixed = /无人机(?:每小时)?充能速度\+(\d+)%/.exec(description)
  if (fixed) {
    return { percent: Number(fixed[1]) }
  }
  throw new Error(`技能「${buffName}」的充能描述无法解析，请补充句式：${description}`)
}

const phaseNumber = phase => {
  const matched = /^PHASE_(\d)$/.exec(phase)
  if (!matched) {
    throw new Error(`未知精英阶段 cond.phase：${phase}`)
  }
  return Number(matched[1])
}

const table = {}
let tierCount = 0
for (const [charId, info] of Object.entries(source.chars ?? {})) {
  /** 同一干员的多个 buffChar 是不同技能槽（可叠加）；本表只收发电站充能槽 */
  const chargeSlots = []
  for (const slot of info.buffChar ?? []) {
    const tiers = []
    for (const entry of slot.buffData ?? []) {
      const buff = source.buffs?.[entry.buffId]
      if (!buff || buff.roomType !== 'POWER') {
        continue
      }
      const description = stripTags(buff.description)
      if (!description.includes('无人机充能速度')) {
        continue
      }
      const { percent, scale, extra } = parseChargePercent(buff.buffName, description)
      tiers.push({
        phase: phaseNumber(entry.cond.phase),
        level: entry.cond.level,
        percent,
        name: buff.buffName,
        ...(scale ? { scale } : {}),
        ...(extra ? { extra } : {})
      })
    }
    if (tiers.length > 0) {
      chargeSlots.push(tiers)
    }
  }
  if (chargeSlots.length === 0) {
    continue
  }
  for (const tiers of chargeSlots) {
    tiers.sort((a, b) => a.phase - b.phase || a.level - b.level)
    tierCount += tiers.length
  }
  table[charId] = chargeSlots
}

const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(outputPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')

const allTiers = Object.values(sorted).flat(2)
const scaled = allTiers.filter(tier => tier.scale)
const conditional = allTiers.filter(tier => tier.extra)
console.log(`发电站充能技能表已生成：${outputPath}`)
console.log(`  干员 ${Object.keys(sorted).length} 名 / 技能档位 ${tierCount} 个`)
console.log(`  多槽干员 ${Object.entries(sorted).filter(([, slots]) => slots.length > 1).length} 名`)
console.log(`  快照可算档位 ${scaled.length} 个：${scaled.map(t => `${t.name}(${t.scale})`).join('、')}`)
console.log(`  条件型档位 ${conditional.length} 个（运行时不计入）：${conditional.map(t => t.name).join('、')}`)
