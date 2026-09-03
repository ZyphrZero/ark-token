import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
    }
  }
})
