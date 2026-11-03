const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/** A cog with six teeth. (Rays around a circle read as a sun, the light and dark mode icon.) */
export const GearIcon = () => (
  <svg {...base}>
    <path d="M6.57 3.31L6.74 1.52A6.6 6.6 0 0 1 9.26 1.52L9.43 3.31A4.9 4.9 0 0 1 11.34 4.42L12.98 3.67A6.6 6.6 0 0 1 14.24 5.85L12.77 6.9A4.9 4.9 0 0 1 12.77 9.1L14.24 10.15A6.6 6.6 0 0 1 12.98 12.33L11.34 11.58A4.9 4.9 0 0 1 9.43 12.69L9.26 14.48A6.6 6.6 0 0 1 6.74 14.48L6.57 12.69A4.9 4.9 0 0 1 4.66 11.58L3.02 12.33A6.6 6.6 0 0 1 1.76 10.15L3.23 9.1A4.9 4.9 0 0 1 3.23 6.9L1.76 5.85A6.6 6.6 0 0 1 3.02 3.67L4.66 4.42A4.9 4.9 0 0 1 6.57 3.31Z" />
    <circle cx="8" cy="8" r="2" />
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

/** Settings sidebar: General. */
export const SlidersIcon = () => (
  <svg {...base}>
    <path d="M2.5 4.5H4M7 4.5h6.5M2.5 8h7M12.5 8h1M2.5 11.5h2.5M8 11.5h5.5" />
    <circle cx="5.5" cy="4.5" r="1.5" />
    <circle cx="11" cy="8" r="1.5" />
    <circle cx="6.5" cy="11.5" r="1.5" />
  </svg>
)

/** Settings sidebar: Steward, as its own face. */
export const FaceIcon = () => (
  <svg {...base}>
    <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="3.4" />
    <path d="M6 6.8v2.2M10 6.8v2.2" />
  </svg>
)

export const KeyboardIcon = () => (
  <svg {...base}>
    <rect x="1.5" y="3.8" width="13" height="8.4" rx="1.8" />
    <path d="M4.2 6.6h.01M6.7 6.6h.01M9.3 6.6h.01M11.8 6.6h.01M5 9.5h6" />
  </svg>
)

export const PlugIcon = () => (
  <svg {...base}>
    <path d="M6 1.8v3M10 1.8v3M4.4 4.8h7.2v2.4a3.6 3.6 0 0 1-7.2 0zM8 10.8v3.4" />
  </svg>
)

export const BellIcon = () => (
  <svg {...base}>
    <path d="M4 10.8V7.4a4 4 0 0 1 8 0v3.4l1.2 1.4H2.8zM6.6 14.2h2.8" />
  </svg>
)


/** Send: an arrow up (design/main-chat.html). */
export const SendIcon = () => (
  <svg {...base}>
    <path d="M8 13V3M8 3L4 7M8 3l4 4" />
  </svg>
)

export const StopIcon = () => (
  <svg {...base}>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" />
  </svg>
)

/** Auto, in the Ask | Auto switch. */
export const ShieldIcon = () => (
  <svg {...base}>
    <path d="M8 1.8l5 1.8v4c0 3-2 5-5 6.6C5 12.6 3 10.6 3 7.6v-4z" />
  </svg>
)

/** A command that ran by itself. */
export const ShieldOkIcon = () => (
  <svg {...base}>
    <path d="M8 1.8l5 1.8v4c0 3-2 5-5 6.6C5 12.6 3 10.6 3 7.6v-4z" />
    <path d="M5.6 8l1.7 1.7L10.6 6.3" />
  </svg>
)

/** A crescent moon: Goodnight, Overnight Watch. */
export const MoonIcon = () => (
  <svg {...base}>
    <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" />
  </svg>
)

/* ---------- the panel's cards (tile headings) ---------- */
export const EyeIcon = () => (
  <svg {...base}>
    <path d="M1.8 8s2.3-4.4 6.2-4.4S14.2 8 14.2 8s-2.3 4.4-6.2 4.4S1.8 8 1.8 8z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
)

/** Claude Code sessions: two people. */
export const PeopleIcon = () => (
  <svg {...base}>
    <circle cx="6" cy="5.6" r="2.3" />
    <path d="M1.8 13.4c.5-2.4 2.2-3.7 4.2-3.7s3.7 1.3 4.2 3.7M10.6 3.6a2.2 2.2 0 010 4.1M12.1 9.9c1.2.5 1.9 1.6 2.1 3.2" />
  </svg>
)

/** Where you left off: a branch. */
export const BranchIcon = () => (
  <svg {...base}>
    <circle cx="4.5" cy="3.6" r="1.6" />
    <circle cx="4.5" cy="12.4" r="1.6" />
    <circle cx="11.5" cy="5.6" r="1.6" />
    <path d="M4.5 5.2v5.6M11.5 7.2c0 2.6-2.4 3-7 3.6" />
  </svg>
)

/** Things to try. */
export const SparkIcon = () => (
  <svg {...base}>
    <path d="M8 1.8l1.5 4.7L14.2 8l-4.7 1.5L8 14.2l-1.5-4.7L1.8 8l4.7-1.5z" />
  </svg>
)

/** A build that failed. */
export const WarningIcon = () => (
  <svg {...base}>
    <path d="M8 2.2l6.2 11H1.8z" />
    <path d="M8 6.6v3M8 11.6h.01" />
  </svg>
)

/** The morning brief: the sun coming up over the horizon. */
export const SunriseIcon = () => (
  <svg {...base}>
    <path d="M1.8 12.5h12.4M4.6 12.5a3.4 3.4 0 016.8 0M8 3.2v2M3.2 6.8l1.3 1.1M12.8 6.8l-1.3 1.1" />
  </svg>
)
