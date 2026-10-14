// 16 x 16 line icons as SVG strings, drawn like the app's (src/renderer/src/icons.tsx), so the mocks match it.
const svg = (body, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`

export const ICONS = {
  gear: svg('<path d="M6.57 3.31L6.74 1.52A6.6 6.6 0 0 1 9.26 1.52L9.43 3.31A4.9 4.9 0 0 1 11.34 4.42L12.98 3.67A6.6 6.6 0 0 1 14.24 5.85L12.77 6.9A4.9 4.9 0 0 1 12.77 9.1L14.24 10.15A6.6 6.6 0 0 1 12.98 12.33L11.34 11.58A4.9 4.9 0 0 1 9.43 12.69L9.26 14.48A6.6 6.6 0 0 1 6.74 14.48L6.57 12.69A4.9 4.9 0 0 1 4.66 11.58L3.02 12.33A6.6 6.6 0 0 1 1.76 10.15L3.23 9.1A4.9 4.9 0 0 1 3.23 6.9L1.76 5.85A6.6 6.6 0 0 1 3.02 3.67L4.66 4.42A4.9 4.9 0 0 1 6.57 3.31Z"/><circle cx="8" cy="8" r="2"/>'),
  pin: svg('<path d="M10.5 1.8l3.7 3.7-2.3.8-2.4 2.4.3 3.1-1.3 1.3-2.4-2.4-3.6 3.6M5.9 10.3L3.5 7.9l1.3-1.3 3.1.3 2.4-2.4.2-2.7z"/>'),
  tuck: svg('<path d="M6 3l5 5-5 5"/>'),
  back: svg('<path d="M10 3L5 8l5 5"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  drag: svg('<path d="M8 2v12M8 2L5.5 4.5M8 2l2.5 2.5M8 14l-2.5-2.5M8 14l2.5-2.5M2 8h12M2 8l2.5-2.5M2 8l2.5 2.5M14 8l-2.5-2.5M14 8l-2.5 2.5"/>'),
  hide: svg('<path d="M2 8s2.2-4.2 6-4.2S14 8 14 8s-2.2 4.2-6 4.2S2 8 2 8z"/><circle cx="8" cy="8" r="1.8"/><path d="M2.5 13.5l11-11"/>'),
  newchat: svg('<path d="M13.5 8.5v4a1 1 0 01-1 1h-9a1 1 0 01-1-1v-9a1 1 0 011-1h4M11.6 2.4l2 2L8.2 9.8 5.8 10.2l.4-2.4z"/>'),
  external: svg('<path d="M9.5 2.5h4v4M13.5 2.5L8 8M12 9.5v3a1 1 0 01-1 1H3.5a1 1 0 01-1-1V5a1 1 0 011-1h3"/>'),
  file: svg('<path d="M9.5 1.8H4.5a1 1 0 00-1 1v10.4a1 1 0 001 1h7a1 1 0 001-1V4.8z"/><path d="M9.5 1.8v3h3"/>'),
  folder: svg('<path d="M1.8 4.5a1 1 0 011-1h3.2l1.5 1.5h5.7a1 1 0 011 1v6.5a1 1 0 01-1 1H2.8a1 1 0 01-1-1z"/>'),
  mag: svg('<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2l3.6 3.6"/>'),
  globe: svg('<circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.7 3.8 2.7 6.2S9.8 12.5 8 14.2C6.2 12.5 5.3 10.4 5.3 8S6.2 3.5 8 1.8z"/>'),
  term: svg('<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><path d="M4.5 6.2L6.6 8 4.5 9.8M8.2 10h3.3"/>'),
  cam: svg('<path d="M2 5.2a1 1 0 011-1h2l1.2-1.6h3.6L11 4.2h2a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1z"/><circle cx="8" cy="8.6" r="2.4"/>'),
  image: svg('<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><circle cx="5.6" cy="6.3" r="1.2"/><path d="M2.2 11.6l3.6-3.4 2.6 2.4 2.2-2 3.2 3"/>'),
  logs: svg('<path d="M3 3.5h10M3 6.5h10M3 9.5h6.5M3 12.5h8"/>'),
  photo: svg('<rect x="3.8" y="1.8" width="10.4" height="8.6" rx="1.4"/><path d="M2 5.6v7.1a1.5 1.5 0 001.5 1.5h7.1"/><path d="M4.2 9l3-2.6 2.2 1.9 1.6-1.4 2.8 2.4"/>'),
  sliders: svg('<path d="M2.5 4.5H4M7 4.5h6.5M2.5 8h7M12.5 8h1M2.5 11.5h2.5M8 11.5h5.5"/><circle cx="5.5" cy="4.5" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="6.5" cy="11.5" r="1.5"/>'),
  face: svg('<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="3.4"/><path d="M6 6.8v2.2M10 6.8v2.2"/>'),
  key: svg('<rect x="1.5" y="3.8" width="13" height="8.4" rx="1.8"/><path d="M4.2 6.6h.01M6.7 6.6h.01M9.3 6.6h.01M11.8 6.6h.01M5 9.5h6"/>'),
  plug: svg('<path d="M6 1.8v3M10 1.8v3M4.4 4.8h7.2v2.4a3.6 3.6 0 0 1-7.2 0zM8 10.8v3.4"/>'),
  bell: svg('<path d="M4 10.8V7.4a4 4 0 0 1 8 0v3.4l1.2 1.4H2.8zM6.6 14.2h2.8"/>'),
}
