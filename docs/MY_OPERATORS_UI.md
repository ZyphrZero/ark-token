# 我的干员界面

## 前端设计

- 入口：博士信息头的「我的干员」按钮，进入弹窗内独立全高页面，可返回状态面板。
- 默认显示已招募；已招募、未招募和全部分别显示数量，数量不随筛选变化。
- 职业、星级支持多选：同一类条件取并集，不同类条件取交集。名称搜索忽略首尾空白和英文大小写。
- 精英化筛选收在「练度」内；切到未招募时清除并禁用精英化条件。
- 星级优先：星级、精英化、等级降序；练度优先：精英化、等级、星级降序；名称按中文排序。相同排序值以名称、charId 确定顺序。
- 支持三种显示形式：立绘（官方 `char/portrait` 或当前皮肤的 `char_skin/portrait`，以 1:2 窗口和 `object-fit: contain` 完整展示）、方形（`char/avatar` 或皮肤头像，正方形 `object-fit: contain`，上下不裁脸）和列表（不加载头像，只显示职业、星级、姓名、精英化/等级与招募状态）。职业与星级置于图片上方，姓名和练度置于图片下方，不遮挡角色。卡片当前为只读展示，不提供详情或养成操作。
- 图片请求使用 `no-referrer`，避免 CDN 因本地预览的 Referer 返回 403；失败明确显示「图片不可用」。干员不在本地目录时保留 charId 和练度，不伪造星级或职业。
- 400×600 弹窗使用三列网格，顶部筛选常驻，只有卡片区滚动；招募统计集中在 Tabs 中，省去重复的档案统计行和装饰底栏，增加图片区域。默认首屏显示一排完整立绘卡片和下一排的开头。
- 弹窗外层固定 400px 宽，避免扩展自动尺寸计算时被 `100vw` 循环收缩；页面独占弹窗外层空间。
- 排序旁的三个图标切换立绘、方形和文本显示，悬停显示名称。切换保留当前招募状态、筛选和排序，列表滚动回到顶部；文本模式使用带固定表头的表格，不渲染角色或职业图片。
- 已招募干员卡片和文本列表均可点击打开详情。卡片底部用图标显示当前潜能、模组（锁定/开启与等级）和各技能专精等级；缺少快照字段时不猜测状态。
- 详情弹层显示本地详情表中的干员情报、职业标签、当前攻击范围、已解锁天赋/特性、潜能效果、技能等级对应的范围与效果，以及 `equip[].locked=false` 的当前模组等级和效果。技能描述按游戏表的 blackboard 数值替换后显示，未收录字段明确显示「未收录」。

## 当前数据范围

本阶段复用已有 `player/info` 缓存与本地 `operator-data.json`，没有新增接口、后台消息或凭据操作。详情静态表 `src/assets/operator-details.json` 由 `npm run build:operator-details` 从固定版本的 `Kengxxiao/ArknightsGameData` 生成，并按需加载，不影响首次打开面板的脚本体积。未招募列表定义为本地目录中未出现在当前快照 `chars` 的条目，因此受目录版本与快照更新时间影响，不代表实时游戏状态或当前卡池可获取范围。

2026-09-09 使用 MuMu + Reqable 对森空岛 App 1.62.0 进行的字段与资源核验见 `skland_dump/20260909_capture/CAPTURE_SUMMARY.md`；其中包含 `player/info`、`char-book/list`、`char-book/char-info` 的请求编号、脱敏详情 fixture 和模组/技能/潜能图标 URL 规则。

`buildOperatorRoster` 以 `charId` 合并目录和快照；快照中已存在但本地目录未收录的干员也会保留。本地目录未收录的新干员不会出现在未招募列表中。精英阶段和等级沿用 `SklandPanelCharacter` 已有字段，不根据等级、皮肤或技能反推是否招募。

## 样本与验证

现有抓包：`skland_dump/20260908_capture/raw/game_player_info.uid2518_mask.decoded.json`，抓包日期 2026-09-08。检查发现 `status.charCnt = 171`，`chars.length = 171`，去重后的 `charId` 数也为 171。样本中的阿米娅包含 `potentialRank`、`mainSkillLvl`、`skills[].specializeLevel` 和 `equip[].{id,level,locked}`，这些字段已在 `SklandPanelCharacter` 中保留；回归用例覆盖潜能、专精和锁定模组，不包含账号身份或凭据。

该样本只验证当前已声明字段和这一份快照的一致性，不据此推断未来接口的完整性、未公开的干员形态或获取规则。本轮未验证新的森空岛数据字段。

`scripts/popup-mock-chrome.js` 的 23 名已招募干员及练度是独立的界面演示数据，仅用于预览，不作为真实账号或接口测试结果。

```bash
npm run build:operator-details
npm test -- src/core/status/operators.test.ts src/core/operator-details.test.ts
npm run build
node scripts/make-popup-mock.mjs
node scripts/preview-server.cjs
```

打开 `http://127.0.0.1:8791/src/popup/mock.html`，点击「我的干员」。
