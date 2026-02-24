/**
 * Chord State Machine
 *
 * Handles multi-key sequences (chords) like za, gg, zM.
 * State: idle → pending(prefix) → resolved/fallback/replay.
 * 300ms timeout: if no second key, fires standalone command for the prefix.
 */

export type ChordResult =
  | { type: "pending"; prefix: string }
  | { type: "resolved"; commandId: string; targetId?: string }
  | { type: "fallback"; commandId: string; targetId?: string }
  | { type: "passthrough" }
  | { type: "cancelled" }
  | { type: "replay"; standaloneId: string; standaloneTargetId?: string; replayKey: string }

/** Resolved binding from keybinding resolution */
interface Resolved {
  commandId: string
  targetId?: string
}

export interface ChordCallbacks {
  isChordPrefix: (key: string) => boolean
  resolveChord: (
    prefix: string,
    key: string,
    modifiers: { ctrl?: boolean; opt?: boolean; shift?: boolean },
    ctx: unknown,
  ) => Resolved | null
  resolveStandalone: (key: string) => Resolved | null
}

export interface ChordState {
  /** Current pending prefix, or null if idle */
  readonly pending: string | null
  /**
   * Process a key press through the chord state machine.
   *
   * @param key - The key string (e.g., "z", "a", "M")
   * @param hasModifiers - True if any modifier (ctrl/opt/shift/cmd) is held
   * @param modifiers - The full modifier set (for chord resolution)
   * @param ctx - Keybinding context (for chord when predicates)
   * @param resolver - Callbacks for chord prefix/resolution queries
   */
  processKey(
    key: string,
    hasModifiers: boolean,
    modifiers: { ctrl?: boolean; opt?: boolean; shift?: boolean },
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
  modifiers: { ctrl?: boolean; opt?: boolean; shift?: boolean },
): string | null {
  const parts: string[] = []
  if (modifiers.ctrl) parts.push("Ctrl")
  if (modifiers.opt) parts.push("Alt")
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

        // Escape always cancels a pending chord (silently, no bell)
        if (key === "Escape") {
          return { type: "cancelled" }
        }

        // Try to resolve the chord (prefix + second key)
        const resolved = resolver.resolveChord(prefix, key, modifiers, ctx)
        if (resolved) {
          return resolved.targetId
            ? { type: "resolved", commandId: resolved.commandId, targetId: resolved.targetId }
            : { type: "resolved", commandId: resolved.commandId }
        }

        // No chord match → replay: fire standalone for prefix + replay second key
        const standalone = resolver.resolveStandalone(prefix)
        if (standalone) {
          return standalone.targetId
            ? { type: "replay", standaloneId: standalone.commandId, standaloneTargetId: standalone.targetId, replayKey: key }
            : { type: "replay", standaloneId: standalone.commandId, replayKey: key }
        }

        // No standalone either — invalid second key, cancel chord + ring bell
        return { type: "cancelled" }
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
