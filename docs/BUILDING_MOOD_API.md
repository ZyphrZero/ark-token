# 森空岛「基建干员心情/疲劳」接口语义分析

数据来源：2026-09-05 经 Reqable 抓取森空岛 App v1.62.0（`com.hypergryph.skland`）的
`GET https://zonai.skland.com/api/v1/game/player/info?uid={uid}&userId={userId}` 响应，
样本存于 `skland_dump/building_api/`（`player-info-app-raw.json` 为原始响应，
`player-info-app-decoded.json` 为解码后 JSON，昵称已脱敏）；
计算逻辑还原自 App 前端 bundle `_web_inspect/main-0a037d97.3091b5d8.js`。

2026-09-08 补充采集：新增 player/info 快照（`currentTs=1788853862`，账号 3 发电站/3 制造/
3 贸易/4 宿舍全量）用于发电站电力与充能加成的核实，见第六节；游戏侧常量口径来自
ArknightsGameData 的 `building_data.json`（`rooms.POWER`、`powerData`、`buffs`、
`chars[].buffChar`），提取脚本 `scripts/build-drone-charge-table.mjs`。

## 一、传输格式的两个版本

| 客户端 | 请求头 | 响应结构 |
|---|---|---|
| App v1.62.0（platform 1） | `x-transformed: base64` | `{ code, data: { content: "<base64>" } }`，content 解码后为完整 JSON |
| 网页/插件签名流（platform 3） | 无 | `{ code, data: { …直接 JSON… } }` |

两者内部 JSON 结构一致；本插件 `fetchSklandPlayerInfo` 走 platform 3，无需处理 base64。

## 二、ap 字段口径（重要）

`building.*.chars[].ap` 为心情值，**单位 0.01 秒，满值 8_640_000**：

- 8_640_000 = 86 400 秒 = 24 小时 = **24 点心情**；1 点 = 360 000。
- 实测满心情干员 ap 恰为 8_640_000；App 端满值常量同样是 `864e4`。
- 曾按 86 400（秒）口径计算百分比，导致面板所有干员恒显示 100%，已在本次修正。

`lastApAddTime` 为该快照对应的服务器时间（unix 秒）。**ap 是快照值**，当前心情必须按设施
速率外推；游戏未在线同步时快照可能落后数小时甚至数天。

`chars[].workTime` 为该干员在此设施的累计工作小时数；`bubble` 为互动气泡，与心情无关。

`building.tiredChars` 为服务端标记的疲劳干员（实测为空数组），App 会在其上叠加客户端
按设施外推的判定合并计数。

## 三、当前心情外推（与 App 完全一致）

记 `elapsed = max(0, now − lastApAddTime)`，单位秒：

### 工作设施（制造/贸易/发电/会客/人力/训练教官）

```
当前 ap = ap − 100 × min(elapsed, capSec)        // 消耗 100 ap/秒 = 1 点/小时，下限 0
```

`capSec` 是"设施还能持续工作多久"，设施停工（订单排空/配方产完/专精结束）后干员不再
消耗心情，外推不应越过该时刻。各房间口径（照搬 App bundle）：

| 房间 | capSec |
|---|---|
| 发电站、贸易站 | 无上限（`Infinity`） |
| 制造站 | `min(remain, floor((capacity−weight)/每件重量)) × 每件秒数 − min(chars[].ap)/100 × speed + min(chars[].ap)/100`；未收录配方视为无上限 |
| 会客室 | `(completeWorkTime − lastUpdateTime) + (9 − clue.own) × 43200` |
| 人力办公室 | 完成时刻已过：`(now − completeWorkTime) + (2 − refreshCount) × 43200`；未完成或 -1：无上限 |
| 训练室教官 | `remainSecs`（-1 空闲时为 0） |
| 控制中枢 | App 不外推（无官方口径），插件展示快照值 |

### 宿舍（恢复）

```
当前 ap = min(8_640_000, ap + elapsed × rate × 100)
rate = 1.5 + 0.1 × 宿舍等级 + 0.0004 × 氛围(comfort)
```

实测样本：lv5/comfort5000 → 4.0 倍速（约 6 小时回满）；lv3/comfort3000 → 3.0 倍速。

## 四、疲劳判定

