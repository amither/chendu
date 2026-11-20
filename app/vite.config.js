import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { buildVersion } from './src/lib/version.js'

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const APP_VERSION = buildVersion(new Date(), gitSha())

// version.json is fetched (never cached) by "检查更新" to show the deployed version.
const versionFile = {
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
  },
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    vue(),
    versionFile,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '337晨读',
        short_name: '晨读',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        background_color: '#FFF7E8',
        theme_color: '#FC8B17',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
