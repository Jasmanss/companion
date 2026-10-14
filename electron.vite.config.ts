import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Everything (including the Anthropic SDK) is bundled into out/, so the
// packaged app ships no node_modules.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    // Three pages: the panel, the Settings window, and Steward in the notch.
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          notch: resolve(__dirname, 'src/renderer/notch.html'),
        },
      },
    },
  },
})
