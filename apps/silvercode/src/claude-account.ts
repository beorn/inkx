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

import { basename } from "node:path"
import {
  checkProfileQuota,
  keychainSlot,
  isLoggedIn,
  type QuotaWindow,
  type ProfileInfo,
} from "@beorn/accountly"

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
 * Load credentials + quotas for the active profile in one shot. Resolves
 * whether or not all paths succeed — individual fields may be null/empty
 * and `error` carries the first failure reason. Consumers render partial
 * state gracefully.
 */
export async function probeActiveAccount(): Promise<AccountProbe> {
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

  try {
    const { quota, error } = await checkProfileQuota(profile)
    return {
      email,
      plan: profile.plan ?? null,
      quotas: quota?.windows ?? [],
      error: error ?? quota?.error ?? null,
      loading: false,
    }
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
    case "Extra usage":
      return "x"
    default:
      return name.slice(0, 4)
  }
}