当前 ap ≤ 360 000（即 ≤ 1 点心情）视为疲劳；另快照 ap < 36 000（0.1 点）直接视为疲劳。
App 首页「干员疲劳 N」= 服务端 tiredChars 数 + 客户端按上述外推判定的疲劳数（去重、
排除宿舍恢复中的干员、不计控制中枢与训练学员）。

## 五、会客室线索板（clue）结构语义

抓包核实（样本 `skland_dump/building_api/meeting-clue-compact-sample.json`，Reqable record 2478）：

| 字段 | 语义 |
|---|---|
| `board` | **已置入线索板的系列名，紧凑列表**：置入 1/3/4/7 号位时为 `[RHINE, BLACKSTEEL, URSUS, RHODES]`，无占位元素。槽位 i（1-7）是否置入必须按系列名成员判断（编号顺序 `RHINE→PENGUIN→BLACKSTEEL→URSUS→GLASGOW→KJERAG→RHODES`，与游戏数据 `clue_data.json` 一致），**不可用 `board[index]` 下标判断** |
| `own` | 自有库数量，**含已置入线索**，上限 10（游戏内 N/10 口径） |
| `sharing` | 线索交流进行中；开启交流**不要求** board 集齐 7 条（实测只置入 4 条仍为 true） |

封装：`src/core/status/building.ts` 的 `CLUE_SERIES` / `CLUE_OWN_MAX` / `clueBoardSlots()`，
回归测试见 `src/core/status/building.test.ts`（`clueBoardSlots` describe）。

## 六、验证记录

以抓包样本（currentTs=1788543048，快照落后 28.24 小时）按上述公式推算：

- 疲劳干员 = 发电 3 + 贸易 6 + 会客 2 + 人力 1 = **12**，与 App 首页「干员疲劳 12」一致；
- 制造站 4 间因生产上限封顶外推，12 人均不疲劳（产能排空后停止消耗）；
- 宿舍 4 间全部恢复满值；
- 无人机 235/235、制造进度 74/74 亦与 App 显示一致。

### 无人机恢复速率（含充能加成）

`labor.remainSecs` 以 `lastUpdateTime` 为基准、表示恢复至满尚需的秒数，**已包含发电站的
无人机充能速度加成**（抓包核实见 `skland_dump/building_api/drone-rate-sample.json`，
+60% 加成账号三快照交叉验证，速率恒 ≈ 224.73 秒/架 = 360/1.6）：

> **勘误（2026-09-08）**：旧版本此处写作「控制中枢进驻技能的加成」，**是错的**。
> 核对 `building_data.json` 全部 buffs：含「无人机充能速度」的基建技能共 36 个，
> `roomType` **全部为 POWER**，控制中枢不产生任何充能加成。

```
实际速率（秒/架） = remainSecs / (maxValue − value)   // 已满或 remainSecs ≤ 0 时回退基准 360
当前数量          = value + round(elapsed / 实际速率)  // 封顶 maxValue
```

注意：与训练室 `remainSecs`（以响应 currentTs 为基准）不同，labor 的锚点是 lastUpdateTime。
封装见 `droneRecoverySeconds()` / `droneSpeedBonusPercent()` / `computeDroneCount()`
（`src/core/status/building.ts`）；面板顶部无人机行的「+N%」徽标即充能加成，
快照无法推导（已满）时不显示。rhodes-headquarters 的固定 360 秒/架口径未含加成，已在本项目修正。

加成百分比的显示口径：`value` 为下取整值（真实剩余架数 R ∈ (D−1, D]，D = maxValue − value），
速率单快照只能给区间，直接对 `remainSecs/D` 估计值四舍五入会系统性偏高（+60% 账号
可能显示 +61%）。`droneSpeedBonusPercent` 取加成区间
`(360(D−1)/remainSecs − 1, 360D/remainSecs − 1]` 的中点再取整，三份抓包快照与
下取整边界构造均收敛到真实值；剩余架数 < 30（区间过宽，临近充满）时不显示。

### 发电站单站数值（电力与充能）

两个数值**都不在接口里**：`powers[]` 每站只有 `slotId` / `level` / `chars[]`
（决定性核实：2026-09-08 会话 17,709 个 Reqable 抓包文件全量搜索，无任何接口返回
电力或充能数值），必须用 `level` + `charId` + 干员练度本地推导。

