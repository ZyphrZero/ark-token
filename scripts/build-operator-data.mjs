/**
 * 生成全量干员/基建数据表 src/assets/operator-data.json，并同步 529 枚技能图标
 * 到 src/popup/assets/building-skills/。
 *
 * 图标格式：有 cwebp 则转 webp，否则落原 PNG；扩展名在生成期统一决定（ICON_EXT），
 * 数据表 buildingSkills[].icon 为**裸文件名**（如 bskill_pow_spd3.png），
 * 不含路径——Vite 会给打包资源加 hash，硬编码 /assets/... 会 404，
 * 消费方用 import.meta.glob 解析目录再按文件名取。
 *
 * 数据源（不依赖 GitHub，默认走 jsDelivr CDN，国内直连）：
 *   arkntools/arknights-toolbox-data（固定 commit，与 RIIC-Web 一致）
 *     - assets/data/building.json       干员→基建技能槽、buff 图标/desc 键
 *     - assets/data/character.json      干员星级/职业/位置/招募标签
 *     - assets/locales/cn/building.json 技能中文名、描述
 *     - assets/locales/cn/character.json 干员中文名
 *   Kengxxiao/ArknightsGameData（中国台湾 gitee 镜像不可用，github 与 jsDelivr 兜底）
 *     - gamedata/excel/building_data.json 房间级常量（electricity / basicSpeedBuff）
 *     - gamedata/excel/character_table.json 模组映射（uniEquipId → typeName2）
 *
 * 源切换：环境变量 ARKDATA_SRC = jsdelivr（默认）| github。
 * 下载内容缓存到 .cache/arkdata/，非强制；重跑加速，网络失败时可复用。
 *
 * 运行：npm run build:operator-data
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(rootDir, '.cache/arkdata')
const outputPath = resolve(rootDir, 'src/assets/operator-data.json')

const ARK_COMMIT = process.env.ARKDATA_COMMIT || '302105b1404bd488c4700d063da9dcf3661a94f0'
const SRC = process.env.ARKDATA_SRC || 'jsdelivr'

/**
 * webp 编码器探测：优先 cwebp，其次 ffmpeg（libwebp），都没有则落原 PNG。
 * 一律用**无损**：图标是 36×36 带透明的小图，有损反而更大（实测 939B PNG →
 * 有损 q90 1056B、无损 768B），全量 529 枚无损约省 18%（637KB → ~520KB）。
 *
 * 图标扩展名在生成期统一决定一次（ICON_EXT）：数据表里的 icon 与落盘文件
 * 必须同扩展名，否则 UI 取不到图。
 */
const WEBP_ENCODER = (() => {
  for (const [name, probe] of [
    ['cwebp', ['-version']],
    ['ffmpeg', ['-version']]
  ]) {
    try {
      execFileSync(name, probe, { stdio: 'ignore' })
      return name
    } catch {
      // 探测失败继续试下一个
    }
  }
  return null
})()
const ICON_EXT = WEBP_ENCODER ? 'webp' : 'png'

/** 用探测到的编码器把 PNG 无损转 webp；抛错由调用方处理（不静默降级） */
function encodeWebp(srcPath, outPath) {
  if (WEBP_ENCODER === 'cwebp') {
    execFileSync('cwebp', ['-lossless', '-quiet', srcPath, '-o', outPath], { stdio: 'ignore' })
    return
  }
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', srcPath, '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6', outPath],
    { stdio: 'ignore' }
  )
}

// 两个源的 URL 模板；Kengxxiao 的 raw 路径要保留分支
const ARK_REPO = 'arkntools/arknights-toolbox-data'
const KENG_REPO = 'Kengxxiao/ArknightsGameData'

