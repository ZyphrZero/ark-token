# 森空岛「干员档案 char-info」接口语义分析

数据来源：2026-09-10 经 Reqable 抓取森空岛 App v2.0.0（`com.hypergryph.skland`）与
直接签名明文请求的 `GET https://zonai.skland.com/api/v1/game/arknights/char-book/char-info?charId={charId}&uid={游戏uid}`
响应；样本存于 `skland_dump/20260910_capture/raw/`（结城理 91KB / 遥 82KB / 夜莺 74KB
三个明文全量样本，及 App base64 形态的 Reqable 记录 22250/22434 等）。配套接口：进入
干员详情页时触发 `POST /h5/v1/game/arknights/char-id/transit`（body `{"list":[]}`）。

## 一、传输格式的两个版本（与 player/info 一致）

| 客户端 | 请求头 | 响应结构 |
|---|---|---|
| App v2.0.0（platform 1） | `x-transformed: base64` | `{ code, data: { content: "<base64>" } }`，单干员约 330KB |
| 签名流（platform 3，见 `docs/EMULATOR_CAPTURE_SETUP.md` 3.2） | 无 | `{ code, data: { …直接 JSON… } }`，约 75~90KB，**字段更全** |

明文形态额外含 `position/tagList/maxPotentialLevel/description/blackboard/storyTexts/
buildBuff/talents/potentialRanks/phase/maxFavourAttribute/items/richText/
termDescriptionDict/tokens`；App 形态因视图截断未能完整比对，消费建议统一走明文形态。

## 二、顶层结构（明文形态，三干员核实）

`id, name, rarity（5=六星）, profession, subProfessionId, subProfessionName,
appellation, has（是否拥有）, prevCharId/nextCharId（升格链）, isInPool/isLimitUp 等
获取标记, skills, equipments, talents, potentialRanks, phase（干员精英化）,
items（材料字典）, …`

干员中文名/职业以 player/info 的 `charInfoMap` 为权威交叉源（见
`docs/BUILDING_MOOD_API.md` 与 `src/core/skland-info.ts`）。

## 三、skills[]（技能/专精表）

- `id / name / skillType / spType / levels[]`；**levels 数 = 10**（等级 1-7 + 专精 1-3，
  三干员九技能一致），专精行 = `levels[7..9]`
- 每级字段：`description`（富文本模板）、`spData{initSp, spCost}`、`blackboard[]`、
  `cost[]`（等级 2 起为升级材料、专精行为专精材料）、`range{id, direction, grids[]}`、
  `duration`
- **与拥有态的连接键**：`player/info chars[].skills[].id` 与本接口 `skills[].id` 逐字
  一致可直接 join；通用技能带 `[N]` 变体后缀（如 `skcom_heal_up[3]` = 治疗强化·γ型），
  拼接时必须保留。专精等级 = `chars[].skills[].specializeLevel`（0-3），技能等级 =
  `chars[].mainSkillLvl`（1-7）

## 四、equipments[]（模组表）

- 键名 **`equipments`**；**明文形态不返回 `uniequip_001`，返回 002 及以后的全部模组**
  （三干员核实：结城理/遥各 1 个 002，夜莺返回 002+003 两个——即使 003 在 player/info
  中为 locked）。001 模组的 id/等级/锁定状态以 player/info `chars[].equip` 为准
- 字段：`id, name, typeName（如 rin-x/bls-y）, shiningColor, desc（模组故事全文）,
  unlockLevel, unlockEvolvePhase, missionList[]（解锁任务）, phases[]`
- `phases[]` 3 级（模组 1/2/3 级），每级：
  - `attribute`：**稀疏键字典**（按模组类型含 atk/def/max_hp/magic_resistance/
    attack_speed 等不同子集），渲染白值加成须按键遍历
  - `trait{additionalDesc | overrideDesc, range, blackboard}`：特性改写，仅变化级非 null
  - `talent{name, upgradeDesc, index}`：天赋升级描述，仅变化级非 null
  - `favorPercent`（好感需求）、`cost[]`（模组材料）

## 五、其余静态数据

- `talents[]`：`candidates[]` 数组，每项含 `unlockCondition{phase, level}`、`name`、
  `description`、`blackboard[]`、`requiredPotentialRank`——不同潜能档位的天赋变体
- `potentialRanks[]`：5 条 `{description, talent[]}`（潜能 2-6 效果）
- `phase[]`：3 条 `{range?, level, maxLevel, maxLevelAttribute{...}, cost[]}`（精英 0/1/2
  的等级上限、满级属性、升阶材料）
- `items[]`：**本次响应引用的全部道具字典** `{id, name, type, stages[]（掉落关卡）,
  productions[]（合成配方）, shop, activity, rarity}`——skills/equipments/phase 各处
  `cost[].id` 均可就地解析名称与获取途径，无需外部道具表（常见 id：4001=龙门币、
  3301/3302/3303=技巧概要·α/β/γ、mod_unlock_token=模组数据块、mod_update_token_1/2=
  数据增补条/仪）
- `richText` / `termDescriptionDict`：富文本样式字典与术语表（`<$ba.sluggish>` → 停顿
  等游戏术语释义），渲染描述文本时的查表源

## 六、描述文本渲染规则

1. 占位符 `{<key>:<默认格式>}`（如 `{attack@atk_scale:0%}`）取**同级** `blackboard`
   同名 key 的 value 替换；格式后缀 `%` 表示 ×100 百分比渲染（1.1 → 110%）
2. `<@ba.vup>…</>` 等为高亮富文本标记；`<$ba.xxx>` / `$ba.xxx` 为术语引用（查
   `termDescriptionDict`）
3. 专精表 = levels[7..9] 的 description/blackboard/cost 差异行；模组表 = phases[] 的
   attribute + trait/talent 变化 + cost 行

## 七、采样与拉取方法

- 大响应体（App 形态 330KB）经 MCP 拉取会截断；**直接签名明文请求**是常规采样通道
  （算法与 `src/core/skland.ts` 的 `getSign` 一致，操作手册见
  `docs/EMULATOR_CAPTURE_SETUP.md` 第 3.2 节）
- cred/token 取自最近一次 `generate_cred_by_code` 抓包响应；App 走 `auth/refresh`
  或重新登录后凭据轮换，旧 token 随即失效
- 历史勘误：曾从 base64 碎片人工解出干员/技能名全部出错（"真理"实为结城理等），
  名称类信息必须以 `charInfoMap` / `equipmentInfoMap` / 完整程序化解码样本交叉核对
