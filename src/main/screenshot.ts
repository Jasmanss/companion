import { BrowserWindow, nativeImage, session } from 'electron'

const VIEWPORT = { width: 1440, height: 900 }
/** Long pages are cut off here so the image stays a sensible size. */
export const MAX_PAGE_HEIGHT = 8000
/** A section shot covers the section, up to this many screens. */
const MAX_SECTION_SCREENS = 3
/** The copy the model sees is downscaled; the API would shrink anything bigger anyway. */
const PREVIEW_LONG_EDGE = 1568
const PREVIEW_MAX_WIDTH = 1024

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

export interface CaptureOptions {
  /** Text of a heading or phrase; capture the section it starts instead of the whole page. */
  section?: string
}

export interface Capture {
  png: Buffer
  /** A small JPEG for the model to look at. */
  preview: Buffer
  width: number
  height: number
  /** What was captured, in words, for the tool result. */
  description: string
}

/**
 * Which rows of a slice to keep when stitching. `covered` is how far down the page is already captured,
 * `scrollY` where this slice starts (browsers clamp the last scroll), `limit` where to stop.
 */
export function sliceCrop(covered: number, scrollY: number, viewportHeight: number, limit: number): { top: number; height: number } | null {
  const top = Math.max(0, covered - scrollY)
  const bottom = Math.min(viewportHeight, limit - scrollY)
  return bottom > top ? { top, height: bottom - top } : null
}

/** Load a page in a hidden window and screenshot the whole page, or just the section around some text. */
export async function capturePage(url: string, { section }: CaptureOptions = {}): Promise<Capture> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http(s) pages can be captured')

  const win = new BrowserWindow({
    show: false,
    ...VIEWPORT,
    webPreferences: {
      offscreen: true,
      // Hidden windows get throttled animation frames, which leaves scroll-driven pages half-way through moving.
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: getResearchSession(),
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const run = <T>(script: string) => win.webContents.executeJavaScript(script, true) as Promise<T>

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
    await win.webContents.insertCSS('::-webkit-scrollbar { display: none !important } html { scrollbar-width: none !important }')

    const { pageHeight, viewportHeight } = await run<{ pageHeight: number; viewportHeight: number }>(
      `({ pageHeight: document.scrollingElement?.scrollHeight ?? innerHeight, viewportHeight: innerHeight })`,
    )

    const limit = Math.min(pageHeight, MAX_PAGE_HEIGHT)
    let image: Electron.NativeImage
    let description: string
    const found = section ? await findSection(run, section, viewportHeight) : null
    if (found) {
      // Sticky navs would cover the top of the section.
      await run(HIDE_FIXED)
      image = await stitch(win, run, viewportHeight, found.top, found.bottom)
      description = `the section starting at "${section}"`
    } else {
      image = await stitch(win, run, viewportHeight, 0, limit)
      const cut = pageHeight > MAX_PAGE_HEIGHT ? `, cut off at ${MAX_PAGE_HEIGHT}px of ${pageHeight}px` : ''
      description = section ? `the full page (couldn't find "${section}" on it${cut})` : `the full page${cut}`
    }

    if (image.isEmpty()) throw new Error('The page rendered blank')
    const { width, height } = image.getSize()
    return { png: image.toPNG(), preview: preview(image), width, height, description }
  } finally {
    win.destroy()
  }
}

/** Capture the viewport at 1x so slices line up with CSS pixels. */
async function snapshot(win: BrowserWindow): Promise<Electron.NativeImage> {
  const image = await win.webContents.capturePage()
  return image.getSize().width === VIEWPORT.width ? image : image.resize({ width: VIEWPORT.width })
}

/** Snapshot once the page stops changing (smooth scrolling, lazy images), or after a second regardless. */
async function settledSnapshot(win: BrowserWindow): Promise<Electron.NativeImage> {
  await delay(200)
  let previous = await snapshot(win)
  for (const started = Date.now(); Date.now() - started < 1000; ) {
    await delay(100)
    const next = await snapshot(win)
    if (next.toBitmap().equals(previous.toBitmap())) return next
    previous = next
  }
  return previous
}

/** Screenshot the page from `from` to `to` (CSS pixels), one screen at a time, and join the slices. */
async function stitch(
  win: BrowserWindow,
  run: <T>(script: string) => Promise<T>,
  viewportHeight: number,
  from: number,
  to: number,
): Promise<Electron.NativeImage> {
  const rows: Buffer[] = []
  let covered = from
  for (let y = from; covered < to; y += viewportHeight) {
    await run(`scrollTo({ top: ${y}, behavior: 'instant' })`)
    const slice = await settledSnapshot(win)
    const scrollY = await run<number>('scrollY')
    const crop = sliceCrop(covered, scrollY, viewportHeight, to)
    if (!crop) break
    const scale = slice.getSize().height / viewportHeight
    rows.push(
      slice
        .crop({ x: 0, y: Math.round(crop.top * scale), width: VIEWPORT.width, height: Math.round(crop.height * scale) })
        .toBitmap(),
    )
    covered = scrollY + crop.top + crop.height
    // Fixed headers and banners would repeat in every slice, so hide them after the first.
    if (rows.length === 1) await run(HIDE_FIXED)
    if (scrollY + viewportHeight >= to) break
  }
  const bitmap = Buffer.concat(rows)
  return nativeImage.createFromBitmap(bitmap, { width: VIEWPORT.width, height: bitmap.length / (VIEWPORT.width * 4) })
}

const HIDE_FIXED = `for (const el of document.querySelectorAll('body *')) {
  const { position } = getComputedStyle(el)
  if (position === 'fixed' || (position === 'sticky' && el.getBoundingClientRect().top < 120)) el.style.setProperty('visibility', 'hidden', 'important')
}`

/**
 * Find the first heading (or other element) containing `text` and the section it belongs to.
 * Returns page coordinates from just above it to the end of its section, capped at a few screens.
 */
async function findSection(run: <T>(script: string) => Promise<T>, text: string, viewportHeight: number): Promise<{ top: number; bottom: number } | null> {
  return run<{ top: number; bottom: number } | null>(`(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())}
    const matches = (el) => el.textContent.toLowerCase().includes(wanted) && el.getClientRects().length > 0
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
    let el = headings.find(matches)
    if (!el) {
      // The innermost element that contains the text.
      el = [...document.querySelectorAll('body *')].filter(matches).sort((a, b) => a.textContent.length - b.textContent.length)[0]
    }
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const top = Math.max(0, rect.top + scrollY - 40)
    // The section is the nearest ancestor that's clearly bigger than the heading but not the whole page.
    let bottom = top + ${viewportHeight}
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if (box.height > ${viewportHeight * MAX_SECTION_SCREENS}) break
      if (box.height > rect.height * 3) bottom = Math.max(bottom, box.bottom + scrollY + 24)
      if (node.matches('section, [class*="section" i], [id*="section" i]')) break
    }
    return { top, bottom: Math.min(bottom, top + ${viewportHeight * MAX_SECTION_SCREENS}, document.scrollingElement.scrollHeight) }
  })()`)
}

function preview(image: Electron.NativeImage): Buffer {
  const { width, height } = image.getSize()
  const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(width, height), PREVIEW_MAX_WIDTH / width)
  const small = scale < 1 ? image.resize({ width: Math.round(width * scale), quality: 'good' }) : image
  return small.toJPEG(70)
}
