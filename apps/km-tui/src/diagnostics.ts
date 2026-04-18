/**
 * Diagnostic signals — shared mutable state for cross-boundary diagnostics.
 *
 * Used by board-app.ts (writes) and tui.tsx heartbeat (reads) to report
 * event-loop blocks with context (last key, terminal focus state).
 *
 * These are plain module-level variables — not globalThis — because both
 * producer and consumer are inside km-tui and can import directly.
 */

/** Last key label, updated by board-app handleKey. Includes command if resolved. */
export let lastKey: string | undefined

/** Whether the terminal window has focus, updated by board-app term:focus handler. */
export let terminalFocused: boolean | undefined

/**
 * Current startup phase marker — set before entering each phase of runBoard() so
 * the event-loop heartbeat can report *which* phase blocked when the warning fires
 * during startup (when lastKey is still undefined). Cleared on first keypress.
 *
 * See apps/km-tui/src/tui.tsx for phase marker sites.
 */
export let startupPhase: string | undefined

/** Set the last key label (called from board-app handleKey). */
export function setLastKey(value: string): void {
  lastKey = value
  // Once the user has pressed a key, startup is over — clear the phase marker
  // so subsequent blocks are attributed to the key, not a stale startup phase.
  startupPhase = undefined
}

/** Append to the last key label (e.g., adding resolved command). */
export function appendLastKey(suffix: string): void {
  lastKey = (lastKey ?? "") + suffix
}

/** Set the terminal focused state (called from board-app term:focus handler). */
export function setTerminalFocused(value: boolean): void {
  terminalFocused = value
}

/** Set the current startup-phase marker (for event-loop heartbeat attribution). */
export function setStartupPhase(phase: string): void {
  startupPhase = phase
}
