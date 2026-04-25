/**
 * Claude account + quota probe.
 *
 * Resolves the active profile's email, subscription tier, and usage-window
 * quotas via `@beorn/accountly`'s PUBLIC API surface. Consumed by the
 * SidePanel to render the multi-window quota block (5hr / 7d / 7ds / x).
 *
 * Design:
 *   - Email resolves synchronously from CLAUDE_CONFIG_DIR so the panel
 *     can render the identity line immediately.
 *   - Plan + quotas come via `checkProfileQuota()` (hits Anthropic's
 *     /api/usage through the keychain OAuth token). The consuming hook
 *     re-runs it every ~2 min.
 *   - Errors are surfaced as a string on the returned object; the panel
 *     falls back to a local context-window bar when the probe fails
 *     (offline, no credentials, API outage).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { checkProfileQuota, keychainSlot, isLoggedIn, type QuotaWindow, type ProfileInfo } from "@beorn/accountly"

export type { QuotaWindow } from "@beorn/accountly"

export interface AccountProbe {
  /** `bjorn@stabell.org` when the active profile encodes an email; otherwise null. */
  email: string | null
  /**
   * Raw plan/tier string populated by accountly (e.g. `"claude_max_20x"` or
   * `"claude_pro"`). The SidePanel humanizes this for display.
   */
  plan: string | null
  /** Per-window utilization. Empty while loading / on error. */
  quotas: QuotaWindow[]
  /** Non-null if the last refresh failed. */
  error: string | null
  /** true while the first fetch is in flight. */
  loading: boolean
}

/**
 * Test-only factory installed via `setAccountFactoryOverride`. When set,
 * `probeActiveAccount` and `readCachedProbeSync` route through it instead
 * of touching the keychain, network, or `~/.cache/km/`. The
 * factory may return `null` from `readCached` to simulate cold-start.
 */
export interface AccountFactory {
  /** Synchronous read — emulates the disk cache hit path. */
  readCached(): AccountProbe | null
  /** Async probe — emulates calling Anthropic's /api/usage. */
  probe(forceRefresh?: boolean): Promise<AccountProbe>
}

let accountOverride: AccountFactory | null = null

/**
 * Test-only: install a fake account probe. Pass `null` to clear.
 * Production callers MUST NOT use this.
 */
export function setAccountFactoryOverride(factory: AccountFactory | null): void {
  accountOverride = factory
}

/**
 * Resolve the active Claude profile's email from CLAUDE_CONFIG_DIR. accountly
 * names each profile dir after the account email, so `basename(configDir)`
 * is the canonical identity for the running session.
 */
export function resolveActiveEmail(): string | null {
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (!configDir) return null
  const name = basename(configDir)
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(name) ? name : null
}

/**
 * Synthesize a ProfileInfo for accountly's `checkProfileQuota`. We build it
 * locally from the active CLAUDE_CONFIG_DIR rather than scanning all
 * profiles — silvercode only cares about the account the current process
 * is billing against.
 */
function activeProfile(): ProfileInfo | null {
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (!configDir) return null
  const name = basename(configDir)
  const slot = keychainSlot(configDir)
  return { name, dir: configDir, slot, authenticated: isLoggedIn(configDir) }
}

/**
 * Minimum age between /api/usage hits, shared across every silvercode
 * process via a disk cache. Anthropic starts returning 429 Too Many
 * Requests when the user rapidly restarts silvercode (close+reopen a
 * dozen times during iteration), because each spawn fires a fresh probe
 * against the same quota endpoint. A disk cache keyed by profile dir
 * lets successive spawns reuse a recent response.
 */
const QUOTA_CACHE_TTL_MS = 60_000
const QUOTA_CACHE_DIR = join(homedir(), ".cache", "silvercode")

interface CachedProbe {
  fetchedAt: number
  probe: AccountProbe
}

function cachePath(profileDir: string): string {
  // sha1-like: replace slashes with `-` so the filename encodes the
  // profile dir uniquely without needing a hash import.
  const slug = profileDir.replace(/[^a-zA-Z0-9@._-]/g, "_")
  return join(QUOTA_CACHE_DIR, `quota-${slug}.json`)
}

/**
 * Sync read of the latest cached probe for the ACTIVE profile — for hooks
 * that want to show quota numbers on first render instead of flashing
 * "Loading…". Returns null when no cache exists or it's expired.
 */
