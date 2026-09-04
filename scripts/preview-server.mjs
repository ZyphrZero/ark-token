// 本地静态预览服务：serve dist 目录用于浏览器截图验证（node scripts/preview-server.mjs）
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PORT = 4173
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = normalize(join(ROOT, path === '/' ? '/_preview-popup.html' : path))
    if (!file.startsWith(normalize(ROOT))) {
      res.writeHead(403).end()
      return
    }
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`preview at http://127.0.0.1:${PORT}`))
