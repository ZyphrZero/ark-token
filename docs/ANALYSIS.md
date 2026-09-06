# 森空岛「助战检索」接口分析

数据来源：Reqable 抓包（emulator-5554 / com.hypergryph.skland 1.62.0，2026-09-04 13:57–15:36 会话），
样本文件与本目录下 `*.json` 对应。敏感字段（cred/sign/xsm/wtoken）在样本里已截断。

## 一、功能架构

助战检索不是纯原生页面，入口由服务端配置下发：

```
用户配置接口 (user/config 等)
  └─ data.staticConfig.assistSearchOn = true
     data.staticConfig.assistSearchUrl = "https://game.skland.com/arknights/support?header=0"
        （MMKV userConfig 缓存中已验证，实际加载时追加 &bg_color=1e1e1e&hg_media=skland）

App 内 WebView 加载该页面（game.skland.com/arknights/support）
  └─ 页面 JS 通过 JSBridge 调用原生 Okhttp（dex 内字符串 assistConfig / assistSearchUrl）
      └─ 原生携带签名头请求 zonai.skland.com /api/v1/game/assist/* 与 /api/v1/game/friend
```

实际抓到的请求均为原生 Okhttp 发出（UA：`Skland/1.62.0 (com.hypergryph.skland; build:106200040; Android 32; ) Okhttp/4.11.0`，HTTP/2）。
页面产生的埋点走 `POST event-log-api-data-lake-prod-cn.hypergryph.com/batch_event`（body 内 `#url` 即 support 页地址）。

## 二、接口清单

### 1. GET /api/v1/game/assist/info — 检索配置（干员目录）

无业务参数。响应包装随客户端而异（2026-09-04 实测）：插件/Web 请求头（platform=3/vName=1.2.0）
返回 `data` 即明文业务 JSON；Android 客户端抓包存在 `data.content` 为 base64(JSON) 的形态。
`src/core/sklandAssist.ts` 的解析对两种形态均兼容，详见 `ASSIST_RESPONSE_PARSER_BUG.md`。明文形态：

```json
{
  "characters": [   // 431 项，全部可选干员
    {"id":"char_2013_cerber","name":"刻俄柏","rarity":5,"profession":"CASTER",
     "skills":[{"id":"skchr_cerber_1","name":"“很冰的斧”"}, ...]}
  ],
  "levelMax": [     // 13 项，精英化等级上限表
    {"evolvePhase":0,"rarity":0,"maxLevel":30}, ...
  ]
}
```

样本：`assist-info-characters.json`（约 46 KB）。用于检索页的干员选择器和等级筛选。

官方 support 页拉取后会对 `characters` 做预处理与排序（`main-7bd12dde` 模块 70127）：

```
t.rarity++（0-based → 1-based）
有模组的干员在 equips 头部插入 {id:"", name:"<干员名>证章"} 伪模组（模组筛选可检索"无模组"）
characters.sort：
  ① rarity 降序（6★→1★）
  ② profession 按 ["PIONEER","WARRIOR","TANK","SNIPER","CASTER","MEDIC","SUPPORT","SPECIAL"]
     （先锋→近卫→重装→狙击→术师→医疗→辅助→特种）顺序，未知职业排最后（比较器 eP，模块 57459）
  ③ id 字符串升序（char_002_amiya < char_103_angel < char_2013_cerber，即实装序号在前）
```

`isNew` 字段为服务端标记的新干员（官方页仅用于头像"NEW"角标，不参与排序）。插件按产品需求
将 `isNew` 干员置顶为独立分组展示，并在接口类型 `AssistCharacter.isNew` 中显式封装该标记。

### 2. GET /api/v1/game/assist/user-info?uid={uid} — 玩家游戏身份

```json
{"gameNickname":"慕长秋#5721",
 "gameAvatar":{"type":"ICON","id":"avatar_special_MissC","url":"https://web.hycdn.cn/arknights/game/assets/avatar/avatar_special_MissC.png"},
 "isOfficial":true,"isAuth":true}
```

进入检索页时以自己 uid 调用，校验当前账号是否绑定/认证了明日方舟游戏身份。样本：`assist-user-info.json`。

`isAuth` 对应森空岛「游戏关系」隐私开关（明日方舟 = gameId 1）。官方 support 页在 `isAuth=false` 时
弹确认框并调用 `POST /api/v1/user/privacy`，body 为
`{"games":{"privacy":{"1":{"gameRelationOn":true}}}}`，成功后重新初始化（isAuth 变为 true，检索可用）。
插件在助战页提供等价的「开启游戏关系」按钮（`authorizeAssistSupport`）。

### 3. POST /api/v1/game/assist/search — 助战检索（核心）

请求体（Content-Type: application/json）：

