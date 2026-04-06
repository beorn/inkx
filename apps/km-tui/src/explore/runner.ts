/**
 * Explore Runner — invariant-checked action wrapper
 *
 * Wraps an exploration action (e.g. `await tty.press("j")`, a driver call,
 * a script step) so that invariants are evaluated automatically around it.
 *
 * The runner is intentionally agnostic about *how* you drive the TUI or
 * render the screen — it just needs a way to take a fresh snapshot of
 * `ExploreState` on demand. Callers provide that via `snapshot()`.
 *
 * ## Typical flow
 *
 * ```typescript
 * import { hashVault, createExploreRunner } from "./runner.ts"
 * import { allInvariants } from "./invariants.ts"
 *
 * const runner = createExploreRunner({
 *   vaultPath: "/tmp/tst-vault",
 *   snapshot: async () => ({
 *     vaultPath: "/tmp/tst-vault",
 *     vaultMd5: await hashVault("/tmp/tst-vault"),
 *     rendered: await tty.screenshot(),
 *     cursor: { nodeId: driver.getState().selectedNodeId },
 *   }),
 * })
 *
 * const { result, violations } = await runner.run(
 *   async () => tty.press("j"),
 *   { isMutation: false, label: "j" },
 * )
 * if (violations.length) console.error(violations)
 * ```
 *
 * The shorthand `withInvariants(state, action, isMutation)` is also exposed
 * for one-shot use without creating a runner.
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import {
  alwaysInvariants,
  allInvariants,
  navOnlyInvariants,
  runAll,
  type ExploreInvariant,
  type ExploreState,
  type InvariantViolation,
} from "./invariants.ts"

// =============================================================================
// Vault hashing
// =============================================================================

/** Options for `hashVault`. */
export interface HashVaultOptions {
  /**
   * File extensions to include (without the dot). Defaults to
   * `["md", "markdown"]` because km vaults are markdown-first and we don't
   * want to stat the SQLite cache on every snapshot.
   */
  extensions?: string[]
  /**
   * Directory basenames to skip. Defaults to `[".km", ".git", "node_modules"]`.
   */
  skipDirs?: string[]
}

const DEFAULT_EXTS = ["md", "markdown"]
const DEFAULT_SKIP_DIRS = [".km", ".git", "node_modules"]

/**
 * Walk `vaultPath` recursively and return a map of relative path → md5 hex.
 *
 * Synchronous + throwing is intentional: callers typically hash a vault
 * between actions, so async overhead + error handling adds little value.
 * If a file disappears mid-walk, it's simply skipped — the next snapshot
 * will reflect the absence.
 */
export function hashVault(vaultPath: string, options: HashVaultOptions = {}): Map<string, string> {
  const extensions = options.extensions ?? DEFAULT_EXTS
  const skipDirs = new Set(options.skipDirs ?? DEFAULT_SKIP_DIRS)
  const out = new Map<string, string>()

  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        const dotIdx = name.lastIndexOf(".")
        const ext = dotIdx >= 0 ? name.slice(dotIdx + 1).toLowerCase() : ""
        if (!extensions.includes(ext)) continue
        let content: Buffer
        try {
          content = readFileSync(full)
        } catch {
          continue
        }
        const md5 = createHash("md5").update(content).digest("hex")
        out.set(relative(vaultPath, full), md5)
      }
    }
  }

  walk(vaultPath)
  return out
}

// =============================================================================
// Runner
// =============================================================================

/** Options accepted by `createExploreRunner`. */
export interface ExploreRunnerOptions {
  /** Absolute vault path (purely informational — snapshots do the real work). */
  vaultPath: string
  /**
   * Asynchronous snapshot function. Called before and after each wrapped
   * action to gather `ExploreState`. Must produce a fresh snapshot every
   * time — the runner does not cache.
   */
  snapshot: () => Promise<ExploreState>
  /**
   * Invariants to run on every action, regardless of mutation flag.
   * Defaults to {@link alwaysInvariants}.
   */
  invariants?: ExploreInvariant[]
  /**
   * Invariants to run *only* when `isMutation === false` (pure nav).
   * Defaults to {@link navOnlyInvariants}.
   */
  navInvariants?: ExploreInvariant[]
  /**
   * Invoked for every violation as it's detected. Useful for logging or
   * broadcasting via tribe. The runner also returns violations from `run()`.
   */
  onViolation?: (violation: InvariantViolation, label?: string) => void
}

