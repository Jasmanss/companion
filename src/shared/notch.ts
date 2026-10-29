// Steward docked in the MacBook notch: its sizes and its shape, shared by the main process (which lets clicks through
// everywhere but the shape) and the notch window (which draws it). Designed in design/notch.html.
//
// The notch is pure black, so the character's body becomes a black shape with the real notch, and its color becomes
// the light of its eyes. Chin: the notch grows a lip below it, as wide as the notch, with the eyes in it. Wings: one
// eye on each side of the notch, in the menu bar; the thinking dots and the talking mouth need the middle, so for
// those it grows the chin too. Asleep, it's only the notch's own black. With the cursor on it, it grows a little. An
// alert comes out under it, below the menu bar, joined to the chin (Wings grows its chin for that too).
//
// The island (the third style): one black shape joined to the notch, sized by what's going on (design/showcase,
// section 7, "Peeking, as one joined island"). At rest there's no island and Steward peeks out from behind the notch's
// left edge; while Claude works the compact island grows out of the notch, Steward steps into its left side and the
// status sits on its right. For a short message (Claude finished, a second project started) it grows a little wider
// and taller, the note size, with one line under the notch, then settles back to compact. A message too long for one
// line grows taller still (the long note), never cut off. For something that needs you (an approval, a question, a
// failed build) or a review it grows big, and Steward joins it: its body melts into the black and its lit eyes sit in
// an avatar spot on the left, like a caller's photo.
import type { IslandNote, IslandRight, Mood, NotchGeometry, NotchLayout, NotchStyle } from './types'

/** How tall the eyes are, in points; the lip and the wings are sized from it. */
export const NOTCH_EYE = 14
/** The chin below the notch. */
export const NOTCH_LIP = NOTCH_EYE + 8
/** Each wing beside the notch. */
export const NOTCH_WING = NOTCH_EYE + 14
/** The black's bottom corners. The real notch's radius isn't reported anywhere; 10 matched by eye. */
export const NOTCH_RADIUS = 10
/** The window along the top of the screen that holds it, centered on the notch. */
export const NOTCH_WINDOW = { width: 360, height: 96 } as const
/** The island's window is bigger: the review size and the springs' overshoot past it. */
export const ISLAND_WINDOW = { width: 500, height: 200 } as const
/** Hovered (the cursor on the black, Always visible): the chin this much taller, or the wings this much wider in all. */
export const NOTCH_HOVER_LIP = 4
export const NOTCH_HOVER_WINGS = 8

/** Moods whose face needs the middle: the thinking dots, the talking mouth. */
const MIDDLE: ReadonlySet<Mood> = new Set(['thinking', 'talking'])
export const needsMiddle = (mood: Mood): boolean => MIDDLE.has(mood)

/** The black, for a style and mood: how far down the lip reaches (from the top), and how wide the wings are (0: none). */
export interface NotchShape {
  lip: number
  wings: number
}
/**
 * hover: the cursor is on it, so it grows a little (the chin taller, or the wings wider). Only while awake. nudge: an
 * alert is out under it, joined to the chin, so Wings shows its chin too.
 */
export function notchShape(style: NotchStyle, mood: Mood, notch: { width: number; height: number }, awake = true, hover = false, nudge = false): NotchShape {
  // Asleep (Only when needed, at rest): exactly the notch, no chin and no wings, so nothing under it is covered.
  if (!awake) return { lip: notch.height, wings: 0 }
  const middle = needsMiddle(mood)
  // Talking's mouth sits under the eyes, so the lip grows a little to make room.
  const chin = notch.height + NOTCH_LIP + (mood === 'talking' ? 5 : 0)
  if (style === 'wings') return { lip: middle || nudge ? chin : notch.height, wings: notch.width + 2 * NOTCH_WING + (hover ? NOTCH_HOVER_WINGS : 0) }
  return { lip: chin + (hover ? NOTCH_HOVER_LIP : 0), wings: 0 }
}

