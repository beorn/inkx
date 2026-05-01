/**
 * Multi-account probe — list accountly profiles and API-key accounts.
 *
 * The single-account flavour (`claude-account.ts`) only inspects the
 * profile the current process is billing against (CLAUDE_CONFIG_DIR).
 * The side panel needs every known account so users can see at-a-glance
 * which accounts are healthy and, later, switch with confidence.
 *
 * Architecture mirrors `claude-account.ts`:
 *   - `probeAllAccounts()` — async fan-out via accountly's shared
 *     `getAccountStatuses()` surface.
 *   - `readAllAccountsCacheSync()` — disk-cache hit (2-minute TTL) for
 *     synchronous first-render, so the side panel paints account panels
 *     immediately on cold start instead of flashing a "Loading…" stub.
 *   - `setAllAccountsFactoryOverride(factory)` — test-only injection,
 *     same shape as `setAccountFactoryOverride`.
 *
 * This module keeps a list-shaped cache so the side panel doesn't call
 * every provider on each render or each process restart.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { getAccountStatuses, type AccountProvider, type AccountStatus, type QuotaWindow } from "@beorn/accountly"
import { silvercodeAllAccountsCachePath } from "@km/config/paths"
import { resolveActiveEmail } from "./claude-account.ts"

/**
 * Per-account view of a profile's identity + quota state. `isActive` is
 * true for the profile whose `dir` matches the running process's
 * CLAUDE_CONFIG_DIR (or the legacy ~/.claude when no env is set and the
 * stock keychain matches).
 */
export interface AccountSummary {
  /** Backend account shape. API keys are accounts too, but only profiles are switchable today. */
  kind: "claude-profile" | "api-key"
  /** Profile name (directory basename, typically the account email). */
  name: string
  /** Provider label, e.g. Claude Code, OpenAI API, Cursor API. */
  label: string
  /** Provider id from accountly. */
  provider: AccountProvider
  /** Resolved account email, or null when accountly hasn't fetched it yet. */
  email: string | null
  /** Raw plan slug (e.g. `claude_max_20x`). The SidePanel humanizes for display. */
  plan: string | null
  /** Profile directory for switchable profile accounts. */
  dir?: string
  /** Whether accountly sees this account as authenticated. */
  authenticated?: boolean
  /** True when accountly marks this as the default profile. */
  default?: boolean
  /** True when this is or matches the stock ~/.claude account. */
  stock?: boolean
  /** True when the provider reported usable capacity or a valid key. */
  available?: boolean
  /** Extra provider metadata such as Cursor API key name / creation time. */
  metadata?: Record<string, string>
  /** Per-window utilization. Empty while loading or when the probe failed. */
  quotas: QuotaWindow[]
  /** Non-null when the per-profile quota probe failed. */
  error: string | null
  /** True for the account the current silvercode process is billing against. */
  current: boolean
  /** Back-compat alias for UI code that still says active. */
  isActive: boolean
  /** Env var for API-key accounts, e.g. CURSOR_API_KEY. */
  sourceEnvVar?: string
  /** Redacted credential suffix for API-key accounts. */
  credentialHint?: string
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

/** Cache TTL for the all-accounts list — avoids hammering quota endpoints on restart. */
const CACHE_TTL_MS = 2 * 60 * 1000
const CACHE_VERSION = 2

interface CachedAllAccounts {
  version?: number
  fetchedAt: number
  accounts: AccountSummary[]
}

function cachePath(): string {
  return silvercodeAllAccountsCachePath()
}

function readCache(): CachedAllAccounts | null {
  try {
    const raw = readFileSync(cachePath(), "utf8")
    const parsed = JSON.parse(raw) as CachedAllAccounts
    if (typeof parsed?.fetchedAt !== "number" || !Array.isArray(parsed.accounts)) return null
    if (parsed.version !== CACHE_VERSION) return null
    if (!parsed.accounts.every(isAccountSummary)) return null
    return { ...parsed, accounts: cacheableAccounts(parsed.accounts) }
  } catch {
    return null
  }
}

function isAccountSummary(value: unknown): value is AccountSummary {
  if (typeof value !== "object" || value === null) return false
  const account = value as Partial<AccountSummary>
  return (
    (account.kind === "claude-profile" || account.kind === "api-key") &&
    typeof account.name === "string" &&
    typeof account.label === "string" &&
    typeof account.provider === "string" &&
    typeof account.current === "boolean" &&
    typeof account.isActive === "boolean" &&
    Array.isArray(account.quotas)
  )
}

function writeCache(accounts: AccountSummary[]): void {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true })
    writeFileSync(cachePath(), JSON.stringify({ version: CACHE_VERSION, fetchedAt: Date.now(), accounts }))
  } catch {
    /* best-effort cache; ignore fs errors */
  }
}

