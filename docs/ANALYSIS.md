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

无业务参数。响应 `data.content` 为 base64(JSON)：

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

### 2. GET /api/v1/game/assist/user-info?uid={uid} — 玩家游戏身份

```json
{"gameNickname":"慕长秋#5721",
 "gameAvatar":{"type":"ICON","id":"avatar_special_MissC","url":"https://web.hycdn.cn/arknights/game/assets/avatar/avatar_special_MissC.png"},
 "isOfficial":true,"isAuth":true}
```

进入检索页时以自己 uid 调用，校验当前账号是否绑定/认证了明日方舟游戏身份。样本：`assist-user-info.json`。

### 3. POST /api/v1/game/assist/search — 助战检索（核心）

请求体（Content-Type: application/json）：

```json
{
  "uid": "25186623",              // 自己的游戏 uid
  "charId": "char_4217_makoto",   // 目标干员
  "level": {"evolvePhase": 2, "level": 1},   // 精英化/等级筛选
  "skill": {"id": "skchr_makoto_3", "level": 4},  // 技能位筛选（0 = 不限）
  "equip": {"id": "uniequip_002_makoto", "level": 3} // 模组筛选（空串 = 不限）
}
```

筛选条件在 UI 上逐步叠加（本次会话共 8 次不同参数的搜索，完整演化见
`search-request-evolution.json`）：先按干员搜，再分别加等级、技能（1 技能→3 技能、练度 4）、模组（专属模组 lv3）。

响应 `data.content` 同样是 base64(JSON)：

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
结果中的干员头像/立绘/技能图标/模组图标随后从 CDN 拉取：
`web.hycdn.cn/arknights/game/assets/{char/portrait/char_*_*.png, char_skill/skchr_*_N.png, avatar/*.png, uniequip/type/*.png}`，
潜能图标在 `bbs.hycdn.cn/public/skland-web/image/tool/arknights/assets/potential/`。

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

- `data.content` base64 包装是 zonai 列表类接口的通用做法（贴纸列表等同样如此），解码后才是真实业务 JSON。
- zonai 业务响应统一为 `{"code":0,"message":"OK","timestamp":"<s>","data":{...}}`，code=0 成功；401 时 code=10002 用户未登录。
- 搜索接口没有观察分页字段；三次相同参数连发（刷新按钮）返回条目顺序不同（疑似服务端乱序/随机），`hasSend` 会随申请状态更新。
- 会话在 15:23:43 出现两次 401 后自动重登（generate_cred_by_code → user/info → 全量刷新），说明 cred 过期由客户端自动续期，抓包分析时无需人工干预。