/** The cursor on the black this long before it counts as hovering, and off it this long before it stops, so the edge of the black never flickers. */
export const HOVER_IN_MS = 80
export const HOVER_OUT_MS = 250

/** Hovering or not, and since when the cursor has been saying otherwise (null: it agrees). */
export interface HoverState {
  hover: boolean
  since: number | null
}
export const noHover = (): HoverState => ({ hover: false, since: null })

/** One look: over is whether the cursor is on the black now. It switches only once it has said so for long enough. */
export function stepHover(s: HoverState, over: boolean, now: number): HoverState {
  if (over === s.hover) return { hover: s.hover, since: null }
  const since = s.since ?? now
  return now - since >= (over ? HOVER_IN_MS : HOVER_OUT_MS) ? { hover: over, since: null } : { hover: s.hover, since }
}

/**
 * Where something that comes out of the notch goes (a nudge): centered under the notch on the
 * notch's own screen, its top at the top of that screen's work area (just under the menu bar), kept inside the work
 * area with margin points to spare at the sides.
 */
export function underNotch(notch: { x: number; width: number }, area: Box, size: { width: number; height: number }, margin = 8): Box {
  const width = Math.min(size.width, area.width - 2 * margin)
  const height = Math.min(size.height, area.height)
  const centered = notch.x + notch.width / 2 - width / 2
  const x = Math.round(Math.min(area.x + area.width - margin - width, Math.max(area.x + margin, centered)))
  return { x, y: area.y, width, height }
}

/** A nudge under the notch: its black reaches this far below the chin, room for one line of text. */
export const NOTCH_NUDGE_BELOW = 30
/** Where its black starts: this far under the menu bar line, joined to the chin by concave corners this size. */
export const NOTCH_NUDGE_FILLET = 8

/**
 * Where a nudge goes in the notch: centered under it, its top at the menu bar line (it never covers the menu bar), and
 * tall enough to reach NOTCH_NUDGE_BELOW under the chin, where its one line of text sits.
 */
export function nudgeUnderNotch(notch: NotchGeometry, area: Box, width: number): Box {
  const bottom = notch.y + notch.height + NOTCH_LIP + NOTCH_NUDGE_BELOW
  return underNotch(notch, area, { width, height: Math.max(NOTCH_NUDGE_FILLET + NOTCH_NUDGE_BELOW, bottom - area.y) })
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}
/** Where the black is, in window coordinates: the only place the window takes clicks. */
export function notchBoxes(shape: NotchShape, l: NotchLayout): Box[] {
  const boxes: Box[] = [{ x: l.cx - l.width / 2, y: 0, width: l.width, height: shape.lip }]
  if (shape.wings) boxes.push({ x: l.cx - shape.wings / 2, y: 0, width: shape.wings, height: l.height })
  return boxes
}
/* ---------- The island ---------- */

/** How far the compact island reaches past the notch on each side, in points: Steward on the left, the status on the right. */
export const ISLAND_SIDE = 70
/** Hovered, the compact island is this much wider in all, and the status moves out by half of it. */
export const ISLAND_HOVER = 12
/** The note size: this far past the notch on each side, and this much taller than the notch for its one line. */
export const ISLAND_NOTE_SIDE = 98
export const ISLAND_NOTE_LINE = 28
/** The long note: as wide as the note, this much taller than the notch, for up to three lines of words. */
export const ISLAND_LONG_LINES = 62
/** The approval size (needs you, a question, a failed build) and the review size: past the notch each side, and taller. */
export const ISLAND_APPROVAL = { side: 118, below: 92 } as const
export const ISLAND_REVIEW = { side: 128, below: 140 } as const
/** In the big sizes, Steward's spot is this far in from the island's left edge; the card's words start this far below the notch. */
export const ISLAND_AVATAR_IN = 46
export const ISLAND_CARD_GAP = 2
/** Joined, Steward is drawn this big (its lit eyes carry on from the same spot). */
export const JOIN_SCALE = 1.15
/** The island's bottom corners. */
export const ISLAND_RADIUS = 24
/** Steward's Pill (64 by 54 points, the panel header's) at the notch is drawn at this scale. */
export const PEEK_SCALE = 0.8
export const PEEK_SIZE = { width: 64, height: 54 } as const

