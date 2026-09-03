// 一次性静态文件服务器：用于本地预览 dist/ 中的扩展页面（面板视觉验证）
const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', 'dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json' }

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath.endsWith('/')) urlPath += 'index.html'
  const file = path.join(root, urlPath)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(8791, '127.0.0.1', () => {
  console.log('preview server on http://127.0.0.1:8791')
})
