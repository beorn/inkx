/**
 * Test fakes for the third-party boundaries silvercode reaches into.
 *
 * v1's ScriptedFakeSession (`fake-session.ts`) covered the Claude session
 * stream. These factories cover everything else: accountly's keychain
 * + /api/usage probe, the `claude --version` spawn, the `.git/HEAD` read,
 * and the `~/.cache/silvercode/` disk cache.
 *
 * Why factories instead of raw mocks: production code stays untouched,
 * each boundary is one cohesive object, and tests can compose realistic
 * scenarios (high-quota warning, no plan, no email, no repo, missing
 * version).
 *
 * Wiring: `installFakes(opts)` mutates module-level overrides on
 * `claude-version`, `git-branch`, and `claude-account`. Returns a
 * `dispose()` that restores defaults. The harness calls this around
 * every render so production env never picks up test state.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type AccountFactory,
  type AccountProbe,
  type QuotaWindow,
  setAccountFactoryOverride,
} from "../claude-account.ts"
import { setVersionFactoryOverride } from "../claude-version.ts"
import { setGitFactoryOverride } from "../git-branch.ts"

export type AccountScenario = {
  email?: string | null
  plan?: string | null
  quotas?: QuotaWindow[]
  error?: string | null
  loading?: boolean
}

/**
 * Build an AccountFactory from a static probe shape. Both `readCached` and
 * `probe()` return the same value — sufficient for visual snapshots.
 */
export function fakeAccountFactory(scenario: AccountScenario = {}): AccountFactory {
  const probe: AccountProbe = {
    email: scenario.email ?? "test@silvercode.dev",
    plan: scenario.plan ?? "claude_max_20x",
    quotas: scenario.quotas ?? [],
    error: scenario.error ?? null,
    loading: scenario.loading ?? false,
  }
  return {
    readCached(): AccountProbe | null {
      return probe
    },
    async probe(): Promise<AccountProbe> {
      return probe
    },
  }
}

/** Default canned quotas — light usage, all windows healthy (≤30%). */
export function defaultQuotas(): QuotaWindow[] {
  return [
    { name: "5-hour", utilization: 12, remaining: 880, limit: 1000 },
    { name: "7-day", utilization: 31, remaining: 6900, limit: 10000 },
  ]
}

/**
 * Quota-warning scenario — 5-hour window pushed past 80% so the SidePanel
 * paints the bar yellow (`$warning`). Used by visual contract tests to
 * verify the threshold-coloring path.
 */
export function warningQuotas(): QuotaWindow[] {
  return [
    { name: "5-hour", utilization: 87, remaining: 130, limit: 1000 },
    { name: "7-day", utilization: 64, remaining: 3600, limit: 10000 },
  ]
}

export type InstallFakesOptions = {
  /** Account scenario. Pass `null` to skip overriding the account boundary. */
  account?: AccountScenario | null
  /** Fake CLI version. `null` skips override; default `"2.1.119"`. */
  version?: string | null
  /** Fake branch name. `null` skips override; default `"main"`. */
  branch?: string | null
  /**
   * Per-test temp directory for `~/.cache/silvercode/` writes. When omitted,
   * a fresh `mkdtempSync` allocates one and the override of HOME ensures
   * the disk-cache writes land there instead of the user's real cache.
   * Set `null` to skip HOME isolation entirely.
   */
  fsRoot?: string | null
}

export type InstalledFakes = {
  /** Restore module overrides + remove the temp HOME if we created one. */
  dispose(): void
  /** Resolved fsRoot used for HOME isolation, or `null` if skipped. */
  readonly fsRoot: string | null
}

/**
 * Install fakes for every third-party boundary used by visual tests. Returns
 * a disposer that restores the production state. Callers MUST `dispose()`
 * even if a test throws; harness wraps with try/finally.
 */
export function installFakes(opts: InstallFakesOptions = {}): InstalledFakes {
  const previousHome = process.env.HOME
  const previousXdg = process.env.XDG_CACHE_HOME

  let allocatedRoot: string | null = null
  let activeRoot: string | null = null
  if (opts.fsRoot !== null) {
    activeRoot = opts.fsRoot ?? mkdtempSync(join(tmpdir(), "silvercode-test-"))
    if (opts.fsRoot === undefined) allocatedRoot = activeRoot
    process.env.HOME = activeRoot
    process.env.XDG_CACHE_HOME = join(activeRoot, ".cache")
  }

  if (opts.account !== null) {
    setAccountFactoryOverride(
      fakeAccountFactory({
        quotas: defaultQuotas(),
        ...(opts.account ?? {}),
      }),
    )
  }

  if (opts.version !== null) {
    const fake = opts.version ?? "2.1.119"
    setVersionFactoryOverride(() => fake)
  }

  if (opts.branch !== null) {
    const fake = opts.branch ?? "main"
    setGitFactoryOverride(() => fake)
  }

  return {
    fsRoot: activeRoot,
    dispose(): void {
      setAccountFactoryOverride(null)
      setVersionFactoryOverride(null)
      setGitFactoryOverride(null)
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      if (previousXdg === undefined) delete process.env.XDG_CACHE_HOME
      else process.env.XDG_CACHE_HOME = previousXdg
      if (allocatedRoot) {
        try {
          rmSync(allocatedRoot, { recursive: true, force: true })
        } catch {
          /* tmp cleanup is best-effort */
        }
      }
    },
  }
}
