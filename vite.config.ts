/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { parse } from 'yaml';
import pkg from './package.json' with { type: 'json' };

/** 讓 `import x from './foo.yaml'` 在建置期轉為 JSON 物件。 */
function yamlPlugin(): Plugin {
  return {
    name: 'endless-crucible:yaml',
    transform(code, id) {
      if (!id.endsWith('.yaml') && !id.endsWith('.yml')) return null;
      return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
    },
  };
}

export default defineConfig({
  // GitHub Pages 部署在 /<repo>/ 之下，由 CI 設定 BASE_PATH
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    yamlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '無盡坩堝 Endless Crucible',
        short_name: '無盡坩堝',
        description: '從水、火、土、風開始，不停合成、發現新元素的煉金遊戲。',
        lang: 'zh-TW',
        theme_color: '#14100c',
        background_color: '#14100c',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
