/**
 * Explore Invariants — TTY-level checks for automated exploration
 *
 * These invariants run after every action during an exploration session
 * (e.g. via mcp__tty__* tools or driver.press()). They operate on the
 * *rendered* screen text and *on-disk* vault state — the layer the user
 * actually sees — and are deliberately decoupled from internal board state.
 *
 * Why a separate layer from `src/invariants.ts`?
 *   - `src/invariants.ts` runs inside the app and checks board/tree/cursor
 *     consistency using OpCtx. It assumes the app is live.
 *   - `src/explore/invariants.ts` runs *outside* the app, from a test/probe
 *     driving the TTY. It only has access to screen text and file hashes,
 *     and must catch bugs that state-level checks miss (visible internal IDs,
 *     unexpected file mutations during pure navigation, etc.).
 *
 * An invariant is a pure function `(state) => violation | null`. Composing
 * them is done with `runAll(state, invariants)`. No throwing — callers
 * decide how to react (log, stop, bead, broadcast).
 *
 * ## Usage
 *
 * ```typescript
 * import { allInvariants, runAll } from "./invariants.ts"
 *
 * const state = { vaultPath, vaultMd5, rendered, cursor }
 * const violations = runAll(state, allInvariants)
 * for (const v of violations) {
 *   log(`[${v.severity}] ${v.invariant}: ${v.details}`)
 * }
 * ```
 */

/** A violation severity. P0 = bug blocking exploration, P1 = real bug, P2 = smell. */
export type InvariantSeverity = "P0" | "P1" | "P2"

/**
 * Snapshot of everything an invariant might want to look at.
 *
 * `vaultMd5` is a map of relative-or-absolute file path → md5 hex digest
 * of the file contents at the time the snapshot was taken. The runner uses
 * the *change* in this map across an action to detect mutations.
 *
 * `rendered` is the full TTY screen text (joined rows, with or without ANSI
 * stripped — invariants that care about visible text only should work on
 * plain text; callers are responsible for passing plain text when that is
 * what they want).
 *
 * `cursor.path` is an optional breadcrumb path (e.g. "Board > Todo > Buy milk")
 * that some invariants compare against the top-of-screen breadcrumb.
 */
export interface ExploreState {
  /** Absolute path to the vault the TUI is viewing */
  vaultPath: string
  /** file path → md5 hex digest for every file under vaultPath */
  vaultMd5: Map<string, string>
  /** Full rendered screen text (plain, ANSI-stripped) */
  rendered: string
  /** Cursor snapshot — all fields optional because callers may not have them */
  cursor: {
    /** Stable node ID the cursor points at, if known */
    nodeId: string | null
    /** Which nodes are currently visible on screen (IDs), if known */
    visibleNodeIds?: Set<string>
    /** Breadcrumb path matching the current cursor location, if known */
    path?: string[] | null
  }
}

/**
 * A single invariant check. Pure function; returns `null` on pass or a
 * violation on fail. Invariants MUST NOT throw — throwing is reserved for
 * programming errors (e.g. invariant list is malformed).
 */
export interface ExploreInvariant {
  /** Short kebab-case identifier, e.g. "no-internal-ids" */
  name: string
  /** Human-readable description, used in docs and violation details */
  description: string
  /** Severity when this invariant fails */
  severity: InvariantSeverity
  /** Predicate: return violation on fail, null on pass */
  check: (state: ExploreState, before?: ExploreState) => InvariantViolation | null
}

/** One invariant failure. */
export interface InvariantViolation {
  /** Which invariant failed (matches `ExploreInvariant.name`) */
  invariant: string
  /** Severity lifted from the invariant */
  severity: InvariantSeverity
  /** Human-readable explanation, including any offending text snippets */
  details: string
}

// =============================================================================
// Patterns
// =============================================================================

/**
 * 8-character hexadecimal IDs wrapped in parens, as leaked by internal
 * debug prints. Example: `(XWJE24KP)`. We match both lower and upper case
 * to be robust. The two forms avoid accepting things like `(12345678)`
 * which could be a legitimate number — we require at least one letter.
 */