export function isTransientAccountError(error: string | null | undefined): boolean {
  return typeof error === "string" && /(?:\b429\b|too many requests|rate.?limit)/i.test(error)
}

function isTransientAccountFailure(account: AccountSummary): boolean {
  return account.error !== null && isTransientAccountError(account.error) && account.quotas.length === 0
}

function accountCacheKey(account: AccountSummary): string {
  return [account.kind, account.provider, account.dir ?? "", account.email ?? "", account.name].join("\0")
}

function mergeTransientFailuresWithCache(
  accounts: AccountSummary[],
  cachedAccounts: readonly AccountSummary[] | undefined,
): AccountSummary[] {
  if (!cachedAccounts || cachedAccounts.length === 0) return accounts
  const cachedByKey = new Map(cachedAccounts.map((account) => [accountCacheKey(account), account]))
  return accounts.map((account) => {
    if (!isTransientAccountFailure(account)) return account
    const cached = cachedByKey.get(accountCacheKey(account))
    if (!cached || cached.error !== null || cached.quotas.length === 0) return account
    return {
      ...cached,
      current: account.current,
      isActive: account.isActive,
      default: account.default,
      stock: account.stock,
      loading: false,
    }
  })
}

function cacheableAccounts(accounts: AccountSummary[]): AccountSummary[] {
  return accounts.filter((account) => !isTransientAccountFailure(account))
}

export function readAllAccountsCacheSync(opts: { allowStale?: boolean } = {}): AccountSummary[] | null {
  if (factoryOverride) return factoryOverride.readCached()
  const cached = readCache()
  if (!cached) return null
  if (opts.allowStale !== true && Date.now() - cached.fetchedAt >= CACHE_TTL_MS) return null
  return cached.accounts
}

function summaryFromStatus(status: AccountStatus): AccountSummary {
  return {
    kind: status.kind,
    name: status.name,
    label: status.label,
    provider: status.provider,
    email: status.email ?? null,
    plan: status.plan ?? null,
    dir: status.dir,
    authenticated: status.authenticated,
    default: status.default,
    stock: status.stock,
    available: status.available,
    metadata: status.quota?.metadata,
    quotas: status.quotas,
    error: status.error ?? null,
    current: status.current,
    isActive: status.current,
    sourceEnvVar: status.sourceEnvVar,
    credentialHint: status.credentialHint,
    loading: false,
  }
}

function currentAccountDir(): string | null {
  const env = process.env.CLAUDE_CONFIG_DIR
  return env && env.length > 0 ? env : null
}

export async function probeAllAccounts(forceRefresh = false): Promise<AccountSummary[]> {
  if (factoryOverride) return factoryOverride.probe(forceRefresh)

  const cached = readCache()
  if (!forceRefresh) {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.accounts
    }
  }

  let summaries = mergeTransientFailuresWithCache(
    (await getAccountStatuses()).map(summaryFromStatus),
    cached?.accounts,
  )

  // If the current dir didn't match any listed profile (e.g. user is on
  // stock ~/.claude with no profiles created yet), synthesize a single
  // active row from the running process so the side panel still has
  // something to render.
  if (summaries.length === 0) {
    const active = currentAccountDir()
    const fallback: AccountSummary = {
      kind: "claude-profile",
      name: active ? (active.split("/").pop() ?? "active") : "active",
      label: "Claude Code",
      provider: "claude-oauth",
      email: resolveActiveEmail(),
      plan: null,
      authenticated: false,
      default: false,
      stock: false,
      available: false,
      quotas: [],
      error: null,
      current: true,
      isActive: true,
      loading: false,
    }
    summaries.unshift(fallback)
  }

  // Stable ordering: active first, then alphabetical by name.
  summaries.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    if (a.kind !== b.kind) return a.kind === "claude-profile" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // Only persist when at least one summary carries useful data — avoid
  // sealing in an all-error response that would mask recovery.
  const nextCache = cacheableAccounts(summaries)
  const hasGoodData = nextCache.some((s) => s.error === null && (s.quotas.length > 0 || s.provider !== "claude-oauth"))
  if (hasGoodData) writeCache(nextCache)

  return summaries
}
