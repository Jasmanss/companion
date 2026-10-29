import { BrowserWindow, nativeImage, session } from 'electron'
import { isLoopbackHost, isLoopbackUrl } from '../shared/review'

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

/** Visual Review's pictures come from their own in-memory session, so a local app's cookies and storage stay apart from research pages. */
let reviewSession: Electron.Session | null = null

function getReviewSession(): Electron.Session {
  if (!reviewSession) {
    reviewSession = session.fromPartition('review')
    reviewSession.on('will-download', (event) => event.preventDefault())
    reviewSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    // A dev server on https usually has a certificate nobody signed. On this Mac that's fine; anywhere else it isn't.
    reviewSession.setCertificateVerifyProc((request, callback) => callback(isLoopbackHost(request.hostname) ? 0 : -3))
  }
  return reviewSession
}

const SENT_AWAY = 'The page tried to send Steward to another site, so it was not captured'

export interface CaptureOptions {
  /** Text of a heading or phrase; capture the section it starts instead of the whole page. */
  section?: string
  /**
   * For Visual Review: only a page on this Mac may be loaded (and the page can't send the window elsewhere), animations
   * and transitions are switched off, and the page is captured again until two in a row match, for up to `settleMs`.
   */
  review?: { settleMs: number }
  /** How big the window is (CSS pixels): 1,440 by 900 unless asked (Visual Review's phone width). */
  viewport?: { width: number; height: number }
}

export interface Capture {
  png: Buffer
  /** A small JPEG for the model to look at. */
  preview: Buffer
  width: number
  height: number
  /** What was captured, in words, for the tool result. */
  description: string
  /** Visual Review: the address the page ended up at (after redirects and the app's own router). */
  landedOn?: string
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
export async function capturePage(url: string, { section, review, viewport = VIEWPORT }: CaptureOptions = {}): Promise<Capture> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http(s) pages can be captured')
  if (review && !isLoopbackUrl(target.toString())) throw new Error('Visual Review only looks at pages on this Mac (localhost or 127.0.0.1)')

