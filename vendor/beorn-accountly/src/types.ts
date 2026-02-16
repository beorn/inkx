/** Supported account provider types */
export type AccountProvider = "claude-oauth" | "anthropic-api" | "openai" | "xai" | "google" | "openrouter"

/** Account configuration (no secrets — stored in accounts.json) */
export interface AccountConfig {
  name: string // "personal", "work", "org-acme"
  provider: AccountProvider
  disabled?: boolean
  metadata?: Record<string, string> // email, orgId, plan tier
}

/** Full config file structure */
export interface ConfigFile {
  accounts: AccountConfig[]
  activeAccount?: string // name of the currently active account
}

/** Credential data stored per account */
export interface Credential {
  /** Claude OAuth: { accessToken, refreshToken, expiresAt?, ... } */
  /** Anthropic API: { apiKey } */
  /** OpenAI: { apiKey } */
  [key: string]: unknown
}

/** A single quota window (5-hour, 7-day, monthly, etc.) */
export interface QuotaWindow {
  name: string // "5-hour", "7-day", "monthly"
  utilization: number // 0-100
  remaining?: number
  limit?: number
  resetsAt?: string // ISO 8601
}

/** Result of checking an account's quota */
export interface QuotaInfo {
  accountName: string
  provider: AccountProvider
  available: boolean // true = has capacity
  windows: QuotaWindow[]
  error?: string // if check failed
  checkedAt: number // Date.now()
}

/** Interface that quota providers must implement */
export interface QuotaProvider {
  readonly providerType: AccountProvider
  checkQuota(credential: Credential): Promise<QuotaInfo>
  validateCredential(credential: Credential): boolean
}
