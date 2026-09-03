# 一图流多账号浏览器插件实施计划（已实施）

> 本文档为 2026-09-03 批准并完成的实施计划存档，实现情况见 README.md。

## 目标

构建 Chrome/Edge 浏览器插件（Manifest V3）：支持多个明日方舟账号的添加与切换，一键（或定时）从森空岛拉取最新干员与账号数据，通过一图流写 token 上传、读 token 校验。实现依据一图流后端（BackEndV3，Java/Spring）与前端（frontend-v2-plus，Vue3）的现有接口与算法，只读参考、不修改它们。

## 技术选型

- React 18 + TypeScript + Vite + @crxjs/vite-plugin（MV3 插件标准组合，支持热更新）
- crypto-js：HMAC-SHA256 + MD5，与一图流前端签名算法完全一致
- qrcode：弹窗/设置页内渲染登录二维码
- vitest：单元测试；不引入 UI 组件库，手写轻量样式

## 架构

```
├── manifest.json                   # MV3 清单（popup / options / service worker / 权限）
├── assets-source/                  # 干员表源数据（复制自前端仓库，不打包）
├── scripts/build-operator-table.mjs # 从源表生成精简干员表（星级 + 模组类型映射）
├── src/
│   ├── core/        # 纯逻辑层，不依赖 DOM/chrome，可直接测试
│   │   ├── skland.ts      # 森空岛签名 + binding/cultivate 数据接口
│   │   ├── hgAuth.ts      # HG token → cred 换取（走后端，失败降级直连）
│   │   ├── qrLogin.ts     # 扫码登录（创建二维码 + 2 秒轮询）
│   │   ├── yituliuApi.ts  # 一图流 open-api 上传/读取封装
│   │   ├── format.ts      # 干员数据格式化 + 上传报文组装
│   │   ├── sync.ts        # 同步编排（凭证失效自动刷新重试）
│   │   └── types.ts       # GameAccount / 设置 等类型
│   ├── storage/store.ts   # chrome.storage.local 封装（账号增删改、激活切换）
│   ├── background/index.ts# service worker：消息路由 + chrome.alarms 定时同步
│   ├── popup/             # React 弹窗：账号卡片列表、切换、单账号/全部同步
│   └── options/           # React 管理页：添加账号向导、token 管理、设置
└── src/**/*.test.ts       # vitest 测试（fixtures 全部使用假 token）
```

**manifest 权限**：`storage`、`alarms`；host：`backend.yituliu.cn`、`zonai.skland.com`、`as.hypergryph.com`、`web-api.hypergryph.com`、`127.0.0.1:10012`（本地调试）。无 content script。

## 数据模型（chrome.storage.local）

- `GameAccount`：id / uid / nickName / channelMasterId / channelName / skland{cred,token} / hgToken?（用于凭证失效自动刷新）/ yituliu{readToken?,writeToken?} / lastSync
- `ExtensionSettings`：backendBaseUrl（默认 `https://backend.yituliu.cn`）/ autoSyncEnabled / autoSyncIntervalHours

## 关键接口契约（核实自两个仓库）

1. **森空岛签名**：`sign = md5(hex(hmacSHA256(path + params + timestamp + JSON.stringify(headers), token)))`，headers 键序固定 `platform/timestamp/dId/vName`，时间戳减 300ms，密钥为换取的临时 token；请求头另带 `cred` 与 `sign`。
2. **数据拉取**（直连 zonai.skland.com）：`GET /api/v1/game/cultivate/player?uid=`（仓库+练度）、`GET /api/v1/game/player/binding`（绑定列表）。
3. **干员格式化**：`potential = potentialRank + 1`；`skillN = skills[n-1].level`；模组按 `typeName2` 归到 modX/Y/D/A/B；rarity 查本地精简干员表（427 干员，22.4KB），未收录的跳过。
4. **上传一图流**：`POST /open-api/operator/upload`，写 token 原样放 `Authorization` 头（无前缀），body 为 PlayerInfoDTO；读校验 `GET /open-api/operator/info`。
5. **三种登录**：扫码（后端 qr/create + qr/check 轮询，status=0 得凭证）；官网 HG Token（后端 /survey/hg/cred-token，失败降级插件直连鹰角 grant + generate_cred_by_code；支持从已登录官网一键读取）；森空岛凭证粘贴（cred,token）。
6. **错误处理**：token 无效（20027）/权限不足（20010）/5 秒限流（39007）/森空岛 code≠0（有 hgToken 自动刷新重试一次）。

## 测试与验证

- 签名算法用 node:crypto 独立实现交叉验证；覆盖干员格式化边界、上传报文与错误码映射、storage 账号隔离/切换/删除、同步状态机（凭证失效→刷新→重试、限流）。
- 验证命令：`npm ci` → `npm test`（44 用例通过）→ `npm run build`（tsc 无错误，产物 dist/ 可加载）。
- 真实账号端到端联调需扫码环境与一图流读写 token，按 README「使用方法」操作。

## 迁移记录

- 2026-09-03：项目从 `E:\yituliu\yituliu-token` 迁移至本仓库（`E:\yituliu\ark-token`），迁移后重新安装依赖、跑测试与构建验证。