**电力**（面板「270(33.3%)」行）—— 游戏数据 `building_data.json`：

| 项 | 口径 |
|---|---|
| 单站发电量 | `rooms.POWER.phases[].electricity` = **60 / 130 / 270**（Lv1/2/3），`maxCount: 3` |
| 括号百分比 | 单站占**全基地总供电**之比 = 270 / 810（3 站 Lv3 → 各 33.3%） |

电力账核对（抓包账号）：供电 810，快照内房间耗电 −800，加上快照缺失的加工站（−10）
= −810 → 余量 0，恰好满载，印证 810 就是分母。封装 `POWER_ELECTRICITY` /
`powerOutput()` / `powerSharePercent()`。旧实现的公式 `2^(lv-1)*60 + (2^(lv-1)-1)*10`
数值恰好正确但与游戏数据无因果关系，已改为查表。

**充能**（面板「+15%」行）—— 单站 = 基础 + 进驻干员基建技能：

```
单站充能% = 5%（powerData.basicSpeedBuff = 0.05）+ 进驻干员技能%
全基地充能% = Σ 各发电站   ← 与 droneSpeedBonusPercent(labor) 相互印证
```

抓包账号实测（快照 `currentTs=1788853862`，三名干员**均为精英0 Lv1**）：

| 房间 | 干员 | 生效技能 | 基础 | 技能 | 单站 |
|---|---|---|---|---|---|
| 发电站1 slot_15 | 雷蛇 | 脉冲电弧·α（β +20% 需精2） | 5% | 15% | **+20%** |
| 发电站2 slot_16 | 格劳克斯 | 电磁充能·α（β +15% 需精2） | 5% | 10% | **+15%** |
| 发电站3 slot_26 | 格雷伊 | 静电场 | 5% | 20% | **+25%** |
| | | | | 合计 | **+60%** |

与 `labor {maxValue:235, value:2, remainSecs:52364}` → 52364/233 = 224.7 秒/架
= 360/1.6 → +60% **完全一致**，两条独立路径互证。

**技能取档规则**（`powerPlantSkillPercent`）：技能表 `src/assets/drone-charge-table.json`
的每名干员为「技能槽[] → 同槽升级链[]」结构：

- 同槽的 α/β 是**替换**关系（β 需精英2），取「练度已满足的最后一档」；
  练度用快照 `chars[].evolvePhase` / `level` 判定，高精英阶段自动满足低阶条件。
  **不可假设账号已精2**——抓包账号三人全是精0，取 β 会各高 5%、总数错成 +65%/+70%。
- 不同槽可**叠加**（4 名干员有双充能槽），跨槽求和。
- 特殊档：`per10Drone`（巡线框架，每 10 架无人机上限 +1%、封顶 +25%，按 `labor.maxValue`
  计算，235 上限 → +23%）、`ramp`（技术交流·α/β 随连续工作小时爬升，取终值）。
- **条件型档位 6 个不计入**（如「凯尔希进驻中枢 +5%」「每有 1 名莱茵生命干员 +3%」），
  需要快照外的阵营/子职业元数据；命中时置 `partial`，面板在数值后标 `*` 并在 title 说明。

表由 `scripts/build-drone-charge-table.mjs` 从 `building_data.json` 生成
（32 名干员 / 45 档，源表 5MB 不入库，下载方式见脚本头注释）；脚本对
`powerData.basicSpeedBuff`、`rooms.POWER.electricity`、未知描述句式、
新增充能槽结构均**断言失败**而非静默跳过。

电力与充能是两套独立系统（电力只约束建筑建造/升级上限，不影响充能）。
回归测试见 `src/core/status/building.test.ts`（"抓包回归：2026-09-08 三发电站" describe）。

## 七、工作区概况与房间容量

游戏基建「工作区情况」显示进驻干员 N/M 与房间数量；口径为**工作区**（中枢/发电/制造/贸易/
人力/训练/会客/加工站），宿舍为非工作区不计入。

每级可进驻人数（charCapacity）来自游戏数据 `building_data.json` 的
`rooms.*.phases[].maxStationedNum`（2026-09-06 核实）：

