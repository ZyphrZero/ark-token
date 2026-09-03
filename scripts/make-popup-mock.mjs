// npm run build 后执行：node scripts/make-popup-mock.mjs
// 读取 dist/src/popup/index.html，注入 chrome mock 生成 mock.html（配合 scripts/preview-server.cjs 本地预览）
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist/src/popup/index.html', 'utf8')
const mock = readFileSync('scripts/popup-mock-chrome.js', 'utf8')
const mocked = html
  .replace('<title>一图流多账号助手</title>', '<title>面板预览(mock)</title>')
  .replace('<script type="module"', `<script>\n${mock}\n</script>\n    <script type="module"`)
writeFileSync('dist/src/popup/mock.html', mocked)
console.log('written dist/src/popup/mock.html')
