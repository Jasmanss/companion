import type { Mood } from '../../shared/types'

/** Live face state, eased toward each mood's targets every frame. */
export interface FaceState {
  open: number
  lookX: number
  lookY: number
  brow: number
  level: number
  blink: number
}

export const initialFace = (): FaceState => ({ open: 1, lookX: 0, lookY: 0, brow: 0, level: 0, blink: 1 })

const ease = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt))

export function stepFace(f: FaceState, mood: Mood, t: number, dt: number, pointer: { x: number; y: number }, blinkAt: number): void {
  const speaking = Math.min(1, (Math.abs(Math.sin(t * 9.1)) * 0.6 + Math.abs(Math.sin(t * 3.7 + 1.3)) * 0.4) * (0.65 + 0.35 * Math.sin(t * 1.1)))
  const look = mood === 'thinking' ? [0.7, -0.6] : mood === 'resting' ? [0, 0.3] : [pointer.x, pointer.y]
  f.lookX = ease(f.lookX, look[0], 8, dt)
  f.lookY = ease(f.lookY, look[1], 8, dt)
  f.open = ease(f.open, mood === 'listening' || mood === 'needs-you' ? 1.15 : 1, 10, dt)
  f.brow = ease(f.brow, mood === 'needs-you' ? 0.5 : mood === 'listening' || mood === 'done' ? 0.35 : mood === 'resting' ? -0.25 : 0, 9, dt)
  f.level = ease(f.level, mood === 'talking' ? speaking : 0, 18, dt)
  const b = (t - blinkAt) / 0.14
  f.blink = b >= 0 && b < 1 ? 1 - 0.9 * Math.sin(b * Math.PI) : 1
}

/** Draw the glowing face, centered in a W x H canvas. */
export function drawFace(g: CanvasRenderingContext2D, W: number, H: number, f: FaceState, mood: Mood, t: number, color: string): void {
  g.clearRect(0, 0, W, H)
  const u = Math.min(W / 300, H / 230)
  const cx = W / 2 + f.lookX * 14 * u
  const cy = H * 0.44 + f.lookY * 10 * u
  g.save()
  g.shadowColor = color
  g.shadowBlur = 16 * u
  g.fillStyle = g.strokeStyle = color
  g.lineCap = g.lineJoin = 'round'

  for (const side of [-1, 1]) {
    const ex = cx + side * 58 * u
    g.lineWidth = 12 * u
    if (mood === 'done') {
      g.beginPath()
      g.arc(ex, cy + 14 * u, 24 * u, Math.PI * 1.15, Math.PI * 1.85)
      g.stroke()
    } else if (mood === 'resting') {
      g.beginPath()
      g.arc(ex, cy - 10 * u, 24 * u, Math.PI * 0.15, Math.PI * 0.85)
      g.stroke()
    } else {
      const ew = 40 * u
      const eh = Math.max(7 * u, 62 * u * f.open * f.blink)
      g.beginPath()
      g.roundRect(ex - ew / 2, cy - eh / 2, ew, eh, Math.min(ew, eh) / 2)
      g.fill()
    }
    // Brows: thinking tilts one up for a "hmm"
    const tilt = mood === 'thinking' ? side * -0.18 : 0
    const by = cy - 60 * u - (mood === 'thinking' && side < 0 ? 0.45 : f.brow) * 20 * u
    g.lineWidth = 8 * u
    g.beginPath()
    g.moveTo(ex + side * 22 * u, by + tilt * 16 * u)
    g.lineTo(ex - side * 22 * u, by - tilt * 16 * u)
    g.stroke()
  }

  const my = cy + 72 * u
  g.lineWidth = 9 * u
  g.beginPath()
  if (mood === 'talking') {
    g.ellipse(cx, my + 4 * u, 22 * u, Math.max(5 * u, f.level * 22 * u), 0, 0, Math.PI * 2)
    g.fill()
  } else if (mood === 'done') {
    g.moveTo(cx - 32 * u, my - 6 * u)
    g.quadraticCurveTo(cx, my + 44 * u, cx + 32 * u, my - 6 * u)
    g.closePath()
    g.fill()
  } else if (mood === 'thinking') {
    g.lineWidth = 7 * u
    g.arc(cx + 14 * u, my + 4 * u, 9 * u, 0, Math.PI * 2)
    g.stroke()
  } else if (mood === 'needs-you') {
    g.ellipse(cx, my + 2 * u, 10 * u, 12 * u, 0, 0, Math.PI * 2)
    g.fill()
  } else if (mood === 'resting') {
    g.moveTo(cx - 10 * u, my)
    g.lineTo(cx + 10 * u, my)
    g.stroke()
  } else {
    g.moveTo(cx - 26 * u, my)
    g.quadraticCurveTo(cx, my + (mood === 'listening' ? 6 : 30) * u, cx + 26 * u, my)
    g.stroke()
  }

  if (mood === 'thinking') {
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 5 - i * 0.9))
      g.beginPath()
      g.arc(cx + 108 * u + i * 20 * u, cy - 66 * u - i * 9 * u, (5 + i * 1.5) * u, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (mood === 'resting') {
    g.font = `600 ${30 * u}px -apple-system, system-ui, sans-serif`
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.4 + i * 0.5) % 1
      g.globalAlpha = Math.sin(p * Math.PI)
      g.fillText('z', cx + 96 * u + p * 26 * u, cy - 44 * u - p * 44 * u)
    }
  }
  g.restore()
}