```json
{
  "uid": "25186623",              // 自己的游戏 uid
  "charId": "char_4217_makoto",   // 目标干员
  "level": {"evolvePhase": 2, "level": 1},   // 精英化 + 等级需求；level 是模式值：
                                             // 0=不限、1=所选精英化满级、2=精二 ≥N 级
                                             // （N 官方按星级硬编码：6★60、5★50、4★40；
                                             //   仅 4~6 星且已选精二、干员有模组时提供该选项，
                                             //   3★ 最高精一、1~2★ 仅精0，由 levelMax 表决定）
  "skill": {"id": "skchr_makoto_3", "level": 4},  // 技能位 + 技能需求筛选：
                                                // level 0=不限、1=RANK 7、2~4=专精 1~3
                                                // （官方 support 页 JS 标签函数确认，抓包样本 level:4 即专精3）
  "equip": {"id": "uniequip_002_makoto", "level": 3} // 模组筛选（空串 = 不限）
}
```

筛选条件在 UI 上逐步叠加（本次会话共 8 次不同参数的搜索，完整演化见
`search-request-evolution.json`）：先按干员搜，再分别加等级、技能（1 技能→3 技能、练度 4）、模组（专属模组 lv3）。

**筛选器默认值与联动**（官方 support 页 `select()`/`setFilter()`，插件 AssistSearchPage 同步实现）：

- 选择干员后默认：精英化 = 该稀有度最高阶段、等级需求 = 不限；技能 = 第一个技能、需求 = 不限；
  模组 = 证章（官方在有模组的干员 equips 头部注入 `{id:"", name:"证章"}`）、等级 = 0。
- 精英化、技能位、模组为必选（下拉无"不限"项）；等级需求、技能需求保留"不限"。
- 切换精英化：等级需求重置不限；技能位超出阶段允许数（E0→仅 1 技能、E1→前 2 个、E2→全部）时
  重置为第一个技能并降回不限；技能需求超出阶段档位（E0→[0]、E1→[0,1]、E2→[0,1,2,3,4]）时降回不限；
  非精二移除模组筛选（显示"无模组"），回到精二且无选择时默认证章。
- 模组等级选项：证章 → 仅[0]（不限）；真实模组 → [1,2,3]（无"不限"），切换模组时等级重置为 1（证章为 0）。

响应 `data` 与 assist/info 相同：Web/插件端为明文业务 JSON（官方 support 页 JS 直接读取 `data.list`，
无解码步骤），Android 端为 base64 `content` 包装：

```json
{"list": [
  {"uid": "51151653",            // 对方的游戏 uid
   "name": "白屿#0414",
   "level": 120,                 // 主账号等级
   "avatar": {"type":"ICON","id":"avatar_special_56","url":"..."},
   "lastOnlineTs": "1788504104", // 最后在线时间(秒)
   "userId": "101472",           // 森空岛平台 userId（与游戏 uid 不同）
   "assistChars": [              // 对方设置的 3 个助战位
     {"charId":"char_4217_makoto","skinId":"","level":90,"evolvePhase":2,
      "potentialRank":4,"skillId":"skchr_makoto_3","mainSkillLvl":7,
      "rarity":5,"specializeLevel":3,          // 专精等级
      "equip":{"id":"uniequip_002_makoto","level":3,"locked":false,
               "typeName":"pum-y","shiningColor":"yellow"},  // 模组；未开模组时为 null
      "profession":"SPECIAL"},
     ... ],
   "hasSend": false,             // 是否已向对方发过好友申请
   "gameDetailOn": true}         // 对方是否公开游戏详情
]}
```

单次返回 4 条结果。样本：`assist-search-response.json`。
结果中的干员头像/技能图标/模组图标随后从 CDN 拉取（2026-09-05 实测验证）：
`web.hycdn.cn/arknights/game/assets/` 下
- 干员头像（无皮肤）：`char/avatar/{charId}.png`（注意 `char/portrait/{charId}.png` 是竖版立绘，
  `char/portrait/{charId}_1.png` 不存在）
- 干员头像（有皮肤）：`char_skin/avatar/{encodeURIComponent(skinId)}.png`（skinId 含 `#` 需编码）
- 技能图标：`char_skill/{skillId}.png`；玩家头像：`avatar/{id}.png`；模组图标：`uniequip/type/{typeName}.png`。

另有静态小图标（官方 support 页模块 95892 哈希映射表，插件 `src/popup/assist/assets.ts` 已内置同表）：
`bbs.hycdn.cn/public/skland-web/image/tool/arknights/assets/` 下
- 职业图标：`profession/{black|white}/{hash}.png`（8 职业 × 两色）
- 潜能图标：`potential/{hash}.png`（potentialRank 0~5 共 6 档）
- 精英化图标：`evolve-phase/{hash}.png`（E0/E1/E2）
- 稀有度背景：`character-background/{hash}.png`、物品背景 `item-background/{hash}.png`（1~6 星）。

