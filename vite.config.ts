import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    sourcemap: false,
    /**
     * 基建技能图标（529 枚，每枚约 1.5KB）不走 base64 内联：默认 4KB 阈值会把它们
     * 全部内联进 JS，实测主 chunk 从 ~90KB 涨到 1MB，popup 启动要多解析 1MB 脚本。
     * 产出独立文件后按需加载、可单独缓存。其余资源保持 Vite 默认内联策略。
     */
    assetsInlineLimit: filePath => (filePath.includes('building-skills') ? false : undefined)
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
    }
  }
})
