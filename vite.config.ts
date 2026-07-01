import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST
const isWebApp = process.env.VITE_WEB_APP === 'true'

const webAliases = isWebApp
  ? {
      '@tauri-apps/api/core': resolve(__dirname, 'src/web/tauri/core.ts'),
      '@tauri-apps/api/event': resolve(__dirname, 'src/web/tauri/event.ts'),
      '@tauri-apps/api/window': resolve(__dirname, 'src/web/tauri/window.ts'),
      '@tauri-apps/api/webview': resolve(__dirname, 'src/web/tauri/webview.ts'),
      '@tauri-apps/api/path': resolve(__dirname, 'src/web/tauri/path.ts'),
      '@tauri-apps/api/app': resolve(__dirname, 'src/web/tauri/app.ts'),
      '@tauri-apps/plugin-store': resolve(__dirname, 'src/web/tauri/store.ts'),
      '@tauri-apps/plugin-sql': resolve(__dirname, 'src/web/tauri/sql.ts'),
      '@tauri-apps/plugin-fs': resolve(__dirname, 'src/web/tauri/fs.ts'),
      '@tauri-apps/plugin-log': resolve(__dirname, 'src/web/tauri/log.ts'),
      '@tauri-apps/plugin-dialog': resolve(__dirname, 'src/web/tauri/dialog.ts'),
      '@tauri-apps/plugin-clipboard-manager': resolve(__dirname, 'src/web/tauri/clipboard.ts'),
      '@tauri-apps/plugin-autostart': resolve(__dirname, 'src/web/tauri/autostart.ts'),
      '@tauri-apps/plugin-opener': resolve(__dirname, 'src/web/tauri/opener.ts'),
      '@tauri-apps/plugin-os': resolve(__dirname, 'src/web/tauri/os.ts'),
      '@tauri-apps/plugin-process': resolve(__dirname, 'src/web/tauri/process.ts'),
      '@tauri-apps/plugin-shell': resolve(__dirname, 'src/web/tauri/shell.ts'),
      '@tauri-apps/plugin-updater': resolve(__dirname, 'src/web/tauri/updater.ts'),
      'tauri-plugin-locale-api': resolve(__dirname, 'src/web/tauri/locale.ts'),
    }
  : {}

export default defineConfig(async () => ({
  base: isWebApp ? './' : '/',
  plugins: [
    vue(),
    UnoCSS(),
    VueI18nPlugin({
      include: resolve(__dirname, 'src/shared/locales/**'),
      runtimeOnly: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      path: 'path-browserify',
      ...webAliases,
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          'naive-ui': ['naive-ui'],
          'tauri-api': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-shell',
            '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-fs',
            '@tauri-apps/plugin-clipboard-manager',
            '@tauri-apps/plugin-updater',
          ],
          'vue-vendor': ['vue', 'vue-router', 'pinia', 'vue-i18n'],
        },
      },
    },
  },
  server: {
    port: isWebApp ? 47000 : 1420,
    strictPort: true,
    host: isWebApp ? '0.0.0.0' : host || false,
    proxy: isWebApp
      ? {
          '/jsonrpc': {
            target: 'http://127.0.0.1:29100',
            changeOrigin: true,
            ws: true,
          },
        }
      : undefined,
    hmr: host
      ? {
        protocol: 'ws',
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
