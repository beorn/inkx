/**
 * Empty-state scenario — no events at all. The session spawns, never
 * receives session-init, and the UI shows the Welcome panel.
 *
 * Used by visual tests that verify the first-time-user experience:
 * commands list, keybindings list, brand glyphs, side-panel version rows.
 */

import type { AgentEvent } from "@km/agent-harness"

/** Zero events — the app renders Welcome until something arrives. */
export const welcome: ReadonlyArray<AgentEvent> = []
