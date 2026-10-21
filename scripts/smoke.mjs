// Builds the app, launches it, and runs the smoke check: the panel, Settings, the tab, the notch, alerts, and how
// smoothly they move. Exits 0 if everything held.
//
//   npm run smoke                        hidden: real windows, but see-through, click-through and never focused
//   npm run smoke -- --visible           the windows on screen (also STEWARD_SMOKE_VISIBLE=1), to watch or to see the frost
//   STEWARD_SMOKE_NOTCH=1 npm run smoke  pretend the main display has a notch (for a Mac without one, like CI's)
//   npm run smoke -- some/file.png       where the screenshot goes (default out/smoke.png); more land next to it
//
// One run at a time: a second waits for the first (up to STEWARD_SMOKE_LOCK_WAIT seconds, default 360), then gives up.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquire, LockBusy, WAIT_MS } from './smoke-lock.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const visible = args.includes('--visible') || ['1', 'true'].includes(String(process.env.STEWARD_SMOKE_VISIBLE).toLowerCase())
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'out/smoke.png')
const waitMs = process.env.STEWARD_SMOKE_LOCK_WAIT ? Number(process.env.STEWARD_SMOKE_LOCK_WAIT) * 1000 : WAIT_MS

let release
try {
  release = await acquire({ waitMs, where: root })
} catch (err) {
  if (!(err instanceof LockBusy)) throw err
  const { pid, started, where } = err.held
  console.error(
    `smoke: not started. Another smoke run (pid ${pid}, started ${new Date(started).toLocaleTimeString()}, in ${where}) still had the lock after ${Math.round(err.waitedMs / 1000)} s. ` +
      `Two at once fight over the CPU and the data folder, so run this again when it ends. If it is stuck, stop pid ${pid}.`,
  )
  process.exit(75)
}

let child
const stop = (code) => {
  child?.kill('SIGTERM')
  release()
  process.exit(code)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(130))
process.on('exit', release)

/** Runs a program to the end with its output shown; resolves with its exit code. */
const run = (file, argv, env) =>
  new Promise((resolve) => {
    child = spawn(file, argv, { cwd: root, stdio: 'inherit', env })
    child.on('error', (err) => {
      console.error(`smoke: could not start ${path.basename(file)}: ${err.message}`)
      resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })

const built = await run(path.join(root, 'node_modules', '.bin', 'electron-vite'), ['build'], process.env)
if (built !== 0) stop(built)

const env = { ...process.env, STEWARD_SMOKE_OUT: out, ELECTRON_RENDERER_URL: '' }
if (visible) env.STEWARD_SMOKE_VISIBLE = '1'
else delete env.STEWARD_SMOKE_VISIBLE
stop(await run(require('electron'), ['.'], env))