| 设施 | 每级容量 |
|---|---|
| 控制中枢 | 1/2/3/4/5 |
| 发电站、人力办公室 | 恒 1 |
| 制造站、贸易站 | 1/2/3 |
| 训练室、会客室 | 恒 2 |
| 宿舍 | 恒 5 |
| 加工站 | 恒 1 |

**加工站（WORKSHOP）不在森空岛 player/info 快照中**（building 下仅有
furniture/elevators/corridors 等附加字段）。对账样本
`skland_dump/building_api/building-overview-sample.json`：快照算得工作区 13 间/28 人/上限 31，
游戏同刻显示 14 间/28 人/上限 32——房间数与上限各差 1（加工站），进驻数一致。

训练室教官/学员不在 `chars` 数组中，`buildingOverview` 已单独计入。
封装：`ROOM_CAPACITY` / `roomCapacity()` / `buildingOverview()`，见 `src/core/status/building.ts`。

房间序号（面板卡片标题「制造站1/宿舍1-4…」的编号口径）：`slotId` 为基建全局槽位号、
真实抓包格式为 `slot_25`/`slot_28` 这类带 `slot_` 前缀的字符串（决定性样本：
`skland_dump/building_api/player-info-slot-sample.json`，2026-09-08 抓包，账号 3 贸易/
3 制造/3 发电/4 宿舍全量在库），面板提取其中的数字、同类房间按该数字升序排名（1 起），
与游戏内同类房间沿基建槽位顺序编号一致。**注意 API 返回的房间数组顺序不保证升序**
（样本 powers=[slot_26, slot_16, slot_15]），必须排序后取排名，不能按数组下标编号。
制造站/贸易站/宿舍/发电站无论数量始终编号（单间也显示 贸易站1/宿舍1）；
会客室/人力办公室/训练室/控制中枢等单间设施不编号。封装见 `roomSlotNumber()`。
如编号与游戏实机不符请以抓包样本修正。

该样本同时佐证：`meeting.clue.board=[]` 且 `sharing=true`（板为空时照样交流中，
证实 board 是紧凑列表语义）；`training.trainer` 可为 `null`（仅学员进驻）；
进驻干员含 `bubble`/`workTime`、贸易订单含 `isViolated` 等本插件未建模字段；
labor value=2/235、remainSecs=52364 → 224.7s/架 = 360/1.6（+60% 充能加成账号，
与 `drone-rate-sample.json` 交叉一致）。

## 八、其他字段观察

- 贸易站 `stockLimit` 为服务端按技能加成后的值（同账号 3 间 lv3 贸易站出现 10/14/10，
  14 应为「喀兰之主」类订单上限技能加成）；`stock[].delivery/gain` 为订单交付/收益条目。
- 游戏内逐干员的「心情消耗/时」「生产力」加成与「剩余时间」倒计时按进驻干员基建技能
  计算，`building.*.chars` 只有 `charId`、不含技能数据，插件不做该口径的展示
  （曾按快照差分实测速率展示「心情/时」与生产力，与游戏内展示口径不符，已于
  2026-09-07 回退，见第十节备查）。
  注：这**不等于**"基建技能无法从快照推导"——顶层 `chars[]` 有 `evolvePhase`/`level`，
  配合静态技能表即可定位生效档位，发电站充能加成即按此实现（见第六节）；受限的是
  心情消耗/生产力这类需要逐技能数值建模的口径。
- 游戏内进驻干员的「剩余时间」倒计时与心情无关（实测同一房间干员心情不同但倒计时
  相同：16:45:14、14:48:33），应为房间生产完成时刻（`completeWorkTime` 口径）。
- 快照 `building.elevators/corridors` 为电梯/廊道结构房间（恒 1 级，不参与进驻）。

## 九、训练室（training）字段语义

抓包核实（样本 `skland_dump/building_api/training-remainsecs-sample.json`，Reqable record 2478）：

| 字段 | 语义 |
|---|---|
| `trainee.targetSkill` | 正在专精的技能序号（1-3）；空闲时 trainee 对象仍在但为 -1，未进驻为 null |
| `remainPoint` | 剩余训练点数（未按速度折算），-1 = 空闲 |
| `speed` | 训练速度倍率（1 + 加成），1.35 即 +35% |
| `remainSecs` | 剩余秒数，**以响应 `currentTs` 为基准**（非 `lastUpdateTime`），-1 = 空闲 |

