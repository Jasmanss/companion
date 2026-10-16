// Dim when idle (Settings → Steward): after a while at rest, the eyes fade and stop moving, and their drawing pauses.
// Shared by the tab's page and the notch's; the rule is pure so it's tested.

/** How long at rest, with nothing happening and the cursor away, before the eyes dim. */
export const DIM_AFTER_MS = 20_000

/**
 * The eyes may dim: the setting is on, Steward is at rest (tucked away at the edge or awake in the notch, no panel, no
 * nudge, no work), and the cursor isn't near. Anything else wakes them at once; a new mood or an alert starts the wait over.
 */
export const canDim = (o: { enabled: boolean; atRest: boolean; near: boolean }): boolean => o.enabled && o.atRest && !o.near