/** Options for a single `runner.run()` invocation. */
export interface RunOptions {
  /**
   * If `false`, nav-only invariants (e.g. `vault-unchanged-by-nav`) will
   * be applied. If `true`, only the `always` set runs because mutations
   * are expected to change files.
   */
  isMutation: boolean
  /**
   * Short label for the action, used in onViolation callbacks and
   * returned for convenience. Example: "j", "press:Enter", "type:hello".
   */
  label?: string
}

/** Return shape of `runner.run()` and `withInvariants()`. */
export interface RunResult<T> {
  /** The value returned by the wrapped action. */
  result: T
  /** Snapshot taken immediately before the action. */
  before: ExploreState
  /** Snapshot taken immediately after the action. */
  after: ExploreState
  /** All invariant violations detected by this run. */
  violations: InvariantViolation[]
}

/** The runner returned by {@link createExploreRunner}. */
export interface ExploreRunner {
  /**
   * Execute `action`, taking before/after snapshots and running the
   * configured invariants. Returns the action's result plus any
   * violations.
   */
  run<T>(action: () => Promise<T>, options: RunOptions): Promise<RunResult<T>>
  /**
   * Take a snapshot without running an action. Useful for seeding an
   * initial "before" state outside of `run()`.
   */
  snapshot(): Promise<ExploreState>
}

/**
 * Create a runner that wraps exploration actions with invariant checks.
 *
 * The runner is a thin convenience layer; everything it does can be built
 * by hand with `runAll()` + a couple of `snapshot()` calls. Use it when
 * you want the behaviour to be consistent across tests/scripts.
 */
export function createExploreRunner(options: ExploreRunnerOptions): ExploreRunner {
  const alwaysList = options.invariants ?? alwaysInvariants
  const navList = options.navInvariants ?? navOnlyInvariants
  const notify = (vs: InvariantViolation[], label?: string): void => {
    if (!options.onViolation) return
    for (const v of vs) options.onViolation(v, label)
  }

  return {
    async snapshot() {
      return options.snapshot()
    },
    async run(action, runOpts) {
      const before = await options.snapshot()
      const result = await action()
      const after = await options.snapshot()

      const violations = runAll(after, alwaysList, before)
      if (!runOpts.isMutation) {
        violations.push(...runAll(after, navList, before))
      }
      notify(violations, runOpts.label)
      return { result, before, after, violations }
    },
  }
}

// =============================================================================
// One-shot shorthand
// =============================================================================

/**
 * Execute `action` once with invariant checks, without creating a
 * reusable runner.
 *
 * Unlike the runner, this expects the caller to provide the `before`
 * state upfront and compute the `after` state themselves via the same
 * `snapshot` function. This keeps the shorthand tiny while still being
 * composable with existing test harnesses.
 *
 * @param before    - the state snapshot taken *before* `action` runs
 * @param action    - the action to run (e.g. `() => tty.press("j")`)
 * @param snapshot  - function that produces a fresh state snapshot
 * @param isMutation - `true` if the action is expected to mutate files;
 *                     nav-only invariants are skipped when true
 */
export async function withInvariants<T>(
  before: ExploreState,
  action: () => Promise<T>,
  snapshot: () => Promise<ExploreState>,
  isMutation: boolean,
): Promise<{ result: T; violations: InvariantViolation[]; after: ExploreState }> {
  const result = await action()
  const after = await snapshot()
  const list = isMutation ? alwaysInvariants : allInvariants
  const violations = runAll(after, list, before)
  return { result, violations, after }
}
