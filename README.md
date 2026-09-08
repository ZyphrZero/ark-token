# ark-token（一图流多账号浏览器插件）

面向 [明日方舟一图流](https://ark.yituliu.cn/) 的 Chrome/Edge 浏览器插件（Manifest V3，React + Vite + TypeScript）。

**功能**：

- 管理多个明日方舟账号（扫码登录 / 官网 HG Token / 森空岛凭证三种方式添加），点击切换当前账号
- **状态面板**：弹窗即完整面板——博士信息头、理智实时恢复倒计时、公开招募 4 槽位状态与倒计时、基建（无人机/制造站库存/贸易站订单/宿舍心情/发电量/会客室线索/训练室）、剿灭/保全/日常周常任务进度；数据来自森空岛 `player/info`，仅缓存本机展示，实时数值按时间戳前端推算
- **桌面通知**：公招招募完成（3 分钟内先后完成的槽位合并为一条）、理智完全恢复、训练室专精完成（附技能名与目标专精等级）时发送系统通知；可按需在设置中开关
- 一键（或定时）从森空岛拉取最新干员练度与仓库材料，通过一图流**写 token** 上传到 `POST /open-api/operator/upload`
- 配置**读 token** 后，同步完成自动调用 `GET /open-api/operator/info` 校验远端数据
- **自动获取读写 token**：浏览器已登录一图流官网时，从标签页读取会话并复用/生成第三方 API Token，免去手动复制；读写 token 全局一对，在「设置」中配置、所有游戏账号共用
- 凭证失效时，若账号存有官网 HG Token 会自动刷新森空岛凭证并重试
- **助战检索页面**：在弹窗博士信息头点击「助战检索」，可按干员、精英化、等级、技能、技能等级、模组和模组等级筛选助战，并查看玩家与助战干员图标；结果支持按游戏 UID 添加好友
- 所有 token / 凭证只保存在本机 `chrome.storage.local`，不写入日志、不上报
- **主密码加密**：森空岛凭证、HG Token、读写 token 以 AES-GCM 加密落盘，主密码本身不保存，防止浏览器数据文件被第三方软件读取后直接还原凭据

> 状态面板的视觉与计算逻辑移植自 [rhodes-headquarters](https://github.com/AEtherside/rhodes-headquarters)（罗德岛远程指挥部 P.R.R.H），在此感谢。

## 使用方法

### 安装（开发者模式加载）

```bash
npm ci          # 安装依赖
npm run build   # 类型检查 + 打包到 dist/
```

1. 打开 Chrome/Edge 的 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选择本项目的 `dist/` 目录

### 添加账号

1. 点击浏览器工具栏的插件图标 → 「＋添加账号」（或右键图标 → 选项）
2. 任选一种登录方式获取森空岛凭证：
   - **扫码登录（推荐）**：用手机森空岛 APP 扫二维码
   - **官网 HG Token**：登录 [ak.hypergryph.com](https://ak.hypergryph.com/user/home) 后，把访问 `web-api.hypergryph.com/account/info/hg` 得到的 JSON 粘贴进来；浏览器已登录官网时可「一键读取」
   - **森空岛凭证**：与一图流网站导入教程一致，登录森空岛网页后在控制台执行
     `copy(localStorage.getItem('SK_OAUTH_CRED_KEY')+','+localStorage.getItem('SK_TOKEN_CACHE_KEY'))`，粘贴复制结果
3. 勾选要添加的明日方舟账号（一个凭证可绑定多个游戏账号）

添加完成后，打开插件弹窗并点击顶部账号切换按钮，可在账号切换卡片的「添加好友」区域输入目标玩家的游戏 UID，向该 UID 发送好友申请。后台会使用当前选中的账号凭证；昵称和森空岛平台 `userId` 不能代替目标游戏 UID。

### 助战检索与好友申请

在插件弹窗的博士信息头点击「助战检索」进入独立页面。页面会加载森空岛实时助战目录，可按干员、精英化阶段、等级、技能、技能等级、模组和模组等级筛选；检索结果会展示玩家信息、助战干员头像/立绘、技能图标、模组图标和潜能等数据。图片来自森空岛 CDN，网络异常或资源下线时会自动显示文字占位。

结果卡片中的「添加好友」使用对方的明日方舟游戏 UID 发送申请；`userId` 是森空岛平台 ID，不能代替游戏 UID。好友申请由后台使用当前账号凭证执行，凭证不会传给页面。

底层 API 位于 `src/core/sklandAssist.ts`：

- `fetchAssistInfo`：获取干员目录和等级上限
- `fetchAssistUserInfo`：按游戏 UID 获取游戏身份
- `searchAssist`：按干员、等级、技能和模组检索助战玩家
- `addFriendByUid`：使用 `{ uid, targetUid }` 发送好友申请
- `authorizeAssistSupport`：开启明日方舟「游戏关系」（官方"身份认证"，isAuth=false 时检索前需要）

助战 API 使用当前账号已有的森空岛凭证，不需要额外配置一图流 token；`src/core/sklandAssist.ts` 提供底层接口，弹窗页面通过后台消息调用。

#### 开箱即用封装（`src/core/assist/`）

筛选规则、默认值、级联与图标 URL 已封装为可复用模块，其他开发者只需从 `src/core/assist` 导入即可获得完整能力（含官方语义的默认筛选与联动，无需了解请求细节）：

```ts
import { createAssistSearchSession } from '../core/assist'

// cred/token 为森空岛凭证；autoAuthorize 可在未开启游戏关系时自动授权
const session = await createAssistSearchSession(uid, cred, token, { autoAuthorize: true })

const filter = session.createFilter(session.characters[0].id) // 官方默认：最高精英化/第一技能/证章
const result = await session.search(filter)                   // 组装请求并检索（单次 4 条）
```

也可单独使用纯函数：`filterAssistCharacters`（排序+过滤）、`createDefaultFilter` / `applyEvolvePhaseChange`（默认值与级联）、`getSkillRequirementOptions` 等选项生成、`buildAssistSearchRequest`（请求组装）、`assistCharacterUrl` 等图标 URL。规则来源与逆向依据见 `docs/ANALYSIS.md`。

### 配置一图流读写 token

在插件「设置」页配置（读写 token 全局一对，所有游戏账号共用）。推荐**自动获取**：点「自动获取读写 token」（需浏览器已登录 [ark.yituliu.cn](https://ark.yituliu.cn/)）。插件会从一图流标签页读取登录会话，官网已生成的对应 token 直接复用，缺失的权限自动生成并保存。

自动获取失败（未登录 / 无一图流标签页 / 接口异常）时再手动操作：到一图流官网 [用户中心 → 第三方 API Token](https://ark.yituliu.cn/account/home) 生成：

- 「只读 Token」→ 填入插件的**读 token**（用于同步后校验，可选）
- 「只写 Token」→ 填入插件的**写 token**（上传数据必填）

注意：同一权限重新生成 token 会使旧 token 失效。之后在插件弹窗中点「立即同步」即可更新数据。

### 主密码与解锁

- 首次添加账号时会要求设置**主密码**（至少 8 个字符）；也可在「设置 → 安全」中开启，已存在的明文凭据会自动加密迁移
- 主密码经 PBKDF2（SHA-256，60 万次迭代）派生 AES-GCM 密钥，凭据密文与口令分离：磁盘上只有密文，**主密码本身不落盘、无法找回**
- 解锁密钥只保存在本次浏览器运行的内存中（`chrome.storage.session`），**重启浏览器后自动锁定**，需重新输入主密码；设置页也可「立即锁定」
- 锁定期间无法同步、无法修改凭据；账号列表（UID / 昵称 / 区服 / 同步状态）保持可见
- 忘记主密码只能在「设置 → 安全 → 忘记主密码」中重置：清空全部账号并移除主密码，账号需重新添加

## 目录说明

```
ark-token/
├── AGENTS.md                       # 仓库开发规范（勿删改）
├── manifest.json                   # MV3 清单（popup / options / service worker / 权限）
├── assets-source/
│   ├── character_table_simple.v2.json   # 干员表源数据（复制自 frontend-v2-plus，不打包）
│   └── skill-name-extra.v1.json         # 新干员技能名补充表（提取自 ArknightsGameData，源表滞后时兜底）
├── scripts/
│   ├── build-operator-data.mjs     # 生成全量干员/基建数据表 + 同步技能图标（arkntools 固定 commit + 房间常量 + 本地源表补模组/技能名，走 jsDelivr 国内可达）
│   ├── preview-server.cjs          # 本地静态服务器（视觉预览 dist/ 用）
│   ├── make-popup-mock.mjs         # 构建后注入 chrome mock 生成 dist/src/popup/mock.html（配合 preview-server 预览面板，假数据）
│   └── popup-mock-chrome.js        # mock.html 注入的 chrome API 模拟（仅本地预览，不含真实凭据）
├── src/
│   ├── core/                       # 纯逻辑层（不依赖 DOM / chrome API，可直接单测）
│   │   ├── types.ts                # GameAccount、SecurityConfig、PlayerInfoPayload 等数据模型
│   │   ├── skland-info.ts          # 森空岛 player/info 状态数据类型（理智/公招/基建/任务进度，裁剪版）
│   │   ├── errors.ts               # 错误类型与错误码 → 中文提示映射
│   │   ├── crypto.ts               # 凭据加密（AES-GCM-256 + PBKDF2，WebCrypto）
│   │   ├── skland.ts               # 森空岛签名（HMAC-SHA256+MD5）与数据 API（binding/cultivate/player info）
│   │   ├── sklandAssist.ts           # 助战目录/检索、结果展示数据与按游戏 UID 添加好友 API（底层网络封装）
│   │   ├── assist/                   # 助战检索开箱即用模块（供其他界面/开发者复用，入口 `src/core/assist/index.ts`）
│   │   │   ├── index.ts              # 汇总导出 + createAssistSearchSession 一站式会话（拉目录/校验身份/默认筛选/检索/授权）
│   │   │   ├── filter.ts             # 筛选规则纯函数：干员排序与过滤、默认筛选（官方 select()）、精英化级联（官方 setFilter()）、选项档位、请求组装
│   │   │   ├── assets.ts             # 官方 CDN 图片/图标 URL 构造（干员头像、技能/模组/职业/潜能/精英化图标）
│   │   │   ├── filter.test.ts        # 筛选规则单测
│   │   │   └── index.test.ts         # 会话门面单测
│   │   ├── hgAuth.ts               # 官网 HG Token 换凭证（浏览器直连，失败可降级走后端）与输入解析
│   │   ├── qrLogin.ts              # 森空岛扫码登录（创建二维码 + 轮询）
│   │   ├── yituliuApi.ts           # 一图流 open-api 上传 / 读取封装
│   │   ├── yituliuAccountApi.ts    # 一图流账号会话 API（自动获取读写 token：复用/生成）
│   │   ├── format.ts               # 森空岛干员数据 → 上传格式换算（依赖精简干员表）
│   │   ├── sync.ts                 # 单账号同步编排（凭证失效自动刷新重试）
│   │   └── status/                 # 状态面板实时推算（纯函数：入参 nowMs，不依赖响应式系统）
│   │       ├── sanity.ts           # 理智恢复（每 6 分钟 1 点，锚定 lastApAddTime）
│   │       ├── recruit.ts          # 公招槽位状态机 + 完成通知合并（3 分钟窗口）
│   │       └── building.ts         # 无人机恢复/发电量公式/制造配方表与库存估算/进驻干员心情（按设施外推当前疲劳值，语义见 docs/BUILDING_MOOD_API.md）
│   ├── storage/
│   │   ├── store.ts                # chrome.storage.local 封装（账号增删改 / 激活切换 / 设置与全局 token / 主密码加解密边界与解锁 / 旧版账号 token 迁移）
│   │   ├── infoCache.ts            # 状态面板数据缓存（yituliu-plugin-info-cache，明文游戏状态、不含凭据）
│   │   └── sessionKey.ts           # 解锁密钥会话缓存（chrome.storage.session，仅内存、随浏览器关闭清空）
│   ├── background/
│   │   ├── index.ts                # service worker：同步/面板刷新/助战消息路由 + chrome.alarms 定时同步与面板刷新（锁定时跳过）
│   │   └── infoRefresh.ts          # 面板数据定时刷新 + 公招/理智/训练室专精桌面通知调度（通知 alarm 前缀 yituliu-notify-）
│   ├── security/                   # 安全相关界面（锁定屏 / 主密码设置 / 安全面板，popup 与 options 共用）
│   ├── ui/                         # 罗德岛终端设计系统（popup / options / security 共享）
│   │   ├── tokens.css              # 设计令牌：近黑底 + 白字 + 终端黄交互色、三级文字/线/表面、设施语义色
│   │   ├── ui.css                  # 通用控件：斜切角容器、格纹装饰、按钮/输入/卡片/徽标/分段 Tabs/斜角进度条（含安全组件依赖的类）
│   │   ├── icons.tsx               # 统一内联 SVG 图标库（currentColor 线性风格，24 网格）
│   │   └── components.tsx          # UI 原语：SectionHeader（双语标题）/CutCard/MeterBar/StatReadout/Tag/SegmentedTabs 等
│   ├── popup/                      # 弹窗状态面板与助战检索页
│   │   ├── panel/                  # 面板区块组件（recruit/ 公招、building/ 基建）
│   │   ├── assist/                 # 助战检索页面（业务规则复用 src/core/assist/，本目录只保留表单与渲染）
│   │   ├── useNow.ts               # 实时时钟 hook（驱动倒计时，tick 内不发请求）
│   │   ├── panelActions.ts         # 弹窗 → 后台消息与页面跳转辅助
│   │   └── assets/                 # 字体（Bender/Akrobat）、基建设施与干员心情图标 SVG、building-skills/（529 枚基建技能图标）
│   ├── options/                    # 管理页（账号管理 / 添加向导 / 设置，含状态面板与通知设置）
│   │   └── yituliuSession.ts       # 从一图流标签页读取登录会话（chrome.scripting 胶水）
│   ├── assets/
│   │   └── operator-data.json      # 全量干员/基建数据表（npm run build:operator-data 生成：干员元数据 + 基建技能 + 房间常量）
│   └── utils/time.ts               # 时间/时长格式化
└── dist/                           # 构建产物（加载已解压扩展时选这个目录）
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm ci` | 安装依赖 |
| `npm run dev` | Vite 开发模式（HMR，配合 @crxjs 调试插件页面） |
| `npm run build` | `tsc --noEmit` 类型检查 + 生产构建到 `dist/` |
| `npm test` / `npm run test:watch` | 运行 / 监听 vitest 单元测试 |
| `npm run build:operator-table` | 重新生成精简干员表（游戏出新干员后使用） |

### 本地预览面板（无需加载扩展）

`npm run build` 后执行：

```bash
node scripts/make-popup-mock.mjs   # 生成注入 chrome mock 与假数据的 dist/src/popup/mock.html
node scripts/preview-server.cjs    # 在 http://127.0.0.1:8791 提供静态服务
```

浏览器打开 `http://127.0.0.1:8791/src/popup/mock.html` 即可预览弹窗面板（理智/公招/基建等区块），mock 数据全部为假数据。

### 更新干员表

新干员/新模组上线后：把新版 `character_table_simple.v2.json`（来自一图流前端仓库 `frontend-v2-plus/src/static/json/operator/`）覆盖 `assets-source/` 同名文件，执行 `npm run build:operator-table` 后重新 `npm run build`。表内未收录的干员会在同步时被跳过，以保证星级与模组映射准确。

源表更新通常滞后于游戏新干员，`assets-source/skill-name-extra.v1.json` 提供补充（提取自 ArknightsGameData 的 character_table + skill_table：TIER_1+ 干员的各槽位技能名，含星级），构建时自动合并，保证训练室能显示新干员的技能名与专精等级；提取口径见 `docs/BUILDING_MOOD_API.md` 第九节。

## 与一图流前后端的对接关系（只读参考）

实现依据以下两个仓库的现有接口与算法，本项目不修改它们：

- 后端 `E:\yituliu\BackEndV3`（生产地址 `https://backend.yituliu.cn`）
  - `POST /open-api/operator/upload`：写 token 放 `Authorization` 头（原样、无前缀），报文为 PlayerInfoDTO
  - `GET /open-api/operator/info`：读 token 校验，返回 V2 格式干员数据
  - `POST /survey/hg/cred-token`：官网 HG Token 换森空岛凭证
  - `POST /survey/skland/qr/create` / `POST /survey/skland/qr/check?scanId=`：扫码登录
  - `GET /user/open-api/permissions`：第三方权限列表（读 10001 / 写 10002，无需登录）
  - `GET /api/v1/game/assist/info`：获取助战检索干员目录（响应 `data.content` 为 Base64 JSON）
  - `GET /api/v1/game/assist/user-info?uid=`：查询指定游戏 UID 的身份信息
  - `POST /api/v1/game/assist/search`：提交 `{ uid, charId, level, skill, equip }` 检索助战
  - `POST /api/v1/game/friend`：提交 `{ uid, targetUid }` 按游戏 UID 添加好友
  - 助战 API 使用与现有森空岛数据 API 相同的签名和当前账号 `cred/token`；不把凭证、签名或助战原始响应写入日志或测试 fixture
  - 如果森空岛 Web 端重新登录后凭证变化，请在「账号管理」对应账号卡片粘贴当前网页重新复制的 `cred,token`，点击「验证并更新凭证」；验证成功后才会替换本地凭证，失败不会覆盖旧凭证。不要混用 Android 会话的 `cred`、Web 端 `token`、Cookie 或 `sign`。

  - `GET /auth/user/open-api/tokens` / `POST /auth/user/open-api/token`：第三方 token 列表与生成，
    需 `Authorization: Authorization<USER_TOKEN>` 会话头（凭证存于 ark.yituliu.cn 的 localStorage，与官网「用户中心 → 第三方 API Token」页一致）
- 前端 `E:\yituliu\frontend-v2-plus`
  - `src/utils/survey/skland.js`：森空岛签名算法与干员数据换算规则（本项目 `src/core/skland.ts`、`src/core/format.ts` 与其保持一致）
  - `src/static/json/operator/character_table_simple.v2.json`：干员表源数据

## 已知限制

- 定时自动同步依赖浏览器处于运行状态（`chrome.alarms`），间隔最小按小时计
- 状态面板刷新与通知同样依赖浏览器运行；理智/公招/无人机的实时数值由前端按时间戳推算，浏览器休眠期间数值不更新，重新打开弹窗或刷新后纠偏
- 设置主密码后，浏览器重启到重新解锁期间定时同步与面板刷新会静默跳过，手动操作会提示先解锁；锁定时面板仍可查看缓存数据
- 一图流后端对同一账号 5 秒内只允许上传一次（错误码 39007），插件会提示稍后再试
- 官网 HG Token 在官网退出登录后失效；提示「需要进行设备验证」时，需在森空岛 APP 关闭「新设备登录身份验证」
- 上传报文中的 `itemList`（仓库材料）会随请求一起发送（与一图流官网导入行为一致）；当前后端 open-api 路径仅持久化干员数据
- 面板字体（Bender / Akrobat）为明日方舟风格字体，移植自 rhodes-headquarters，本地/个人使用无碍；若上架商店需替换为可商用字体

## 安全说明

森空岛凭证、官网 HG Token、一图流读写 token 均为敏感凭据：

- 只保存在本机 `chrome.storage.local`，不硬编码、不写入日志、不参与任何上报
- 设置主密码后凭据以 AES-GCM-256（PBKDF2-SHA256 派生，每条信封独立随机 IV）加密落盘，主密码与密钥不落盘；未设置主密码的存量数据保持明文，会在设置主密码时自动迁移
- 加密覆盖账号的 `skland` / `hgToken` 字段与设置层的读写 token（`settings.yituliuTokens`）；UID、昵称、区服、同步状态、后端地址等非敏感字段保持明文以便锁定时展示。旧版本挂在账号上的 token 会在读取时自动迁移到设置层
- 测试用例（`src/**/*.test.ts`）全部使用伪造 token，不含真实凭据
- 如怀疑泄露，请立即在一图流官网删除对应 API Token，并重新登录森空岛/官网使旧凭证失效

## 验证记录

- `npm ci`：依赖安装成功（Node ≥ 18）
- `npm test`：11 个测试文件、117 个用例全部通过（签名算法用 `node:crypto` 独立实现交叉验证；加密用例覆盖加解密往返、错误口令、密文篡改、明文迁移、锁定读写守卫、改密与重置；旧版账号 token → 设置层迁移；token 自动获取用例覆盖复用/生成/回退/会话失效；状态面板用例覆盖理智推算边界、公招状态机与通知合并、无人机/制造库存/发电量/心情换算）
- `npm run build`：`tsc --noEmit` 无错误，产物输出至 `dist/`，可在 Chrome/Edge 开发者模式加载
- 真实账号端到端联调：需扫码环境与一图流读写 token，按上文「使用方法」操作验证
