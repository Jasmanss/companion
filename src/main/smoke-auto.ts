import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { CommandMode } from '../shared/types'

/** What the Auto mode check needs from the app, so this file doesn't reach into index.ts. */
export interface AutoSmokeDeps {
  /** The chat panel's window, showing the chat. */
  panel: BrowserWindow
  /** Opens Settings on a section and returns its window once it has loaded. */
  openSettings(section: 'projects'): Promise<BrowserWindow>
  commandMode(): CommandMode
  setCommandMode(mode: CommandMode): Promise<void>
  /** Adds the folder as a project and makes it the current one; the other call undoes both. */
  useProject(folder: string): Promise<void>
  dropProject(folder: string): Promise<void>
  /** The agent's run_command, exactly as the model's tool call reaches it. Resolves with the tool result text. */
  runCommand(command: string): Promise<string>
  /** Saves a screenshot of a window next to the smoke screenshot, under this suffix. */
  shot(w: BrowserWindow, suffix: string): Promise<void>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(what: string, check: () => Promise<boolean> | boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`auto mode: timed out waiting for ${what}`)
    await sleep(100)
  }
}

const exists = (file: string) => fs.access(file).then(() => true, () => false)

/** The Run cards in the chat: how many wait for an answer, and the commands they show. */
const CARDS = `[...document.querySelectorAll('.approval.pending')].map((c) => c.querySelector('.command')?.textContent ?? '')`
/** The Ask | Auto switch in the text box: which part is pressed, or null if it isn't there. */
const SWITCH = `(() => { const g = document.querySelector('.composer .cbox [role="group"][aria-label="Running commands"]'); return g ? g.querySelector('button[aria-pressed="true"]')?.textContent?.trim() ?? '' : null })()`
const PRESS = (part: 'Ask' | 'Auto') => `[...document.querySelectorAll('.composer .cbox [role="group"][aria-label="Running commands"] button')].find((b) => b.textContent.trim() === '${part}')?.click()`
/** What the pending Run card says about why it still asks in Auto. */
const WHY_ASKS = `document.querySelector('.approval.pending .why-asks')?.textContent ?? ''`
/** The command steps in the chat, as the panel shows them. */
const RAN = `[...document.querySelectorAll('.act.k-run-command')].map((a) => (a.classList.contains('done') ? 'done ' : a.classList.contains('failed') ? 'failed ' : 'running ') + (a.querySelector('.term > div')?.textContent ?? a.querySelector('.tgt')?.textContent ?? '').replace(/^\\$\\s*/, ''))`

/**
 * Auto mode, end to end in the real app: the Running commands choice in Settings → Projects switches it, then in the
 * chat a safe command runs with no Run card and shows as a step, and a risky one still shows the card (and doesn't
 * run until Run is pressed). Uses a throwaway project folder, and puts the settings back.
 */
