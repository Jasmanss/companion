const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const GearIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
  </svg>
)

export const PinIcon = ({ on }: { on: boolean }) => (
  <svg {...base} fill={on ? 'currentColor' : 'none'}>
    <path d="M10.5 1.8l3.7 3.7-2.3.8-2.4 2.4.3 3.1-1.3 1.3-2.4-2.4-3.6 3.6M5.9 10.3L3.5 7.9l1.3-1.3 3.1.3 2.4-2.4.2-2.7z" />
  </svg>
)

export const ChevronRightIcon = () => (
  <svg {...base}>
    <path d="M6 3l5 5-5 5" />
  </svg>
)

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

export const DragIcon = () => (
  <svg {...base}>
    <path d="M8 2v12M8 2L5.5 4.5M8 2l2.5 2.5M8 14l-2.5-2.5M8 14l2.5-2.5M2 8h12M2 8l2.5-2.5M2 8l2.5 2.5M14 8l-2.5-2.5M14 8l-2.5 2.5" />
  </svg>
)