### 4. POST /api/v1/game/friend — 向检索结果发送好友申请

请求体：`{"uid":"25186623","targetUid":"19719455"}`（targetUid = 结果项里的游戏 uid）。
响应：`{"code":0,"message":"OK","timestamp":"..."}`（data 为 null）。
申请成功后，后续 search 结果里该玩家的 `hasSend` 变为 true。
本次会话共发送 4 例（882055434 / 100792512 / 84530254 / 19719455 / 429641844），
请求-响应对见 `friend-apply-pairs.json`。
dex 中另有 `/api/v1/game/friend/list`（好友列表，属于消息页模块，不在检索主流程）。

## 三、请求头与签名

assist/search 实整请求头见 `assist-search-request-headers.json`。除常规头外：

| 头 | 含义 |
|---|---|
| cred | 森空岛凭证（`/web/v1/user/auth/generate_cred_by_code` 返回的 cred） |
| sign | 请求签名 |
| timestamp | 签名所用秒级时间戳 |
| did | 设备 ID（39cbf90f60e6a190） |
| platform / os / vname / vcode / nid / language / channel / manufacture / rid | 客户端元数据（1 / 32 / 1.62.0 / 106200040 / 1 / zh-cn / OF / Xiaomi / 请求随机 id） |
| xsm / wtoken / is_new_tiger | 数美设备指纹相关 token |

签名算法（与目录内 `_skyland_reference.py` 的实现一致）：

```
header_ca = {"platform":"1","timestamp":"<ts>","dId":"<did>","vName":"1.62.0"}
raw = path + body_or_query + timestamp + json(header_ca)   // GET 用 query 串，POST 用 JSON body
sign = md5( hex( hmac_sha256(key=cred_token, msg=raw) ) )  // cred_token 为 generate_cred_by_code 返回的 token
```

## 四、一次完整检索的时序（本次抓包实测）

1. `GET game.skland.com/arknights/support?header=0&bg_color=1e1e1e&hg_media=skland`（WebView 页面，2.90 KB）
2. `GET /api/v1/game/assist/user-info?uid=25186623`（校验自己的游戏身份）
3. `GET /api/v1/game/assist/info`（拉干员目录，仅首次/过期后）
4. `POST /api/v1/game/assist/search`（每次改筛选条件都整体重查，无分页参数）
5. `GET web.hycdn.cn/...`（结果中干员图片批量加载）
6. `POST /api/v1/game/friend`（点"添加好友"时）
7. `POST batch_event`（页面埋点）

## 五、备注

- assist 系列接口的响应包装随客户端而异：插件/Web 请求头实测 `data` 为明文业务 JSON；Android 客户端
  抓包存在 `data.content` base64 包装。机制：App 请求头携带 `x-transformed: base64`，服务端据此返回
  base64 包装；Web/插件不携带该头，直接返回明文。最初文档只记录了 base64 形态导致解析只按 base64 实现，
  是 "缺少 Base64 content" 报错的根因；现两种形态均已兼容（见 `ASSIST_RESPONSE_PARSER_BUG.md`）。
- zonai 业务响应统一为 `{"code":0,"message":"OK","timestamp":"<s>","data":{...}}`，code=0 成功；401 时 code=10002 用户未登录。
- 凭证失效的完整形态是 **HTTP 401 + body `{"code":10002,"message":"用户未登录"}`**（样本：`skland_dump/CAPTURE_STATUS.txt`、
  `skland_dump/SKLAND_CAPTURE_SUMMARY.md`）。客户端必须解析非 2xx 响应体中的业务码（`src/core/skland.ts` 的
  `requestSkland`、`src/core/sklandAssist.ts` 的 `requestAssistEnvelope`），且 HTTP 401 本身即未授权信号
  （`isSklandCredentialExpired`），否则 `code` 随 401 返回时会被当成普通 HTTP 错误，hgToken 自动续凭证链路不触发——
  这曾是"支持凭证自动刷新"账号仍需手动刷新凭证的根因（回归用例：`src/core/skland.test.ts`、`src/core/sync.test.ts` 中
  的 401+10002 用例）。插件侧另在面板定时刷新中对凭证年龄超过 24h 的账号主动续期一次
  （`src/background/infoRefresh.ts` 的 `CREDENTIAL_PROACTIVE_REFRESH_MS`）。
- 搜索接口没有观察分页字段；三次相同参数连发（刷新按钮）返回条目顺序不同（疑似服务端乱序/随机），`hasSend` 会随申请状态更新。
- 会话在 15:23:43 出现两次 401 后自动重登（generate_cred_by_code → user/info → 全量刷新），说明 cred 过期由客户端自动续期，抓包分析时无需人工干预。