关键算式（实测，误差 <1 秒）：

```
remainSecs ≈ remainPoint / speed − (currentTs − lastUpdateTime)
完成时刻 = currentTs + remainSecs = lastUpdateTime + remainPoint / speed
```

消费时必须用同一响应的 `currentTs` 配对 `remainSecs`；封装见
`trainingCompleteTimeSec()` / `trainingSpeedBonusPercent()`（`src/core/status/building.ts`）。

技能名称与专精等级（专精一/二/三）**可以**推导：`player/info` 的 `chars[]` 完整结构含
`skills: [{ id, specializeLevel }]`（槽位顺序 1-3，抓包核实见
`skland_dump/building_api/training-skill-sample.json`），数据链在同一响应内闭合：

```
training.trainee.targetSkill 为 chars[].skills 数组的 0 起下标（-1 = 空闲）
  → chars[] 中学员 skills[targetSkill]
训练目标专精等级 = specializeLevel + 1
技能名 = 本地干员表该干员同下标技能名（skills[].skillId 两边逐一对应）
```

> 索引口径由双快照核实（`skland_dump/building_api/training-skill-sample.json`）：
> targetSkill=2 的训练完成后，skills[2]（第 3 技能）专精 0→1 而 skills[1] 不变，
> 证明是 0 起下标而非 1 起槽位号；曾按 1 起解读导致技能定位错误，已修正。

封装见 `trainingSkillInfo()` / `specializeLevelText()`（`src/core/status/building.ts`）。
技能名表来自精简干员表第三元素（`scripts/build-operator-table.mjs` 生成）：源表
`character_table_simple.v2.json` 的 `skills[].skillName` 为主；源表未收录的新干员由
`assets-source/skill-name-extra.v1.json` 补充（提取自 ArknightsGameData 的
character_table + skill_table：TIER_1+ 干员，`{ [charId]: [rarity, [技能名...]] }`，
技能名取 skill_table `levels` 末级 name）。极新干员两表都缺时技能名回退为「技能N」。

## 十、心情消耗速率差分实测（备查，未接入插件）

> 本节记录的是**抓包数据分析结论**（样本 `skland_dump/building_api/mood-rate-sample.json`，
> 两次 player/info 快照间隔 1802 秒），供后续参考。据此实现的「心情/时」「生产力」展示与
> 实测速率外推与游戏内展示口径不符，已于 2026-09-07 整体回退，封装代码已移除。

### 关键机制：ap 是懒结算值

`chars[].ap` 是 `lastApAddTime` 时刻的结算值（非响应 `currentTs` 时刻），真实当前值 =
`ap − 速率 × (now − lastApAddTime)`。因此**同一干员跨两次快照**：

```
速率（ap 单位/秒） = (ap₁ − ap₂) / (lastApAddTime₂ − lastApAddTime₁)
点/时 = 速率 / 100
```

### 实测结论

- **速率跟人不跟房间**：换班把干员从 slot_7 平移到 slot_25 后速率不变（0.65/0.95/0.55
  点/时均复现），差分按 charId 追踪即可，无需房间配对。
- 实测速率全部落在 **0.05 的整数倍**（0.55/0.65/0.75/0.95/0 点/时）；**0 是合法值**
  （存在心情消耗归零的进驻技能，如 char_101_sora 组，ap 长期不变）。
- 同房间不同干员速率可以不同（贸易站 0.95/0.55/0.65 并存）。
- 快照不含速率字段（`chars[].skills` 为战斗技能），差分是唯一的快照内推导途径。

### 回退原因与注意事项

- 差分速率是干员在**抓包间隔内**的真实消耗，但展示时点与快照时点之间干员可能已换班/
  进出宿舍，历史速率与新位置脱节；快照 `speed` 与游戏房间生产力明细的对应关系也未核实
  （游戏明细为逐干员贡献 1 + Σ技能加成，房间与快照 slot 的映射会因换班漂移）。
- 若将来重新引入，须先解决上述口径漂移问题，且不得按「心情耗尽倒计时」解读游戏内
  逐干员「剩余时间」（那是房间生产完成时刻，见第八节）。
