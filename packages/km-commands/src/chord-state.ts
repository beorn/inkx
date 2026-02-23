/**
 * Chord State Machine
 *
 * Handles multi-key sequences (chords) like za, gg, zM.
 * State: idle → pending(prefix) → resolved/fallback/replay.
 * 300ms timeout: if no second key, fires standalone command for the prefix.
 */

export type ChordResult =
  | { type: "pending"; prefix: string }
  | { type: "resolved"; commandId: string }
  | { type: "fallback"; commandId: string }
  | { type: "passthrough" }
  | { type: "replay"; standaloneId: string; replayKey: string }

export interface ChordCallbacks {
  isChordPrefix: (key: string) => boolean
  resolveChord: (
    prefix: string,
    key: string,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
    ctx: unknown,
  ) => string | null
  resolveStandalone: (key: string) => string | null
}

export interface ChordState {
  /** Current pending prefix, or null if idle */
  readonly pending: string | null
  /**
   * Process a key press through the chord state machine.
   *
   * @param key - The key string (e.g., "z", "a", "M")
   * @param hasModifiers - True if any modifier (ctrl/meta/shift/alt) is held
   * @param modifiers - The full modifier set (for chord resolution)
   * @param ctx - Keybinding context (for chord when predicates)
   * @param resolver - Callbacks for chord prefix/resolution queries
   */
  processKey(
    key: string,
    hasModifiers: boolean,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
    ctx: unknown,
    resolver: ChordCallbacks,
  ): ChordResult
  /** Cancel any pending chord (e.g., when entering text mode or modal) */
  cancel(): void
  /** Timeout: clear pending state and return the prefix (caller resolves standalone) */
  timeout(): string | null
}

/**
 * Build a composite chord prefix string from a key + modifiers.
 * Returns null if no modifiers are present (caller should use bare key).
 * Format: "Ctrl+w", "Ctrl+Shift+x", etc.
 */
function buildChordPrefix(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
): string | null {
  const parts: string[] = []
  if (modifiers.ctrl) parts.push("Ctrl")
  if (modifiers.meta) parts.push("Alt")
  if (modifiers.shift) parts.push("Shift")
  if (parts.length === 0) return null
  parts.push(key)
  return parts.join("+")
}

export function createChordState(): ChordState {
  let pendingPrefix: string | null = null

  return {
    get pending() {
      return pendingPrefix
    },

    processKey(key, hasModifiers, modifiers, ctx, resolver) {
      // If we have a pending prefix, try to complete the chord
      if (pendingPrefix !== null) {
        const prefix = pendingPrefix
        pendingPrefix = null

        // Try to resolve the chord (prefix + second key)
        const commandId = resolver.resolveChord(prefix, key, modifiers, ctx)
        if (commandId) {
          return { type: "resolved", commandId }
        }

        // No chord match → replay: fire standalone for prefix + replay second key
        const standaloneId = resolver.resolveStandalone(prefix)
        if (standaloneId) {
          return { type: "replay", standaloneId, replayKey: key }
        }

        // No standalone either — just pass through the second key
        return { type: "passthrough" }
      }

      // No pending prefix — check if this key starts a chord
      // Try composite prefix first (e.g., "Ctrl+w"), then bare key (unmodified only)
      const compositePrefix = buildChordPrefix(key, modifiers)
      if (compositePrefix && resolver.isChordPrefix(compositePrefix)) {
        pendingPrefix = compositePrefix
        return { type: "pending", prefix: compositePrefix }
      }
      if (!hasModifiers && resolver.isChordPrefix(key)) {
        pendingPrefix = key
        return { type: "pending", prefix: key }
      }

      // Not a chord prefix — normal keybinding resolution
      return { type: "passthrough" }
    },

    cancel() {
      pendingPrefix = null
    },

    timeout() {
      if (pendingPrefix === null) return null
      const prefix = pendingPrefix
      pendingPrefix = null
      return prefix
    },
  }
}
