/**
 * Multi-account probe — list all accountly profiles + their quotas.
 *
 * The single-account flavour (`claude-account.ts`) only inspects the
 * profile the current process is billing against (CLAUDE_CONFIG_DIR).
 * The side panel needs every profile so users can see at-a-glance which
 * accounts are healthy and switch with confidence.
 *
 * Architecture mirrors `claude-account.ts`:
 *   - `probeAllAccounts()` — async fan-out via `checkAllProfileQuotas`,
 *     decorated with `isActive` + email per profile.
 *   - `readAllAccountsCacheSync()` — disk-cache hit (5-min TTL) for
 *     synchronous first-render, so the side panel paints account panels
 *     immediately on cold start instead of flashing a "Loading…" stub.
 *   - `setAllAccountsFactoryOverride(factory)` — test-only injection,
 *     same shape as `setAccountFactoryOverride`.
 *
 * Per-account quota cache is the underlying primitive; this module
 * stitches the per-account TTL into one list-shaped cache so the side
 * panel doesn't have to call N independent probes per render.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  checkAllProfileQuotas,
  fetchProfileEmail,
  getLegacyDefaultProfile,
  type ProfileInfo,
  type QuotaWindow,
} from "@beorn/accountly"
import { resolveActiveEmail } from "./claude-account.ts"

/**
 * Per-account view of a profile's identity + quota state. `isActive` is
 * true for the profile whose `dir` matches the running process's
 * CLAUDE_CONFIG_DIR (or the legacy ~/.claude when no env is set and the
 * stock keychain matches).
 */
export interface AccountSummary {
  /** Profile name (directory basename, typically the account email). */
  name: string
  /** Resolved account email, or null when accountly hasn't fetched it yet. */
  email: string | null
  /** Raw plan slug (e.g. `claude_max_20x`). The SidePanel humanizes for display. */
  plan: string | null
  /** Per-window utilization. Empty while loading or when the probe failed. */
  quotas: QuotaWindow[]
  /** Non-null when the per-profile quota probe failed. */
  error: string | null
  /** True for the profile the current silvercode process is billing against. */
  isActive: boolean
  /** True while the first list-fetch is in flight (initial render). */
  loading: boolean
}

/**
 * Test-only injection. When set, `probeAllAccounts` and
 * `readAllAccountsCacheSync` route through it instead of touching the
 * real keychain / network / disk. Production code MUST NOT call this.
 */
export interface AllAccountsFactory {
  readCached(): AccountSummary[] | null
  probe(forceRefresh?: boolean): Promise<AccountSummary[]>
}

let factoryOverride: AllAccountsFactory | null = null

export function setAllAccountsFactoryOverride(factory: AllAccountsFactory | null): void {
  factoryOverride = factory
}

/** Cache TTL for the all-accounts list — five minutes per the bead spec. */
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_DIR = join(homedir(), ".cache", "silvercode")
const CACHE_FILE = "accounts-all.json"

interface CachedAllAccounts {
  fetchedAt: number
  accounts: AccountSummary[]
}

function cachePath(): string {
  return join(CACHE_DIR, CACHE_FILE)
}

function readCache(): CachedAllAccounts | null {
  try {
    const raw = readFileSync(cachePath(), "utf8")
    const parsed = JSON.parse(raw) as CachedAllAccounts
    if (typeof parsed?.fetchedAt !== "number" || !Array.isArray(parsed.accounts)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(accounts: AccountSummary[]): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(cachePath(), JSON.stringify({ fetchedAt: Date.now(), accounts }))
  } catch {
    /* best-effort cache; ignore fs errors */
  }
}

export function readAllAccountsCacheSync(): AccountSummary[] | null {
  if (factoryOverride) return factoryOverride.readCached()
  const cached = readCache()
  if (!cached) return null
  if (Date.now() - cached.fetchedAt >= CACHE_TTL_MS) return null
  return cached.accounts
}

/**
 * The dir the current silvercode process is billing against. Used to
 * tag exactly one summary as `isActive`. When CLAUDE_CONFIG_DIR is
 * unset, we treat the legacy ~/.claude profile as active.
 */
function activeDir(): string | null {
  const env = process.env.CLAUDE_CONFIG_DIR
  if (env && env.length > 0) return env
  const legacy = getLegacyDefaultProfile()
  return legacy?.dir ?? null
}

async function decorateProfile(profile: ProfileInfo): Promise<string | null> {
  // accountly populates `profile.email` only on the legacy/stock row;
  // for hashed-slot profiles we resolve via the OAuth profile endpoint.
  if (profile.email) return profile.email
  try {
    const email = await fetchProfileEmail(profile)
    return email ?? null
  } catch {
    return null
  }
}

export async function probeAllAccounts(forceRefresh = false): Promise<AccountSummary[]> {
  if (factoryOverride) return factoryOverride.probe(forceRefresh)

  if (!forceRefresh) {
    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.accounts
    }
  }

  const active = activeDir()
  const results = await checkAllProfileQuotas()

  const summaries: AccountSummary[] = await Promise.all(
    results.map(async (r): Promise<AccountSummary> => {
      const email = await decorateProfile(r.profile)
      return {
        name: r.profile.name,
        email,
        plan: r.profile.plan ?? null,
        quotas: r.quota?.windows ?? [],
        error: r.error ?? r.quota?.error ?? null,
        isActive: active !== null && r.profile.dir === active,
        loading: false,
      }
    }),
  )

  // If the active dir didn't match any listed profile (e.g. user is on
  // stock ~/.claude with no profiles created yet), synthesize a single
  // active row from the running process so the side panel still has
  // something to render.
  if (summaries.length === 0 || !summaries.some((s) => s.isActive)) {
    const fallback: AccountSummary = {
      name: active ? (active.split("/").pop() ?? "active") : "active",
      email: resolveActiveEmail(),
      plan: null,
      quotas: [],
      error: null,
      isActive: true,
      loading: false,
    }
    summaries.unshift(fallback)
  }

  // Stable ordering: active first, then alphabetical by name.
  summaries.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // Only persist when at least one summary carries useful data — avoid
  // sealing in an all-error response that would mask recovery.
  const hasGoodData = summaries.some((s) => s.error === null && s.quotas.length > 0)
  if (hasGoodData) writeCache(summaries)

  return summaries
}