const INTERNAL_ID_RE = /\(([0-9A-Fa-f]{8}|[0-9A-Za-z]{8})\)/g

/**
 * Pattern for 8-char alphanumeric IDs — matches only when the group
 * contains at least one letter (so pure digit strings like `(12345678)`
 * don't trigger).
 */
function findInternalIds(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(INTERNAL_ID_RE)) {
    const id = m[1] ?? ""
    if (/[A-Za-z]/.test(id)) out.push(m[0] ?? "")
  }
  return out
}

// =============================================================================
// Individual invariants
// =============================================================================

/**
 * #1 — Rendered output must not contain 8-char hex/alphanum IDs in parens
 * like `(XWJE24KP)`. These are internal node IDs that have leaked into
 * user-visible text; they are never intentional.
 */
export const noInternalIds: ExploreInvariant = {
  name: "no-internal-ids",
  description: "Rendered output must not contain 8-char internal IDs in parens like (XWJE24KP)",
  severity: "P1",
  check(state) {
    const hits = findInternalIds(state.rendered)
    if (hits.length === 0) return null
    return {
      invariant: "no-internal-ids",
      severity: "P1",
      details: `Found ${hits.length} leaked internal ID(s) in rendered output: ${hits.slice(0, 5).join(", ")}${
        hits.length > 5 ? ` (+${hits.length - 5} more)` : ""
      }`,
    }
  },
}

/**
 * #2 — Rendered output must not contain the string "[object Object]",
 * which indicates a value was templated without a proper toString().
 */
export const noObjectObject: ExploreInvariant = {
  name: "no-object-object",
  description: 'Rendered output must not contain "[object Object]"',
  severity: "P1",
  check(state) {
    if (!state.rendered.includes("[object Object]")) return null
    return {
      invariant: "no-object-object",
      severity: "P1",
      details: 'Rendered output contains "[object Object]" — a value was stringified without a toString()',
    }
  },
}

/**
 * #3 — Rendered output must not contain the literal "NaN". We use a
 * word-boundary match so text like "Banana" is not flagged.
 */
export const noNaN: ExploreInvariant = {
  name: "no-nan",
  description: 'Rendered output must not contain the literal "NaN"',
  severity: "P1",
  check(state) {
    if (!/\bNaN\b/.test(state.rendered)) return null
    return {
      invariant: "no-nan",
      severity: "P1",
      details: 'Rendered output contains "NaN" — numeric computation produced an invalid value',
    }
  },
}

/**
 * #4 — Rendered output must not contain "TypeError", which is typically
 * a thrown error that escaped into render text.
 */
export const noTypeError: ExploreInvariant = {
  name: "no-typeerror",
  description: 'Rendered output must not contain "TypeError"',
  severity: "P0",
  check(state) {
    if (!state.rendered.includes("TypeError")) return null
    return {
      invariant: "no-typeerror",
      severity: "P0",
      details: 'Rendered output contains "TypeError" — a runtime error surfaced into the UI',
    }
  },
}

/**
 * #5 — Navigation keys (j/k/h/l/Tab/Escape) must NOT mutate vault files.
 * This is only meaningful when the runner knows the action was a pure nav;
 * the runner sets `isMutation=false` and this check compares md5 maps.
 *
 * The invariant itself just checks that vaultMd5 is equal to `before.vaultMd5`
 * — callers are responsible for only running it on nav actions.
 */