  const win = new BrowserWindow({
    show: false,
    ...viewport,
    webPreferences: {
      offscreen: true,
      // Hidden windows get throttled animation frames, which leaves scroll-driven pages half-way through moving.
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: review ? getReviewSession() : getResearchSession(),
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  /** The page tried to go somewhere that isn't this Mac. */
  let sentAway = false
  if (review) {
    // A redirect to a login on another site, say, ends here: the window stays on this Mac, and nothing is kept of the page.
    const stay = (details: Electron.Event & { url: string }) => {
      if (isLoopbackUrl(details.url)) return
      sentAway = true
      details.preventDefault()
    }
    win.webContents.on('will-navigate', stay)
    win.webContents.on('will-redirect', stay)
  }
  const run = <T>(script: string) => win.webContents.executeJavaScript(script, true) as Promise<T>

  try {
    await Promise.race([
      win.loadURL(target.toString()).catch((err: Error) => {
        // A redirect we refused ends the load with an error of its own.
        if (sentAway) throw new Error(SENT_AWAY)
        // Redirects and client-side navigations abort the first load; the page still renders.
        if (!err.message.includes('ERR_ABORTED')) throw err
      }),
      delay(20_000).then(() => {
        throw new Error('The page took too long to load')
      }),
    ])
    await delay(1500) // let fonts, images and animations settle
    await win.webContents.insertCSS('::-webkit-scrollbar { display: none !important } html { scrollbar-width: none !important }')
    // A spinner or a fade would look like a change. Finished animations jump to their end, endless ones to their start.
    if (review) await win.webContents.insertCSS(FREEZE_ANIMATIONS)

    const measure = () =>
      run<{ pageHeight: number; viewportHeight: number }>(`({ pageHeight: document.scrollingElement?.scrollHeight ?? innerHeight, viewportHeight: innerHeight })`)
    const { pageHeight, viewportHeight } = await measure()

    const limit = Math.min(pageHeight, MAX_PAGE_HEIGHT)
    let image: Electron.NativeImage
    let description: string
    const found = section ? await findSection(run, section, viewportHeight) : null
    if (review) {
      image = await steady(async () => {
        const m = await measure() // the page may grow while it settles
        const shot = await stitch(win, run, viewport.width, m.viewportHeight, 0, Math.min(m.pageHeight, MAX_PAGE_HEIGHT))
        await run(SHOW_FIXED + `;scrollTo({ top: 0, behavior: 'instant' })`) // the next picture starts from the same page
        return shot
      }, review.settleMs)
      description = pageHeight > MAX_PAGE_HEIGHT ? `the full page, cut off at ${MAX_PAGE_HEIGHT}px of ${pageHeight}px` : 'the full page'
    } else if (found) {
      // Sticky navs would cover the top of the section.
      await run(HIDE_FIXED)
      image = await stitch(win, run, viewport.width, viewportHeight, found.top, found.bottom)
      description = `the section starting at "${section}"`
    } else {
      image = await stitch(win, run, viewport.width, viewportHeight, 0, limit)
      const cut = pageHeight > MAX_PAGE_HEIGHT ? `, cut off at ${MAX_PAGE_HEIGHT}px of ${pageHeight}px` : ''
      description = section ? `the full page (couldn't find "${section}" on it${cut})` : `the full page${cut}`
    }

    if (sentAway) throw new Error(SENT_AWAY)
    if (image.isEmpty()) throw new Error('The page rendered blank')
    const { width, height } = image.getSize()
    return { png: image.toPNG(), preview: preview(image), width, height, description, ...(review ? { landedOn: win.webContents.getURL() } : {}) }
  } finally {
    win.destroy()
  }
}

/** Capture the viewport (this many CSS pixels wide) at 1x so slices line up with CSS pixels. */
async function snapshot(win: BrowserWindow, width: number): Promise<Electron.NativeImage> {
  const image = await win.webContents.capturePage()
  return image.getSize().width === width ? image : image.resize({ width })
}

/** Capture again until two pictures in a row are the same (a dev server finishing its hot reload, an image arriving), or `maxMs` passes. */
async function steady(shoot: () => Promise<Electron.NativeImage>, maxMs: number): Promise<Electron.NativeImage> {
  const started = Date.now()
  let previous = await shoot()
  while (Date.now() - started < maxMs) {
    await delay(500)
    const next = await shoot()
    if (sameImage(previous, next)) return next
    previous = next
  }
  return previous
}

function sameImage(a: Electron.NativeImage, b: Electron.NativeImage): boolean {
  const { width, height } = a.getSize()
  const other = b.getSize()
  return width === other.width && height === other.height && a.toBitmap().equals(b.toBitmap())
}

/** Snapshot once the page stops changing (smooth scrolling, lazy images), or after a second regardless. */
async function settledSnapshot(win: BrowserWindow, width: number): Promise<Electron.NativeImage> {
  await delay(200)
  let previous = await snapshot(win, width)
  for (const started = Date.now(); Date.now() - started < 1000; ) {
    await delay(100)
    const next = await snapshot(win, width)
    if (next.toBitmap().equals(previous.toBitmap())) return next
    previous = next
  }
  return previous
}

/** Screenshot the page from `from` to `to` (CSS pixels), one screen at a time, and join the slices. */
async function stitch(
  win: BrowserWindow,
  run: <T>(script: string) => Promise<T>,
  width: number,
  viewportHeight: number,
  from: number,
  to: number,
): Promise<Electron.NativeImage> {
  const rows: Buffer[] = []
  let covered = from
  for (let y = from; covered < to; y += viewportHeight) {
    await run(`scrollTo({ top: ${y}, behavior: 'instant' })`)
    const slice = await settledSnapshot(win, width)
    const scrollY = await run<number>('scrollY')
    const crop = sliceCrop(covered, scrollY, viewportHeight, to)
    if (!crop) break
    const scale = slice.getSize().height / viewportHeight
    rows.push(
      slice
        .crop({ x: 0, y: Math.round(crop.top * scale), width, height: Math.round(crop.height * scale) })
        .toBitmap(),
    )
    covered = scrollY + crop.top + crop.height
    // Fixed headers and banners would repeat in every slice, so hide them after the first.
    if (rows.length === 1) await run(HIDE_FIXED)
    if (scrollY + viewportHeight >= to) break
  }
  const bitmap = Buffer.concat(rows)
  return nativeImage.createFromBitmap(bitmap, { width, height: bitmap.length / (width * 4) })
}

const HIDE_FIXED = `for (const el of document.querySelectorAll('body *')) {
  const { position } = getComputedStyle(el)
  if (position === 'fixed' || (position === 'sticky' && el.getBoundingClientRect().top < 120)) {
    el.setAttribute('data-steward-visibility', el.style.getPropertyValue('visibility'))
    el.style.setProperty('visibility', 'hidden', 'important')
  }
}`

/** Puts back what HIDE_FIXED hid, so a second picture of the same page starts the way the first did. */
const SHOW_FIXED = `for (const el of document.querySelectorAll('[data-steward-visibility]')) {
  const was = el.getAttribute('data-steward-visibility')
  if (was) el.style.setProperty('visibility', was)
  else el.style.removeProperty('visibility')
  el.removeAttribute('data-steward-visibility')
}`

const FREEZE_ANIMATIONS =
  '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition: none !important; scroll-behavior: auto !important; caret-color: transparent !important }'

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