/** The sizes a message grows the island to: a note (one line), a long note (up to three), an approval, a review. */
export type IslandNoteSize = 'note' | 'long' | 'approval' | 'review'

/**
 * asleep: Steward tucked behind the notch (Only when needed, at rest). rest: no island, Steward peeks (also while the
 * panel is open at the side: it shows what's going on, and Steward looks at it). compact: the island
 * is out, Steward in its left side, the status on its right. note: the same, a little wider, with one line under the
 * notch; long: taller, for up to three lines. approval and review: big, with Steward joined. chin: an alert is out
 * under the notch (the 3b nudge, Chin and Wings only now), so the black is the chin it joins, with Steward peeking
 * beside it.
 */
export type IslandLevel = 'asleep' | 'rest' | 'compact' | IslandNoteSize | 'chin'

/** note: the size of the message showing (true: the note size), if any. A message shows even with nothing else going on. */
export function islandLevel(o: { awake: boolean; nudge: boolean; right: IslandRight | null; note?: IslandNoteSize | boolean | null; open?: boolean }): IslandLevel {
  if (o.nudge) return 'chin'
  if (!o.awake) return 'asleep'
  if (o.open) return 'rest'
  if (o.note) return o.note === true ? 'note' : o.note
  return o.right ? 'compact' : 'rest'
}

/** The size a message grows the island to. Big for what waits on you and for a review; a note otherwise, long if its words need it. */
export function noteSize(note: Pick<IslandNote, 'kind' | 'fit'>): IslandNoteSize {
  if (note.kind === 'review') return 'review'
  if (note.kind === 'wait' || note.kind === 'input' || note.kind === 'agent' || note.kind === 'failed') return 'approval'
  return note.fit === 'long' || note.fit === 'toolong' ? 'long' : 'note'
}

/** Whether Steward joins the island at this level (the big sizes): its body melts into the black, its eyes stay lit. */
export const joins = (level: IslandLevel): boolean => level === 'approval' || level === 'review'

/** Where things are for a level, from the notch's center (x) and the top of the screen (y), in points. */
export interface IslandParts {
  /** The black shape: as wide and tall as the notch means no island. */
  width: number
  height: number
  /** Steward's Pill: its center, scale and tilt (degrees). */
  pill: { x: number; y: number; scale: number; rotate: number }
  /** The status's center, or null when it isn't shown. */
  right: { x: number; y: number } | null
  /** Steward has joined the island (the big sizes): pill is its avatar spot, where its lit eyes show. */
  joined: boolean
}

/**
 * The island's size and where Steward and the status go (design/showcase/peeking.js). Steward peeks at rest from just
 * past the notch's left edge, tilted, leaning out further with the cursor on it; it steps into the compact island's left
 * side; asleep it's tucked fully behind the notch. Hovered, the compact island widens a little. The note keeps Steward and
 * the status where compact has them, beside the notch, and its line goes under the notch.
 */
