import { BrowserWindow, session } from 'electron'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let researchSession: Electron.Session | null = null

/** An in-memory session for research pages: no downloads, no shared cookies with anything else. */
function getResearchSession(): Electron.Session {
  if (!researchSession) {
    researchSession = session.fromPartition('research')
    researchSession.on('will-download', (event) => event.preventDefault())
    researchSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  }
  return researchSession
}

/** Load a page in a hidden window and return a PNG of the first screen. */
export async function capturePage(url: string): Promise<Buffer> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http(s) pages can be captured')

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, session: getResearchSession() },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    await Promise.race([
      win.loadURL(target.toString()).catch((err: Error) => {
        // Redirects and client-side navigations abort the first load; the page still renders.
        if (!err.message.includes('ERR_ABORTED')) throw err
      }),
      delay(20_000).then(() => {
        throw new Error('The page took too long to load')
      }),
    ])
    await delay(1500) // let fonts, images and animations settle
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) throw new Error('The page rendered blank')
    return image.toPNG()
  } finally {
    win.destroy()
  }
}
