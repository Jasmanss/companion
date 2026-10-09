// Launches the built app, which opens its panel, screenshots it, and exits 0 if it rendered.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const out = path.resolve(process.argv[2] ?? 'out/smoke.png')

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, STEWARD_SMOKE_OUT: out, ELECTRON_RENDERER_URL: '' },
})
child.on('exit', (code) => process.exit(code ?? 1))