export function islandParts(level: IslandLevel, notch: { width: number; height: number }, hover = false): IslandParts {
  const hw = notch.width / 2
  const y = notch.height / 2
  const pill = (x: number, rotate = 0) => ({ x, y, scale: PEEK_SCALE, rotate })
  const at = (width: number, height: number, p: IslandParts['pill'], right: IslandParts['right'], joined = false): IslandParts => ({ width, height, pill: p, right, joined })
  if (level === 'asleep') return at(notch.width, notch.height, pill(-hw + 26.5), null)
  if (level === 'chin') return at(notch.width, notch.height + NOTCH_LIP, pill(-hw - 7.5, -8), null)
  if (level === 'rest') return at(notch.width, notch.height, hover ? pill(-hw - 15.5, -12) : pill(-hw - 7.5, -8), null)
  if (level === 'note' || level === 'long') return at(notch.width + 2 * ISLAND_NOTE_SIDE, notch.height + (level === 'long' ? ISLAND_LONG_LINES : ISLAND_NOTE_LINE), pill(-hw - 34), { x: hw + 34, y })
  if (level === 'approval' || level === 'review') {
    // Big: Steward's spot is in the island's left, in the middle of the card below the notch (a little higher for a
    // review, whose buttons sit at the bottom); the status moves to the top right, like the Dynamic Island's.
    const s = level === 'approval' ? ISLAND_APPROVAL : ISLAND_REVIEW
    const width = notch.width + 2 * s.side, height = notch.height + s.below
    const top = notch.height + ISLAND_CARD_GAP
    const spot = { x: -width / 2 + ISLAND_AVATAR_IN, y: top + (height - top) / 2 - (level === 'review' ? 14 : 0), scale: JOIN_SCALE, rotate: 0 }
    return at(width, height, spot, { x: width / 2 - 30, y }, true)
  }
  return at(notch.width + 2 * ISLAND_SIDE + (hover ? ISLAND_HOVER : 0), notch.height, pill(-hw - 34), { x: hw + 34 + (hover ? ISLAND_HOVER / 2 : 0), y })
}

/* ---------- A note's words: never cut off ---------- */

/**
 * How a note's words fit: on one line (the title, then the detail), as a long note (the title on its own line and the
 * detail wrapped under it, three lines in all at most), or too long even for that (the last line ends in "…", it stays
 * out longer, and a click shows the whole text in the panel).
 */
export type NoteFit = 'note' | 'long' | 'toolong'
/** The note's words sit this far in from each side of the island, and on one line the detail starts this far after the title. */
export const NOTE_PAD = 22
export const NOTE_GAP = 6
/** The most lines a long note holds. */
export const NOTE_LINES = 3

/** How many lines text takes wrapped at spaces to width (a word wider than a line breaks wherever it must). */
export function linesFor(text: string, width: number, measure: (text: string) => number): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  let lines = 1
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (measure(next) <= width) {
      line = next
      continue
    }
    if (line) lines++
    // A word too wide for a line by itself takes as many lines as it fills, and the rest of the last one.
    const w = measure(word)
    if (w > width) {
      lines += Math.ceil(w / width) - 1
      line = ''
    } else line = word
  }
  return lines
}

/** Which way a note's words fit, for the width they have. measure(text, bold): how wide text is drawn (the title is bold). */
export function fitNote(title: string, detail: string, width: number, measure: (text: string, bold: boolean) => number): NoteFit {
  const one = measure(title, true) + (detail ? NOTE_GAP + measure(detail, false) : 0)
  if (one <= width) return 'note'
  const lines = linesFor(title, width, (t) => measure(t, true)) + linesFor(detail, width, (t) => measure(t, false))
  return lines <= NOTE_LINES ? 'long' : 'toolong'
}

/** Where the island is going: its level, and whether the cursor is on it. */
export interface IslandAim {
  level: IslandLevel
  hover: boolean
}

/** With Reduce Motion, whether going from one aim to the next needs the fade: only when the shape or Steward's place changes. */
export function fadesFor(from: IslandAim | null, to: IslandAim, notch: { width: number; height: number }): boolean {
  if (!from) return true
  return JSON.stringify(islandParts(from.level, notch, from.hover)) !== JSON.stringify(islandParts(to.level, notch, to.hover))
}

/** Where the island takes clicks, in window coordinates: the black shape, and Steward wherever it peeks. */
export function islandBoxes(parts: IslandParts, level: IslandLevel, l: NotchLayout): Box[] {
  const boxes: Box[] = [{ x: l.cx - parts.width / 2, y: 0, width: parts.width, height: parts.height }]
  if (level !== 'asleep') boxes.push({ x: l.cx + parts.pill.x - 28, y: 0, width: 56, height: parts.pill.y + 24 })
  return boxes
}

export const inBoxes = (p: { x: number; y: number }, boxes: Box[]): boolean => boxes.some((b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
