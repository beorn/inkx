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

/** Set the last key label (called from board-app handleKey). */
export function setLastKey(value: string): void {
  lastKey = value
}

/** Append to the last key label (e.g., adding resolved command). */
export function appendLastKey(suffix: string): void {
  lastKey = (lastKey ?? "") + suffix
}

/** Set the terminal focused state (called from board-app term:focus handler). */
export function setTerminalFocused(value: boolean): void {
  terminalFocused = value
}