function assetUrl(repo, commit, path, branch = 'master') {
  if (SRC === 'github') {
    return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`
  }
  // jsDelivr 不接受 master 作为版本，用 commit；不带 commit 时也能用 master
  const version = commit || branch
  return `https://cdn.jsdelivr.net/gh/${repo}@${version}/${path}`
}

const FILES = {
  arkBuilding: {
    repo: ARK_REPO,
    path: 'assets/data/building.json',
    commit: ARK_COMMIT
  },
  arkCharacter: {
    repo: ARK_REPO,
    path: 'assets/data/character.json',
    commit: ARK_COMMIT
  },
  arkBuildingLocale: {
    repo: ARK_REPO,
    path: 'assets/locales/cn/building.json',
    commit: ARK_COMMIT
  },
  arkCharacterLocale: {
    repo: ARK_REPO,
    path: 'assets/locales/cn/character.json',
    commit: ARK_COMMIT
  },
  kengBuildingData: {
    repo: KENG_REPO,
    path: 'zh_CN/gamedata/excel/building_data.json',
    commit: ''
  },
  kengCharacterTable: {
    repo: KENG_REPO,
    path: 'zh_CN/gamedata/excel/character_table.json',
    commit: ''
  }
}

/**
 * 下载并写入 dest。curl 优先（能走系统代理、对 raw.githubusercontent 直连稳定），
 * Node fetch 回退（无 curl 或 curl 不可用）。任何不可用即抛错，由调用方按源回退。
 */
async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  // curl 路径：写入临时文件后 rename，避免持久污染
  const tmp = `${dest}.tmp`
  try {
    execFileSync('curl', ['-sSL', '-m', '60', '-o', tmp, url], { stdio: 'ignore' })
    if (existsSync(tmp) && readFileSync(tmp).length > 0) {
      writeFileSync(dest, readFileSync(tmp))
      rmSync(tmp, { force: true })
      return readFileSync(dest)
    }
    rmSync(tmp, { force: true })
  } catch {
    rmSync(tmp, { force: true })
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载失败 ${res.status} ${url}`)
  }
  const data = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, data)
  return data
}

async function loadJson(fileKey) {
  const { repo, path, commit } = FILES[fileKey]
  const url = assetUrl(repo, commit, path)
  const dest = join(cacheDir, `${fileKey}.json`)
  if (existsSync(dest)) {
    return JSON.parse(readFileSync(dest, 'utf-8'))
  }
  mkdirSync(dirname(dest), { recursive: true })
  await download(url, dest)
  return JSON.parse(readFileSync(dest, 'utf-8'))
}

/** 下载任意二进制到缓存并返回 Buffer。spec = { repo, path, commit }，destKey 用于缓存文件名 */
async function loadBinary(spec, ext, destKey) {
  const { repo, path, commit } = spec
  const url = assetUrl(repo, commit, path)
  const dest = join(cacheDir, `${destKey}.${ext}`)
  if (existsSync(dest)) {
    return readFileSync(dest)
  }
  mkdirSync(dirname(dest), { recursive: true })
  await download(url, dest)
  return readFileSync(dest)
}

/**
 * 从描述文本解析无人机充能加成。
 * 句式全部显式匹配，出现新句式返回 percent 0（非充能技能占多数）。
 * 返回 { percent, scale?, extra? }：percent 无条件部分，extra 依赖其他干员进驻。
 */
function parseChargePercent(buffName, description) {
  const patrol = /每10架无人机上限\+1%无人机充能速度（最多\+(\d+)%）/.exec(description)
  if (patrol) return { percent: Number(patrol[1]), scale: 'per10Drone' }
  const ramp = /无人机充能速度首小时\+\d+%，此后每小时\+1%，最终达到\+(\d+)%/.exec(description)
  if (ramp) return { percent: Number(ramp[1]), scale: 'ramp' }
  const perMate = /无人机充能速度\+(\d+)%，基建内[^，]*每有1名(.+?)（最多(\d+)名），充能速度额外\+(\d+)%/.exec(
    description
  )
  if (perMate) {
    return { percent: Number(perMate[1]), extra: { percent: Number(perMate[4]), max: Number(perMate[3]), requires: perMate[2] } }
  }
  // “愉快的对谈”/咒文共鸣/维护中/鸡励机制：整条技能都是条件型，无条件部分为 0
  const withExtra = /无人机(?:每小时)?充能速度\+(\d+)%，如果(.+?)，则?无人机充能速度额外\+(\d+)%/.exec(description)
  if (withExtra) return { percent: Number(withExtra[1]), extra: { percent: Number(withExtra[3]), requires: withExtra[2] } }
  const onlyExtra = /如果(.+?)，则无人机充能速度\+(\d+)%/.exec(description)
  if (onlyExtra) return { percent: 0, extra: { percent: Number(onlyExtra[2]), requires: onlyExtra[1] } }
  const fixed = /无人机(?:每小时)?充能速度\+(\d+)%/.exec(description)
  if (fixed) return { percent: Number(fixed[1]) }
  // 其他技能（如发电站其他类型）无充能加成，percent 0
  return { percent: 0 }
}

/**
 * 解析 arkntools 的解锁条件 `unlock`（格式 "精英阶段_等级"，如 "0_1" / "2_1" / "0_30"）。
 * 格式变动时抛错而非产出 NaN——档位判定全靠 phase/level，静默 NaN 会让所有技能都不生效。
 */
function parseUnlock(unlock, skillId) {
  const matched = /^(\d)_(\d+)$/.exec(unlock ?? '')
  if (!matched) {
    throw new Error(`技能 ${skillId} 的 unlock 格式无法解析（期望 "精英_等级"）：${unlock}`)
  }
  return { phase: Number(matched[1]), level: Number(matched[2]) }
}

const stripTags = text => String(text ?? '').replace(/<[^>]*>/g, '')

/**
 * 同步技能图标：从 arkntools 引 69 枚 webp（若不可用回退 png）。
 * 用 node 内置 zlib 重写 PNG 为 webp 并不可靠，此函数默认只拷贝 png；
 * 提供 cwebp 时尝试转换。webp 转换降级：失败或缺少 cwebp 则 `return false` 用原 PNG。
 */
async function main() {
  console.log(`生成载体数据（源 ${SRC}，commit ${ARK_COMMIT}）…`)
  const [building, character, buildingLocale, characterLocale, kengBuilding] = await Promise.all([
    loadJson('arkBuilding'),
    loadJson('arkCharacter'),
    loadJson('arkBuildingLocale'),
    loadJson('arkCharacterLocale'),
    loadJson('kengBuildingData')
  ])

  // 基础校验（房间常量）
  const electricity = kengBuilding.rooms?.POWER?.phases?.map(p => p.electricity)
  if (JSON.stringify(electricity) !== JSON.stringify([60, 130, 270])) {
    throw new Error(`rooms.POWER 发电量已变 ${JSON.stringify(electricity)}，请同步 building.ts`)
  }
  const basicSpeedBuff = kengBuilding.powerData?.basicSpeedBuff
  if (basicSpeedBuff !== 0.05) {
    throw new Error(`powerData.basicSpeedBuff 已变 ${basicSpeedBuff}，请同步 building.ts`)
  }

  // 1. 组装 operators
  // 干员中文名键: characterLocale[charId] = "格雷伊"（charId 无 char_ 前缀）
  const charName = id => characterLocale[id] ?? characterLocale[id.replace(/^char_/, '')] ?? ''
  const operators = {}
  for (const [opKey, opInfo] of Object.entries(character)) {
    const charId = `char_${opKey}`
    // arkntools 的 char[key] 为扁平技能序列：既可承载多技能槽（Friston-3 槽1/槽2），
    // 也可承载同槽 α/β 升级链（雷蛇 0_1→2_1）。两类在消费端由 phase/level 判定：
    // 同 chain 内 unlock 阶段递增即替换、取末档；跨 chain 则求和。slot 为序列序号（0 起），
    // 供 UI 区分同一干员的多个独立技能。
    const skills = (building.char?.[opKey] ?? []).map(skill => ({ ...skill }))
    const resolved = []
    for (let slot = 0; slot < skills.length; slot += 1) {
      const skill = skills[slot]
      const buff = building.buff?.data?.[skill.id]
      const name = buildingLocale?.buff?.name?.[skill.id] ?? ''
      // desc 是 hex 字符串键（如 "8c2e"），按原键取 locale 描述；数值解析须剥标签
      const desc =
        buff?.desc != null ? stripTags(buildingLocale?.buff?.description?.[buff.desc] ?? '') : ''
      const { percent, scale, extra } = parseChargePercent(name, desc)
      const { phase, level } = parseUnlock(skill.unlock, skill.id)
      resolved.push({
        slot,
        id: skill.id,
        phase,
        level,
        name,
        percent,
        icon: buff?.icon ? `${buff.icon}.${ICON_EXT}` : undefined,
        ...(scale ? { scale } : {}),
        ...(extra ? { extra } : {})
      })
    }
    operators[charId] = {
      charId,
      name: charName(opKey),
      rarity: opInfo.star,
      profession: opInfo.profession,
      position: opInfo.position,
      buildingSkills: resolved
    }
  }

  // 2. 补模组映射 + 战斗技能名（来自本地 character_table_simple.v2.json）
  // 此本地表从一图流前端仓库复制（assets-source/，随源表更新覆盖），
  // 含 equip(uniEquipId→typeName2) 与 skills[].skillName；arkntools 无模组/战斗技能名。
  // 用本地源表而非联网取 Kengxxiao character_table（该仓库 >20MB，jsDelivr 直接 404）。
  const localSimple = readFileSync(resolve(rootDir, 'assets-source/character_table_simple.v2.json'), 'utf-8')
  const simpleTable = JSON.parse(localSimple)
  // 技能名补充表：源表未收录的极新干员（提取口径见 docs/BUILDING_MOOD_API.md 第九节）
  const skillExtra = JSON.parse(readFileSync(resolve(rootDir, 'assets-source/skill-name-extra.v1.json'), 'utf-8'))
  for (const charId of Object.keys(operators)) {
    const ct = simpleTable[charId]
    if (ct && Array.isArray(ct.equip)) {
      const equips = {}
      for (const equip of ct.equip) {
        if (equip.uniEquipId && equip.typeName2) equips[equip.uniEquipId] = equip.typeName2
      }
      if (Object.keys(equips).length > 0) operators[charId].equips = equips
    }
    let skillNames = null
    if (ct && Array.isArray(ct.skills) && ct.skills.length > 0) {
      skillNames = ct.skills.map(skill => skill.skillName)
    } else if (Array.isArray(skillExtra[charId]?.[1]) && skillExtra[charId][1].length > 0) {
      // 补充表：skill-name-extra { [charId]: [rarity, [技能名...]] }
      skillNames = skillExtra[charId][1]
    }
    if (skillNames) operators[charId].skills = skillNames
  }

  // 3. 组装 buffs（技能独立索引；icon 为裸文件名，与落盘扩展名一致，见 ICON_EXT）
  const buffs = {}
  // 上游图标基名（不含扩展名），供 syncIcons 拼下载路径；
  // 不从 icon 字段回推——那里已带 ICON_EXT，回推会拼出 xxx.webp.png
  const iconBaseNames = new Set()
  for (const opKey of Object.keys(character)) {
    for (const skill of building.char?.[opKey] ?? []) {
      const buff = building.buff?.data?.[skill.id]
      if (!buff || buffs[skill.id]) continue
      const name = buildingLocale?.buff?.name?.[skill.id] ?? ''
      // 保留富文本原文（含 <@cc.vup> 等标签）：UI 要按标签高亮数值，
      // 数值解析用剥标签后的纯文本。剥标签的 helper 在 core/operator-data.ts。
      const descriptionRich = buff.desc != null ? buildingLocale?.buff?.description?.[buff.desc] ?? '' : ''
      const { percent, scale, extra } = parseChargePercent(name, stripTags(descriptionRich))
      if (buff.icon) {
        iconBaseNames.add(buff.icon)
      }
      buffs[skill.id] = {
        id: skill.id,
        name,
        descriptionRich,
        percent,
        // 与 buildingSkills[].icon 同口径：裸文件名含扩展名（见 ICON_EXT）
        icon: buff.icon ? `${buff.icon}.${ICON_EXT}` : undefined,
        ...(scale ? { scale } : {}),
        ...(extra ? { extra } : {})
      }
    }
  }

  // 4. 房间常量与术语
  const roomNames = buildingLocale?.name ?? {}
  const roomData = {}
  for (const [roomId, name] of Object.entries(roomNames)) {
    roomData[roomId] = { name }
  }
  // 补每级发电量/耗电（正数发电、负数耗电；恒 0 的房间不写该字段）
  for (const [roomId, room] of Object.entries(kengBuilding?.rooms ?? {})) {
    const phases = (room.phases ?? []).map(p => p.electricity)
    if (phases.some(v => v !== 0)) {
      roomData[roomId] = { ...roomData[roomId], electricity: phases }
    }
  }

  // 不写生成时间戳：产物入库，带时间戳会让每次重跑都产生噪声 diff、破坏可复现构建。
  // 数据版本由 source.arkntools（固定 commit）标识。
  const data = {
    source: {
      arkntools: ARK_COMMIT,
      kengxxiao: 'zh_CN/gamedata/excel/building_data.json',
      src: SRC
    },
    operators,
    buffs,
    rooms: roomData
  }
  writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  console.log(`operator-data.json 已生成（${Object.keys(operators).length} 干员 / ${Object.keys(buffs).length} 技能 / ${Object.keys(data.rooms).length} 房间）`)

  // 图标同步独立：--no-icons 或 ARKDATA_NO_ICONS=1 时跳过（数据表为缓存秒成）
  if (process.env.ARKDATA_NO_ICONS === '1' || process.argv.includes('--no-icons')) {
    return
  }
  await syncIcons(iconBaseNames)
}

/**
 * 同步技能图标。入参是上游图标**基名**集合（不含扩展名），落盘扩展名由 ICON_EXT 决定，
 * 与数据表 icon 字段严格一致。已存在的文件跳过，故数据/图标可分开重跑。
 */
async function syncIcons(iconBaseNames) {
  const iconOutDir = join(rootDir, 'src/popup/assets/building-skills')
  mkdirSync(iconOutDir, { recursive: true })
  let converted = 0
  for (const base of iconBaseNames) {
    const srcName = `${base}.png`
    // 落盘扩展名与数据表 icon 字段一致（见 ICON_EXT）
    const outPath = join(iconOutDir, `${base}.${ICON_EXT}`)
    if (existsSync(outPath)) continue
    let bytes
    try {
      bytes = await loadBinary(
        { repo: ARK_REPO, path: `assets/img/building_skill/${srcName}`, commit: ARK_COMMIT },
        'png',
        base
      )
    } catch (error) {
      console.warn(`  图标 ${srcName} 下载失败，跳过：${error.message}`)
      continue
    }
    if (WEBP_ENCODER) {
      const tmp = join(cacheDir, srcName)
      writeFileSync(tmp, bytes)
      try {
        encodeWebp(tmp, outPath)
        converted += 1
        continue
      } catch (error) {
        // 编码器存在但转换失败：ICON_EXT 已是 webp，回退写 PNG 会与数据表路径不一致，
        // 故显式失败而非静默降级（构建期问题应暴露）
        throw new Error(`${WEBP_ENCODER} 转换 ${srcName} 失败，与数据表 icon 扩展名（webp）冲突：${error.message}`)
      }
    }
    writeFileSync(outPath, bytes)
  }
  const how = WEBP_ENCODER ? `${WEBP_ENCODER} 无损转换 ${converted}` : '无 webp 编码器，用原 PNG'
  console.log(`技能图标同步完成：${iconBaseNames.size} 枚（${ICON_EXT}，${how}）`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
