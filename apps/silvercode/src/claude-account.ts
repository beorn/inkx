/**
 * Claude account + quota probe.
 *
 * Resolves the active profile's email, subscription tier, and usage-window
 * quotas via `@beorn/accountly`. Consumed by the SidePanel to render the
 * multi-window quota block (5-hour / 7-day / 7-day Sonnet / Extra usage).
 *
 * Design:
 *   - Email is resolved synchronously from CLAUDE_CONFIG_DIR (when set) —
 *     the side panel can render the identity line immediately.
 *   - Plan + quotas require calling Anthropic's /api/usage, so they come
 *     via an async fetch. The hook that consumes this file caches the
 *     result and refreshes on a gentle cadence (2 min) so the panel stays
 *     live without hammering the API.
 *   - Errors are surfaced as a string on the returned object; the panel
 *     falls back to the local context-window bar when the probe fails
 *     (offline, no credentials, API outage).
 */

import { basename } from "node:path"
import { createClaudeOAuthProvider, extractPlan, readKeychainForProfile } from "@beorn/accountly"
import type { QuotaInfo, QuotaWindow } from "@beorn/accountly"

export interface AccountProbe {
  /** `bjorn@stabell.org` when the active profile encodes an email; otherwise null. */
  email: string | null
  /**
   * Raw plan/tier string from keychain (e.g. `"claude_max_20x"` or `"claude_pro"`).
   * The SidePanel humanizes this for display.
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
  // Only return it if it actually looks like an email — otherwise the user
  // is on stock ~/.claude (or a non-email profile name); we don't want to
  // render a garbage identity line.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(name) ? name : null
}

/**
 * Load credentials + quotas for the active profile in one shot. Resolves
 * whether or not all paths succeed — individual fields may be null/empty
 * and `error` carries the first failure reason. Consumers render partial
 * state gracefully.
 */
export async function probeActiveAccount(): Promise<AccountProbe> {
  const email = resolveActiveEmail()
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME ?? ""}/.claude`

  const credential = readKeychainForProfile(configDir)
  if (!credential) {
    return {
      email,
      plan: null,
      quotas: [],
      error: `No Claude credentials in keychain for ${configDir}`,
      loading: false,
    }
  }

  const plan = extractPlan(credential) ?? null

  try {
    const provider = createClaudeOAuthProvider()
    const info: QuotaInfo = await provider.checkQuota(credential)
    return {
      email,
      plan,
      quotas: info.windows,
      error: info.error ?? null,
      loading: false,
    }
  } catch (err) {
    return {
      email,
      plan,
      quotas: [],
      error: err instanceof Error ? err.message : String(err),
      loading: false,
    }
  }
}

/**
 * Human-readable label for an Anthropic plan slug. `claude_max_20x` →
 * "Claude Code Max 20x"; unknown slugs fall through as-is so new plans
 * don't render as "undefined".
 */
export function planLabel(plan: string | null): string {
  if (!plan) return "Claude Code"
  switch (plan) {
    case "claude_pro":
      return "Claude Pro"
    case "claude_max":
    case "claude_max_5x":
      return "Claude Code Max 5x"
    case "claude_max_20x":
      return "Claude Code Max 20x"
    case "claude_team":
      return "Claude Team"
    case "claude_enterprise":
      return "Claude Enterprise"
    default:
      return plan
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
      // Best-effort abbreviation for A/B-test windows or future names.
      return name.slice(0, 4)
  }
}