export const vaultUnchangedByNav: ExploreInvariant = {
  name: "vault-unchanged-by-nav",
  description: "Navigation keys must not change any vault file's md5",
  severity: "P0",
  check(state, before) {
    if (!before) return null
    const changed: string[] = []
    // Check files that existed before
    for (const [path, md5] of before.vaultMd5) {
      const now = state.vaultMd5.get(path)
      if (now === undefined) {
        changed.push(`${path} (deleted)`)
      } else if (now !== md5) {
        changed.push(`${path} (modified)`)
      }
    }
    // Check for files that appeared
    for (const path of state.vaultMd5.keys()) {
      if (!before.vaultMd5.has(path)) changed.push(`${path} (created)`)
    }
    if (changed.length === 0) return null
    return {
      invariant: "vault-unchanged-by-nav",
      severity: "P0",
      details: `Navigation mutated ${changed.length} file(s): ${changed.slice(0, 5).join(", ")}${
        changed.length > 5 ? ` (+${changed.length - 5} more)` : ""
      }`,
    }
  },
}

/**
 * #6 — If cursor.nodeId is set, it must be one of the visible nodes. This
 * catches stale cursors pointing at a node the user cannot see. Requires
 * caller to populate `cursor.visibleNodeIds`; skipped otherwise.
 */
export const cursorOnVisibleNode: ExploreInvariant = {
  name: "cursor-on-visible-node",
  description: "If cursor is set, it must point to a node visible in the current rendering",
  severity: "P1",
  check(state) {
    const { nodeId, visibleNodeIds } = state.cursor
    if (!nodeId) return null
    if (!visibleNodeIds) return null // caller didn't populate — skip
    if (visibleNodeIds.has(nodeId)) return null
    return {
      invariant: "cursor-on-visible-node",
      severity: "P1",
      details: `Cursor node "${nodeId}" is not among the ${visibleNodeIds.size} visible node IDs`,
    }
  },
}

/**
 * #7 — The top-of-screen breadcrumb should match the cursor's actual path.
 * We look for the first non-blank line in the rendered output and check
 * that each segment of `cursor.path` appears in order. Skipped if caller
 * didn't populate `cursor.path`.
 */
export const breadcrumbMatchesCursor: ExploreInvariant = {
  name: "breadcrumb-matches-cursor",
  description: "Top breadcrumb path matches cursor's actual path",
  severity: "P2",
  check(state) {
    const path = state.cursor.path
    if (!path || path.length === 0) return null
    // Grab the first non-empty line as the candidate breadcrumb
    const firstLine = state.rendered.split("\n").find((line) => line.trim().length > 0)
    if (!firstLine) return null
    // Every segment must appear, in order, within firstLine
    let cursor = 0
    for (const segment of path) {
      const idx = firstLine.indexOf(segment, cursor)
      if (idx < 0) {
        return {
          invariant: "breadcrumb-matches-cursor",
          severity: "P2",
          details: `Breadcrumb "${firstLine.trim()}" is missing cursor path segment "${segment}" (full path: ${path.join(" > ")})`,
        }
      }
      cursor = idx + segment.length
    }
    return null
  },
}

// =============================================================================
// Composite lists
// =============================================================================

/** Invariants safe to run after *any* action (mutation or navigation). */
export const alwaysInvariants: ExploreInvariant[] = [
  noInternalIds,
  noObjectObject,
  noNaN,
  noTypeError,
  cursorOnVisibleNode,
  breadcrumbMatchesCursor,
]

/** Invariants that only make sense after a pure-navigation action. */
export const navOnlyInvariants: ExploreInvariant[] = [vaultUnchangedByNav]

/** Full invariant list, including the nav-only ones. The runner decides which to apply. */
export const allInvariants: ExploreInvariant[] = [...alwaysInvariants, ...navOnlyInvariants]

/**
 * Run a list of invariants over a state pair and collect violations.
 * Never throws — individual invariants that return null pass; the rest
 * produce violations.
 *
 * @param state - the current snapshot (after the action)
 * @param invariants - which invariants to run
 * @param before - optional snapshot before the action (used by diff invariants)
 */
export function runAll(
  state: ExploreState,
  invariants: ExploreInvariant[],
  before?: ExploreState,
): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  for (const inv of invariants) {
    const v = inv.check(state, before)
    if (v) violations.push(v)
  }
  return violations
}
