import { panelVars } from '../../shared/steward'
import type { StewardPrefs } from '../../shared/types'

/** Paint the panel's tint and frost: custom properties on the root, which styles.css builds the glass from. */
export function applyPanelLook(look: Pick<StewardPrefs, 'tint' | 'frost'>, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(panelVars(look))) root.style.setProperty(name, value)
}
