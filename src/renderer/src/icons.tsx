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

export const ChevronLeftIcon = () => (
  <svg {...base}>
    <path d="M10 3L5 8l5 5" />
  </svg>
)

export const HideIcon = () => (
  <svg {...base}>
    <path d="M2 8s2.2-4.2 6-4.2S14 8 14 8s-2.2 4.2-6 4.2S2 8 2 8z" />
    <circle cx="8" cy="8" r="1.8" />
    <path d="M2.5 13.5l11-11" />
  </svg>
)

export const NewChatIcon = () => (
  <svg {...base}>
    <path d="M13.5 8.5v4a1 1 0 01-1 1h-9a1 1 0 01-1-1v-9a1 1 0 011-1h4M11.6 2.4l2 2L8.2 9.8 5.8 10.2l.4-2.4z" />
  </svg>
)

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </svg>
)

export const ExternalIcon = () => (
  <svg {...base}>
    <path d="M9.5 2.5h4v4M13.5 2.5L8 8M12 9.5v3a1 1 0 01-1 1H3.5a1 1 0 01-1-1V5a1 1 0 011-1h3" />
  </svg>
)

/* ---------- activity steps ---------- */
export const FileIcon = () => (
  <svg {...base}>
    <path d="M9.5 1.8H4.5a1 1 0 00-1 1v10.4a1 1 0 001 1h7a1 1 0 001-1V4.8z" />
    <path d="M9.5 1.8v3h3" />
  </svg>
)

export const FolderIcon = () => (
  <svg {...base}>
    <path d="M1.8 4.5a1 1 0 011-1h3.2l1.5 1.5h5.7a1 1 0 011 1v6.5a1 1 0 01-1 1H2.8a1 1 0 01-1-1z" />
  </svg>
)

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="4.3" />
    <path d="M10.2 10.2l3.6 3.6" />
  </svg>
)

export const GlobeIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.7 3.8 2.7 6.2S9.8 12.5 8 14.2C6.2 12.5 5.3 10.4 5.3 8S6.2 3.5 8 1.8z" />
  </svg>
)

export const TerminalIcon = () => (
  <svg {...base}>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
    <path d="M4.5 6.2L6.6 8 4.5 9.8M8.2 10h3.3" />
  </svg>
)

export const CameraIcon = () => (
  <svg {...base}>
    <path d="M2 5.2a1 1 0 011-1h2l1.2-1.6h3.6L11 4.2h2a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
    <circle cx="8" cy="8.6" r="2.4" />
  </svg>
)

export const ImageIcon = () => (
  <svg {...base}>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
    <circle cx="5.6" cy="6.3" r="1.2" />
    <path d="M2.2 11.6l3.6-3.4 2.6 2.4 2.2-2 3.2 3" />
  </svg>
)

export const LogsIcon = () => (
  <svg {...base}>
    <path d="M3 3.5h10M3 6.5h10M3 9.5h6.5M3 12.5h8" />
  </svg>
)

export const PhotosIcon = () => (
  <svg {...base}>
    <rect x="3.8" y="1.8" width="10.4" height="8.6" rx="1.4" />
    <path d="M2 5.6v7.1a1.5 1.5 0 001.5 1.5h7.1" />
    <path d="M4.2 9l3-2.6 2.2 1.9 1.6-1.4 2.8 2.4" />
  </svg>
)
