# Repository Guidelines

## 项目结构与职责范围

本工具面向明日方舟一图流（[ark.yituliu.cn](https://ark.yituliu.cn/)）浏览器插件，使用森空岛 token 获取账号干员数据，再通过一图流读 token 和写 token 自动更新数据，并支持在浏览器插件中切换多个账号，读 token 和写 token 具有唯一性，每个一图流账号仅有读/写 token。

本项目源码、测试、构建配置位于本仓库（根目录 `E:\yituliu\ark-token`），已按 README 中的目录说明组织。实现所依据的接口、数据结构、调用约定位于以下相邻仓库；处理本项目任务时可以并且应当对这些仓库进行只读检索和核对：

- 后端：`E:\yituliu\BackEndV3`
- 前端：`E:\yituliu\frontend-v2-plus`

本项目根目录 `E:\yituliu\ark-token` 是本任务唯一允许写入和修改的范围。分析阶段可以读取、搜索和比对上述后端、前端仓库，但不得修改、提交、删除其中的文件或安装依赖；如确需改变前后端，必须先取得用户明确授权。不得删除、重命名或弱化本文件中记录的代码路径，也不得在实现本项目功能时擅自删除现有接口、路由、调用链或兼容路径。若新增模块，请同步补充本项目 README 中的目录说明。

## 构建、测试与本地开发

构建、测试和修改均针对本仓库进行，依据 README 与 `package.json` 中声明的命令执行，例如 `npm ci`、`npm run dev`、`npm run build`、`npm test`、`npm run build:operator-table`，不要假设未声明的命令可用。提交前记录实际执行的命令及结果。

## 编码风格与命名

遵循本项目现有的 formatter、linter、TypeScript/后端配置和目录约定，不要为单个改动引入新的风格。若本项目未规定，JavaScript/TypeScript 使用 2 空格缩进，变量和函数采用 `camelCase`，类与组件采用 `PascalCase`，常量采用 `UPPER_SNAKE_CASE`；保持导入有序，并让命名体现账号、token 和数据更新的职责。

## 测试指南

当前未发现测试。新增逻辑应仅在本项目的测试目录中补充测试，至少覆盖 token 读写、账号隔离、更新失败和重试等边界；测试中不得输出真实 token。沿用本项目既有命名（例如 `*.test.ts` 或 `*_test.go`），优先运行受影响模块的快速测试，再运行完整套件。

## 安全与配置

森空岛 token、读 token 和写 token 都属于敏感凭据。仅通过环境变量或本地未跟踪配置提供，禁止提交到 Git、硬编码到源码或写入日志；示例值必须脱敏。调用后端接口时核对环境和权限范围，发现凭据泄露应立即撤销并更换。

## 提交与 Pull Request

当前目录没有 Git 历史，无法从历史提交推断既有格式。建议使用简短的祈使式 Conventional Commit，例如 `feat: support account switching` 或 `fix: handle token refresh failure`。PR 应说明目的、影响范围、验证命令及结果；涉及界面变更时附截图，涉及接口或权限变更时注明兼容性和安全影响，并关联对应 issue。
