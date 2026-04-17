/**
 * Recents Store — km-tui.omnibox-recents
 *
 * In-memory MRU registry for omnibox: tracks the last time each node was
 * visited (via `CURSOR_TO` / `ZOOM_IN` / go-to picker) and each command
 * was executed. Consumed by the shared omnibox ranker via the
 * `RankOptions.recencyBoost` hook (`apps/km-tui/src/state/omnibox-ranker.ts`).
 *
 * ## Why a separate store
 *
 * Recents are cross-cutting: they're touched from board ops (navigation),
 * from the command executor (every run), and consumed from the omnibox
 * projection (ranking). Putting them on `BoardAppStore` would couple every
 * consumer to board state it doesn't need; keeping them in their own
 * factory-created store means tests can construct an isolated recents
 * instance with a frozen clock.
 *
 * ## Recency bonus
 *
 * `recencyBoost(id)` returns a positive additive score, decaying
 * exponentially with a 7-day half-life:
 *
 *   boost = PEAK * exp(-ageMs / DECAY_MS)
 *
 * With `PEAK = 500` and `DECAY_MS = 7 days`, a node touched right now
 * contributes +500 to its rank, a node touched 7 days ago contributes ~184,
 * and a node untouched in months drops below 1. Text-match tiers start at
 * 1000+ (see omnibox-ranker.ts) so the boost nudges ties toward recent
 * items without overriding relevance.
 *
 * ## Persistence (TODO)
 *
 * v1 is in-memory only. Session restart resets the MRU to empty, which is
 * acceptable for the Phase 5 omnibox ship. Follow-up: bead
 * `km-tui.recents-persist` — move to SQLite with top-N rotation per kind.
 */

/** Peak recency bonus for a just-touched item. Below the 1000+ text-tier floor. */
export const RECENCY_PEAK = 500

/** Half-life of the recency decay. 7 days → `exp(-age/DECAY) === 0.5` at age === DECAY*ln(2). */
export const RECENCY_DECAY_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Read-only getter returning a recency bonus for an id, or 0 if untouched.
 * Suitable for `RankOptions.recencyBoost`.
 */
export type RecencyBoost = (id: string) => number

/**
 * The minimal surface the omnibox consumes. Factory-created objects satisfy
 * this; tests may also stub it directly.
 */
export interface RecentsStore {
  /** Record a node visit — called from nav ops (CURSOR_TO / ZOOM_IN / goto). */
  touchNode(id: string, now?: number): void
  /** Record a command execution — called from the command bridge post-execute. */
  touchCommand(id: string, now?: number): void
  /** Get recency bonus for a node id. 0 if never visited. */
  nodeBoost(id: string, now?: number): number
  /** Get recency bonus for a command id. 0 if never run. */
  commandBoost(id: string, now?: number): number
  /** Bound getter for RankOptions — node flavor. */
  getNodeBoost(): RecencyBoost
  /** Bound getter for RankOptions — command flavor. */
  getCommandBoost(): RecencyBoost
  /** Ordered list of node ids most-recent-first. */
  recentNodeIds(limit?: number): string[]
  /** Ordered list of command ids most-recent-first. */
  recentCommandIds(limit?: number): string[]
  /** Raw last-touched timestamp lookup (for tests / diagnostics). 0 if absent. */
  nodeTimestamp(id: string): number
  commandTimestamp(id: string): number
}

function computeBoost(lastTouchedMs: number, nowMs: number): number {
  if (lastTouchedMs <= 0) return 0
  const age = Math.max(0, nowMs - lastTouchedMs)
  return RECENCY_PEAK * Math.exp(-age / RECENCY_DECAY_MS)
}

/**
 * Create an isolated recents store. Pass a custom `now` in tests; omit in
 * production so the store uses `Date.now()` on every call.
 */
export function createRecentsStore(): RecentsStore {
  const nodes = new Map<string, number>()
  const commands = new Map<string, number>()

  const self: RecentsStore = {
    touchNode(id: string, now: number = Date.now()): void {
      if (!id) return
      nodes.set(id, now)
    },
    touchCommand(id: string, now: number = Date.now()): void {
      if (!id) return
      commands.set(id, now)
    },
    nodeBoost(id: string, now: number = Date.now()): number {
      return computeBoost(nodes.get(id) ?? 0, now)
    },
    commandBoost(id: string, now: number = Date.now()): number {
      return computeBoost(commands.get(id) ?? 0, now)
    },
    getNodeBoost(): RecencyBoost {
      return (id: string) => self.nodeBoost(id)
    },
    getCommandBoost(): RecencyBoost {
      return (id: string) => self.commandBoost(id)
    },
    recentNodeIds(limit?: number): string[] {
      const ids = [...nodes.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
      return limit === undefined ? ids : ids.slice(0, limit)
    },
    recentCommandIds(limit?: number): string[] {
      const ids = [...commands.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
      return limit === undefined ? ids : ids.slice(0, limit)
    },
    nodeTimestamp(id: string): number {
      return nodes.get(id) ?? 0
    },
    commandTimestamp(id: string): number {
      return commands.get(id) ?? 0
    },
  }
  return self
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------
//
// A single process-wide recents store is acceptable because the TUI is a
// single-vault process. Tests that need isolation call `createRecentsStore()`
// directly or `resetRecentsStore()` between runs.

let singleton: RecentsStore = createRecentsStore()

/** Get the process-wide recents store. */
export function getRecentsStore(): RecentsStore {
  return singleton
}

/** Replace the process-wide recents store. Only for tests. */
export function setRecentsStore(store: RecentsStore): void {
  singleton = store
}

/** Reset the process-wide recents store to empty. Only for tests. */
export function resetRecentsStore(): void {
  singleton = createRecentsStore()
}
