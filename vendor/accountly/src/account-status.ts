import { discoverAccounts } from "./discover.ts"
import {
  checkAllProfileQuotas,
  checkLegacyDefaultQuota,
  getDefaultProfile,
  type ProfileQuotaResult,
} from "./profile.ts"
import { getProvider } from "./providers/index.ts"
import type { AccountProvider, QuotaInfo, QuotaWindow } from "./types.ts"

export type AccountStatusKind = "claude-profile" | "api-key"

export interface AccountStatus {
  kind: AccountStatusKind
  name: string
  label: string
  provider: AccountProvider
  email?: string
  plan?: string
  dir?: string
  authenticated?: boolean
  current: boolean
  default: boolean
  stock: boolean
  sourceEnvVar?: string
  credentialHint?: string
  available: boolean
  quotas: QuotaWindow[]
  error?: string
  quota?: QuotaInfo
}

export interface AccountStatusOptions {
  includeProfiles?: boolean
  includeApiKeys?: boolean
}

function providerLabel(provider: AccountProvider, name?: string): string {
  if (name === "codex") return "Codex"
  switch (provider) {
    case "claude-oauth":
      return "Claude Code"
    case "anthropic-api":
      return "Anthropic API"
    case "openai":
      return "OpenAI API"
    case "xai":
      return "xAI API"
    case "google":
      return "Google API"
    case "openrouter":
      return "OpenRouter API"
    case "cursor-api":
      return "Cursor API"
  }
}

function credentialHint(credential: unknown): string | undefined {
  if (typeof credential !== "object" || credential === null) return undefined
  const key = (credential as Record<string, unknown>).apiKey
  if (typeof key !== "string" || key.length < 4) return undefined
  return `…${key.slice(-4)}`
}

function activeProfileName(stockEmail: string | undefined): string | undefined {
  if (process.env.CLAUDE_PROFILE) return process.env.CLAUDE_PROFILE
  return stockEmail ?? "~/.claude"
}

function isCurrentProfile(result: ProfileQuotaResult, stockEmail: string | undefined): boolean {
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir && configDir.length > 0) return result.profile.dir === configDir
  return activeProfileName(stockEmail) === result.profile.name
}

function profileStatus(result: ProfileQuotaResult, stockEmail: string | undefined): AccountStatus {
  const quota = result.quota
  const name = result.profile.name
  return {
    kind: "claude-profile",
    name,
    label: "Claude Code",
    provider: "claude-oauth",
    email: result.profile.email,
    plan: result.profile.plan,
    dir: result.profile.dir,
    authenticated: result.profile.authenticated,
    current: isCurrentProfile(result, stockEmail),
    default: getDefaultProfile() === name,
    stock: name === "~/.claude" || (stockEmail !== undefined && stockEmail === name),
    available: quota?.available ?? false,
    quotas: quota?.windows ?? [],
    error: result.error ?? quota?.error,
    quota,
  }
}

async function profileStatuses(): Promise<AccountStatus[]> {
  // Keep Claude OAuth quota checks serialized across named profiles and the
  // legacy ~/.claude slot. The provider rate-limits refresh/usage calls at
  // account/IP scope, so same-provider fan-out is counterproductive here.
  const profileResults = await checkAllProfileQuotas()
  const stockResult = await checkLegacyDefaultQuota()
  const stockEmail = stockResult?.profile.email
  const profileNames = new Set(profileResults.map((r) => r.profile.name))
  const stockFolded = !!(stockEmail && profileNames.has(stockEmail))
  const results = stockFolded ? profileResults : stockResult ? [stockResult, ...profileResults] : profileResults
  return results.map((result) => profileStatus(result, stockEmail))
}

async function apiKeyStatuses(): Promise<AccountStatus[]> {
  const accounts = discoverAccounts().filter((account) => account.config.provider !== "claude-oauth")
  return Promise.all(
    accounts.map(async (account): Promise<AccountStatus> => {
      const provider = getProvider(account.config.provider)
      const quota = await provider.checkQuota(account.credential)
      quota.accountName = account.config.name
      return {
        kind: "api-key",
        name: account.config.name,
        label: providerLabel(account.config.provider, account.config.name),
        provider: account.config.provider,
        email: quota.metadata?.userEmail,
        current: false,
        default: false,
        stock: false,
        sourceEnvVar: account.config.metadata?.envVar,
        credentialHint: credentialHint(account.credential),
        available: quota.available,
        quotas: quota.windows,
        error: quota.error,
        quota,
      }
    }),
  )
}

export async function getAccountStatuses(options: AccountStatusOptions = {}): Promise<AccountStatus[]> {
  const includeProfiles = options.includeProfiles ?? true
  const includeApiKeys = options.includeApiKeys ?? true
  const [profiles, apiKeys] = await Promise.all([
    includeProfiles ? profileStatuses() : Promise.resolve([]),
    includeApiKeys ? apiKeyStatuses() : Promise.resolve([]),
  ])
  return [...profiles, ...apiKeys]
}