export async function checkAutoMode(d: AutoSmokeDeps): Promise<void> {
  const fail = (why: string): never => {
    throw new Error(`auto mode: ${why}`)
  }
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-smoke-auto-'))
  await fs.writeFile(path.join(folder, 'keep.txt'), 'kept\n')
  const panel = d.panel.webContents
  const cards = () => panel.executeJavaScript(CARDS) as Promise<string[]>
  const ran = () => panel.executeJavaScript(RAN) as Promise<string[]>
  try {
    await d.useProject(folder)
    if (d.commandMode() !== 'ask') fail(`the default is ${d.commandMode()}, not ask`)

    // The header: new chat, Settings and tuck, and no hide button or pin (hiding is in the menu bar and its shortcut,
    // Keep panel open in Settings). The text box has Ask | Auto, showing the setting.
    const head = (await panel.executeJavaScript(`[...document.querySelectorAll('.panel-head .head-actions button')].map((b) => b.getAttribute('aria-label'))`)) as string[]
    if (JSON.stringify(head) !== JSON.stringify(['New chat', 'Settings', 'Tuck away'])) fail(`the header's buttons are ${JSON.stringify(head)}`)
    if ((await panel.executeJavaScript(SWITCH)) !== 'Ask') fail(`the text box's switch shows ${JSON.stringify(await panel.executeJavaScript(SWITCH))}, not Ask`)

    // Ask each time: the card shows, even for a safe command. Skipping it runs nothing.
    const asked = d.runCommand('cat keep.txt')
    await until('the Run card in Ask each time', async () => (await cards()).includes('cat keep.txt'))
    await panel.executeJavaScript(`[...document.querySelectorAll('.approval.pending button')].find((b) => b.textContent === 'Skip')?.click()`)
    if (!(await asked).includes('declined')) fail('skipping the card did not stop the command')

    // The choice in Settings: click Auto, as the user does.
    const settingsWin = await d.openSettings('projects')
    await sleep(800)
    const clicked = await settingsWin.webContents.executeJavaScript(
      `(() => { const b = document.querySelector('[role="radiogroup"][aria-label="Running commands"] [data-value="auto"]'); b?.click(); return Boolean(b) })()`,
    )
    if (!clicked) fail('Settings → Projects has no Running commands choice')
    await until('Auto to be saved', () => d.commandMode() === 'auto')
    // The switch by the text box follows Settings.
    await until('the switch by the text box to show Auto', async () => (await panel.executeJavaScript(SWITCH)) === 'Auto')
    await settingsWin.webContents.executeJavaScript(`document.querySelector('[role="radiogroup"][aria-label="Running commands"]')?.scrollIntoView({ block: 'center' })`)
    await sleep(500)
    await d.shot(settingsWin, 'settings-commands')
    settingsWin.close()
    d.panel.focus()
    await sleep(600)

    // Auto, safe: no card at all (the skipped one from Ask each time stays in the chat), and the command shows as a step that finishes.
    const cardsBefore = (await panel.executeJavaScript(`document.querySelectorAll('.approval').length`)) as number
    const safe = JSON.parse(await d.runCommand('cat keep.txt && ls')) as { exit_code: number; output: string }
    if (safe.exit_code !== 0 || !safe.output.includes('kept')) fail(`the safe command did not run: ${JSON.stringify(safe)}`)
    await until('the Ran step', async () => (await ran()).includes('done cat keep.txt && ls'))
    const label = (await panel.executeJavaScript(`[...document.querySelectorAll('.act.k-run-command')].at(-1)?.querySelector('.l')?.textContent ?? ''`)) as string
    if (!label.startsWith('Ran automatically') || !label.includes('auto · safe')) fail(`the safe command's step says "${label}", not "Ran automatically" with "auto · safe"`)
    if ((await cards()).length > 0) fail('a safe command showed a Run card')
    if ((await panel.executeJavaScript(`document.querySelectorAll('.approval').length`)) !== cardsBefore) fail('a safe command added a card to the chat')
    await sleep(500) // the output draws in, and the step is still showing in full
    await d.shot(d.panel, 'auto-ran')

    // Auto, risky: the card shows, nothing is deleted until Run, and Skip leaves the file.
    const risky = d.runCommand('rm keep.txt')
    await until('the Run card for a risky command', async () => (await cards()).includes('rm keep.txt'))
    if (!(await exists(path.join(folder, 'keep.txt')))) fail('a risky command ran before Run was pressed')
    if ((await panel.executeJavaScript(WHY_ASKS)) !== 'Auto is on, but deleting files always asks.') fail(`the risky card says "${await panel.executeJavaScript(WHY_ASKS)}" about why it asks`)
    await sleep(600) // the card fades in
    await d.shot(d.panel, 'auto-risky')
    await panel.executeJavaScript(`[...document.querySelectorAll('.approval.pending button')].find((b) => b.textContent === 'Skip')?.click()`)
    if (!(await risky).includes('declined')) fail('skipping the risky command did not stop it')
    if (!(await exists(path.join(folder, 'keep.txt')))) fail('the risky command ran after Skip')

    // Deploys and pushes ask in Auto too.
    const push = d.runCommand('git push')
    await until('the Run card for git push', async () => (await cards()).includes('git push'))
    if ((await panel.executeJavaScript(WHY_ASKS)) !== 'Auto is on, but pushing always asks.') fail(`the git push card says "${await panel.executeJavaScript(WHY_ASKS)}" about why it asks`)
    await panel.executeJavaScript(`[...document.querySelectorAll('.approval.pending button')].find((b) => b.textContent === 'Skip')?.click()`)
    await push

    // The switch by the text box changes the setting itself, both ways.
    await panel.executeJavaScript(PRESS('Ask'))
    await until('Ask, from the switch by the text box', () => d.commandMode() === 'ask')
    await panel.executeJavaScript(PRESS('Auto'))
    await until('Auto, from the switch by the text box', () => d.commandMode() === 'auto')
    console.log('smoke: auto mode ok (a safe command ran with no card and says "Ran automatically · auto · safe"; a risky one and git push asked, saying why; the header has no hide button or pin; Ask | Auto by the text box follows Settings and changes it)')
  } finally {
    await d.setCommandMode('ask')
    await d.dropProject(folder)
    await fs.rm(folder, { recursive: true, force: true })
  }
}
