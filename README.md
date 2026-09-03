# 一图流多账号助手（浏览器插件）

面向 [明日方舟一图流](https://ark.yituliu.cn/) 的 Chrome/Edge 浏览器插件（Manifest V3，React + Vite + TypeScript）。

**功能**：

- 管理多个明日方舟账号（扫码登录 / 官网 HG Token / 森空岛凭证三种方式添加），点击切换当前账号
- 一键（或定时）从森空岛拉取最新干员练度与仓库材料，通过一图流**写 token** 上传到 `POST /open-api/operator/upload`
- 配置**读 token** 后，同步完成自动调用 `GET /open-api/operator/info` 校验远端数据
- 凭证失效时，若账号存有官网 HG Token 会自动刷新森空岛凭证并重试
- 所有 token / 凭证只保存在本机 `chrome.storage.local`，不写入日志、不上报

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

### 配置一图流读写 token

在一图流官网 [用户中心 → 第三方 API Token](https://ark.yituliu.cn/account/home) 生成：

- 「只读 Token」→ 填入插件的**读 token**（用于同步后校验，可选）
- 「只写 Token」→ 填入插件的**写 token**（上传数据必填）

注意：同一权限重新生成 token 会使旧 token 失效。之后在插件弹窗中点「立即同步」即可更新数据。

## 目录说明

```
yituliu-token/
├── AGENTS.md                       # 仓库开发规范（勿删改）
├── manifest.json                   # MV3 清单（popup / options / service worker / 权限）
├── assets-source/
│   └── character_table_simple.v2.json   # 干员表源数据（复制自 frontend-v2-plus，不打包）
├── scripts/
│   └── build-operator-table.mjs    # 从源表生成精简干员表（星级 + 模组类型映射）
├── src/
│   ├── core/                       # 纯逻辑层（不依赖 DOM / chrome API，可直接单测）
│   │   ├── types.ts                # GameAccount、PlayerInfoPayload 等数据模型
│   │   ├── errors.ts               # 错误类型与错误码 → 中文提示映射
│   │   ├── skland.ts               # 森空岛签名（HMAC-SHA256+MD5）与数据 API
│   │   ├── hgAuth.ts               # 官网 HG Token 换凭证（走后端，可降级直连）与输入解析
│   │   ├── qrLogin.ts              # 森空岛扫码登录（创建二维码 + 轮询）
│   │   ├── yituliuApi.ts           # 一图流 open-api 上传 / 读取封装
│   │   ├── format.ts               # 森空岛干员数据 → 上传格式换算（依赖精简干员表）
│   │   └── sync.ts                 # 单账号同步编排（凭证失效自动刷新重试）
│   ├── storage/
│   │   └── store.ts                # chrome.storage.local 封装（账号增删改 / 激活切换 / 设置）
│   ├── background/
│   │   └── index.ts                # service worker：同步消息路由 + chrome.alarms 定时同步
│   ├── popup/                      # 弹窗界面（账号卡片、切换、单账号/全部同步）
│   ├── options/                    # 管理页（账号管理 / 添加向导 / 设置）
│   ├── assets/
│   │   └── operator-table.slim.json  # 精简干员表（npm run build:operator-table 生成）
│   └── utils/time.ts               # 时间格式化
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

### 更新干员表

新干员/新模组上线后：把新版 `character_table_simple.v2.json`（来自一图流前端仓库 `frontend-v2-plus/src/static/json/operator/`）覆盖 `assets-source/` 同名文件，执行 `npm run build:operator-table` 后重新 `npm run build`。表内未收录的干员会在同步时被跳过，以保证星级与模组映射准确。

## 与一图流前后端的对接关系（只读参考）

实现依据以下两个仓库的现有接口与算法，本项目不修改它们：

- 后端 `E:\yituliu\BackEndV3`（生产地址 `https://backend.yituliu.cn`）
  - `POST /open-api/operator/upload`：写 token 放 `Authorization` 头（原样、无前缀），报文为 PlayerInfoDTO
  - `GET /open-api/operator/info`：读 token 校验，返回 V2 格式干员数据
  - `POST /survey/hg/cred-token`：官网 HG Token 换森空岛凭证
  - `POST /survey/skland/qr/create` / `POST /survey/skland/qr/check?scanId=`：扫码登录
- 前端 `E:\yituliu\frontend-v2-plus`
  - `src/utils/survey/skland.js`：森空岛签名算法与干员数据换算规则（本项目 `src/core/skland.ts`、`src/core/format.ts` 与其保持一致）
  - `src/static/json/operator/character_table_simple.v2.json`：干员表源数据

## 已知限制

- 定时自动同步依赖浏览器处于运行状态（`chrome.alarms`），间隔最小按小时计
- 一图流后端对同一账号 5 秒内只允许上传一次（错误码 39007），插件会提示稍后再试
- 官网 HG Token 在官网退出登录后失效；提示「需要进行设备验证」时，需在森空岛 APP 关闭「新设备登录身份验证」
- 上传报文中的 `itemList`（仓库材料）会随请求一起发送（与一图流官网导入行为一致）；当前后端 open-api 路径仅持久化干员数据

## 安全说明

森空岛凭证、官网 HG Token、一图流读写 token 均为敏感凭据：

- 只保存在本机 `chrome.storage.local`，不硬编码、不写入日志、不参与任何上报
- 测试用例（`src/**/*.test.ts`）全部使用伪造 token，不含真实凭据
- 如怀疑泄露，请立即在一图流官网删除对应 API Token，并重新登录森空岛/官网使旧凭证失效

## 验证记录

- `npm ci`：依赖安装成功（Node ≥ 18）
- `npm test`：6 个测试文件、43 个用例全部通过（签名算法用 `node:crypto` 独立实现交叉验证）
- `npm run build`：`tsc --noEmit` 无错误，产物输出至 `dist/`，可在 Chrome/Edge 开发者模式加载
- 真实账号端到端联调：需扫码环境与一图流读写 token，按上文「使用方法」操作验证
