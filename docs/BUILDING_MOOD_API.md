# 森空岛「基建干员心情/疲劳」接口语义分析

数据来源：2026-09-05 经 Reqable 抓取森空岛 App v1.62.0（`com.hypergryph.skland`）的
`GET https://zonai.skland.com/api/v1/game/player/info?uid={uid}&userId={userId}` 响应，
样本存于 `skland_dump/building_api/`（`player-info-app-raw.json` 为原始响应，
`player-info-app-decoded.json` 为解码后 JSON，昵称已脱敏）；
计算逻辑还原自 App 前端 bundle `_web_inspect/main-0a037d97.3091b5d8.js`。

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

## 五、验证记录

以抓包样本（currentTs=1788543048，快照落后 28.24 小时）按上述公式推算：

- 疲劳干员 = 发电 3 + 贸易 6 + 会客 2 + 人力 1 = **12**，与 App 首页「干员疲劳 12」一致；
- 制造站 4 间因生产上限封顶外推，12 人均不疲劳（产能排空后停止消耗）；
- 宿舍 4 间全部恢复满值；
- 无人机 235/235、制造进度 74/74 亦与 App 显示一致。

回归测试见 `src/core/status/building.test.ts`（"抓包数据回归" describe）。