export function readCachedProbeSync(): AccountProbe | null {
  if (accountOverride) return accountOverride.readCached()
  const profile = activeProfile()
  if (!profile) return null
  const cached = readCache(profile.dir)
  if (!cached) return null
  if (Date.now() - cached.fetchedAt >= QUOTA_CACHE_TTL_MS) return null
  return cached.probe
}

function readCache(profileDir: string): CachedProbe | null {
  try {
    const raw = readFileSync(cachePath(profileDir), "utf8")
    const parsed = JSON.parse(raw) as CachedProbe
    if (typeof parsed?.fetchedAt !== "number" || !parsed.probe) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(profileDir: string, probe: AccountProbe): void {
  try {
    mkdirSync(QUOTA_CACHE_DIR, { recursive: true })
    writeFileSync(cachePath(profileDir), JSON.stringify({ fetchedAt: Date.now(), probe }))
  } catch {
    /* cache write is best-effort; ignore permission / fs errors */
  }
}

/**
 * Load credentials + quotas for the active profile in one shot. Resolves
 * whether or not all paths succeed — individual fields may be null/empty
 * and `error` carries the first failure reason. Consumers render partial
 * state gracefully.
 *
 * Persistent disk cache (TTL: 60s, ~/.cache/km/quota-*.json) is
 * consulted first — close+reopen cycles reuse a fresh response instead of
 * hammering the API and hitting 429. Set `forceRefresh` to bypass.
 */
export async function probeActiveAccount(forceRefresh = false): Promise<AccountProbe> {
  if (accountOverride) return accountOverride.probe(forceRefresh)
  const email = resolveActiveEmail()
  const profile = activeProfile()

  if (!profile) {
    return {
      email,
      plan: null,
      quotas: [],
      error: "CLAUDE_CONFIG_DIR not set — stock ~/.claude quota check not wired",
      loading: false,
    }
  }

  if (!forceRefresh) {
    const cached = readCache(profile.dir)
    if (cached && Date.now() - cached.fetchedAt < QUOTA_CACHE_TTL_MS) {
      return cached.probe
    }
  }

  try {
    const { quota, error } = await checkProfileQuota(profile)
    const probe: AccountProbe = {
      email,
      plan: profile.plan ?? null,
      quotas: quota?.windows ?? [],
      error: error ?? quota?.error ?? null,
      loading: false,
    }
    // Only cache SUCCESSFUL responses — a 429 error probe would otherwise
    // extend itself into the cache and mask the eventual recovery.
    if (!probe.error) writeCache(profile.dir, probe)
    return probe
  } catch (err) {
    return {
      email,
      plan: profile.plan ?? null,
      quotas: [],
      error: err instanceof Error ? err.message : String(err),
      loading: false,
    }
  }
}

/**
 * Human-readable label for an Anthropic plan slug. Strips the
 * accountly-added "default_" prefix, then maps the raw slug to a display
 * name. Unknown slugs fall through with cosmetic cleanup so a new plan
 * name doesn't render as "default_claude_foo_99x".
 */
export function planLabel(plan: string | null): string {
  if (!plan) return "Claude Code"
  const normalized = plan.replace(/^default_/, "")
  switch (normalized) {
    case "claude_pro":
      return "Claude Pro"
    case "claude_max":
    case "claude_max_5x":
      return "Claude Code Max 5"
    case "claude_max_20x":
      return "Claude Code Max 20"
    case "claude_team":
      return "Claude Team"
    case "claude_enterprise":
      return "Claude Enterprise"
    default:
      // Cosmetic fallback: "claude_foo_bar" → "Claude Foo Bar"
      return normalized
        .split("_")
        .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(" ")
  }
}

/**
 * Compact label for a quota window ("5hr" / "7d" / "7ds" / "x") used as
 * the prefix on the quota-row bar. Unknown window names pass through.
 */
export function windowShortLabel(name: string): string {
  switch (name) {
    case "5-hour":
      return "5hr"
    case "7-day":
      return "7d"
    case "7-day (Sonnet)":
    case "Sonnet 7-day":
      return "7ds"
    case "7-day (Opus)":
    case "Opus 7-day":
      return "7do"
    case "Xtra":
      return "Xtra"
    default:
      return name.slice(0, 4)
  }
}
