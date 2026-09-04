# 助战接口响应解析 Bug 修复记录

## 问题概述

插件进入“助战检索”页面时，森空岛接口可以正常返回内容，但页面显示：

```text
森空岛接口响应无效（/api/v1/game/assist/info：缺少 Base64 content）
```

该问题发生在助战接口的后台响应解析阶段，不是检索条件、好友 UID 或 popup 消息转发导致的。

## 影响范围

受影响的接口：

- `GET /api/v1/game/assist/info`
- `GET /api/v1/game/assist/user-info?uid=`
- `POST /api/v1/game/assist/search`

好友申请接口 `POST /api/v1/game/friend` 使用普通 JSON envelope，不经过助战内容解码逻辑，因此不受本问题影响。

## 根因

旧实现只接受以下一种响应结构：

```json
{
  "code": 0,
  "data": {
    "content": "Base64(JSON)"
  }
}
```

助战接口在 Android WebView 抓包中确实使用过这种格式，但 Web 端、网关或不同版本的客户端可能返回其他等价形态，例如：

```json
{
  "code": 0,
  "data": {
    "characters": [],
    "levelMax": []
  }
}
```

```json
{
  "code": 0,
  "data": {
    "data": {
      "content": "Base64(JSON)"
    }
  }
}
```

或者响应已经被请求封装层解包为：

```json
{
  "content": "Base64(JSON)"
}
```

旧代码直接读取 `envelope.data.content`。当 `data` 已经是业务对象、额外嵌套，或响应本身已经解包时，即使 HTTP 请求和业务状态码都成功，也会被误报为“缺少 Base64 content”。

## 真实接口证据

Android 端抓包样本确认标准形态仍然存在：

```text
C:/Users/Administrator/AppData/Roaming/Reqable/capture/1788505760532683-514-55-res-extract-body.reqable
```

其响应为标准森空岛 envelope，`data.content` 是 Base64 编码的 JSON，解码后包含：

- `characters`
- `levelMax`

助战搜索响应也使用过同样的 `data.content` 包装。由于插件使用 Web 风格请求头，而 Android 使用不同的 `platform`、`vName`、设备标识和额外请求头，不能假设两个客户端的响应包装永远完全一致。

文档和抓包文件只作为本地分析依据使用，不应提交真实的 `cred`、`token`、`sign`、Cookie、设备指纹或完整响应到公共渠道。

## 修复内容

### 1. 兼容多种响应包装

`src/core/sklandAssist.ts` 现在按以下顺序处理响应：

1. 校验 HTTP 状态和业务 `code`；
2. 检查标准的 `data.content`；
3. 检查额外一层 `data.data.content`；
4. 检查直接业务对象；
5. 检查裸 Base64 字符串或已解包的 `{ content }` 对象；
6. 对解码后的业务对象执行接口级结构校验。

### 2. 增加业务对象校验

不同接口使用不同的最小结构校验：

- `assist/info`：`characters` 和 `levelMax` 必须是数组；
- `assist/user-info`：`gameNickname`、`isOfficial`、`isAuth` 必须存在且类型正确；
- `assist/search`：`list` 必须是数组。

这样可以兼容已解包响应，同时避免把任意 `code=0` 的错误对象当成成功数据。

### 3. 支持 URL-safe Base64

Base64 解码现在同时支持：

- 标准字符 `+`、`/`；
- URL-safe 字符 `-`、`_`；
- 缺失尾部 `=` padding 的内容。

### 4. 改进错误信息

无法识别响应时，错误只包含非敏感的响应形态，例如 `data` 的类型和有限字段名，不包含响应正文或认证字段，便于定位 Web/Android 响应差异。

## 相关测试

新增 fake fetch 测试覆盖：

- 标准 `data.content` Base64 响应；
- 直接业务对象；
- `data.data.content` 双层嵌套；
- 裸 Base64 字符串；
- 已解包的 `{ content }` 对象；
- URL-safe Base64；
- 缺失业务对象；
- 非法 Base64；
- HTTP 错误和森空岛业务错误。

测试不会访问真实森空岛接口，也不会发送好友申请。

## 验证结果

在 `E:\GitHub\ark-token` 执行：

```text
npm test
```

结果：

```text
12 个测试文件通过
134 个测试通过
```

执行：

```text
npm run build
git diff --check
```

结果：

- TypeScript 检查通过；
- Vite 生产构建通过；
- 差异格式检查通过。

## 使用说明

修复后需要重新生成并加载插件产物：

```text
npm run build
```

然后在 `chrome://extensions` 中确认加载目录为：

```text
E:\GitHub\ark-token\dist
```

点击扩展的“重新加载”后，再重新打开 popup 的“助战检索”页面。

如果仍显示旧的“缺少 Base64 content”错误，应确认：

1. Chrome/Edge 加载的确实是当前项目的 `dist`；
2. 扩展管理页已经执行 Reload；
3. service worker 来源是当前 `dist/service-worker-loader.js`；
4. 没有继续使用其他目录中的旧版扩展。

## 凭证安全注意事项

森空岛 `cred/token`、Cookie、`sign`、Android 设备标识和 HG Token 都属于敏感凭证。曾经在调试过程中公开或复制过的真实凭证应在诊断结束后退出登录并重新登录，使旧会话失效。任何真实凭证都不应写入仓库、测试 fixture、日志或提交信息。
