import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Everything (including the Anthropic SDK) is bundled into out/, so the
// packaged app ships no node_modules.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
  },
})
