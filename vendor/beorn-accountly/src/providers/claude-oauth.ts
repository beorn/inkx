import type { Credential, QuotaInfo, QuotaProvider, QuotaWindow } from "../types.ts"

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile"
const BETA_HEADER = "oauth-2025-04-20"

/** API response: flat object with named windows */
interface UsageWindowData {
  utilization: number // 0-100
  resets_at: string // ISO 8601
}

interface ExtraUsageData {
  is_enabled: boolean
  monthly_limit: number
  used_credits: number
  utilization: number // 0-100
}

type UsageResponse = Record<string, UsageWindowData | ExtraUsageData | null> & {
  error?: { message: string }
}

/** Human-readable names for API window keys */
const WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour",
  seven_day: "7-day",
  seven_day_oauth_apps: "7-day (OAuth apps)",
  seven_day_opus: "7-day (Opus)",
  seven_day_sonnet: "7-day (Sonnet)",
  seven_day_cowork: "7-day (Cowork)",
  extra_usage: "Extra usage",
}

function isUsageWindow(v: unknown): v is UsageWindowData {
  return typeof v === "object" && v !== null && "utilization" in v && "resets_at" in v
}

function isExtraUsage(v: unknown): v is ExtraUsageData {
  return typeof v === "object" && v !== null && "is_enabled" in v && "monthly_limit" in v
}

/** Extract OAuth data from credential (handles Keychain's claudeAiOauth wrapper) */
function extractOAuth(credential: Credential): { accessToken: string } | undefined {
  // Direct format: { accessToken: "..." }
  if (typeof credential.accessToken === "string" && credential.accessToken.length > 0) {
    return { accessToken: credential.accessToken as string }
  }
  // Keychain wrapper format: { claudeAiOauth: { accessToken: "..." } }
  const wrapped = credential.claudeAiOauth as Credential | undefined
  if (wrapped && typeof wrapped.accessToken === "string" && (wrapped.accessToken as string).length > 0) {
    return { accessToken: wrapped.accessToken as string }
  }
  return undefined
}

/** Profile info from /api/oauth/profile */
export interface ClaudeProfile {
  email: string
  fullName: string
  displayName: string
  orgName?: string
  plan: string // "claude_max", "claude_pro", etc.
}

/** Fetch account profile (email, name, org) */
export async function fetchClaudeProfile(credential: Credential): Promise<ClaudeProfile | undefined> {
  const oauth = extractOAuth(credential)
  if (!oauth) return undefined

  try {
    const resp = await fetch(PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": BETA_HEADER,
      },
    })
    if (!resp.ok) return undefined

    const data = (await resp.json()) as {
      account?: { email?: string; full_name?: string; display_name?: string }
      organization?: { name?: string; organization_type?: string }
    }

    return {
      email: data.account?.email ?? "",
      fullName: data.account?.full_name ?? "",
      displayName: data.account?.display_name ?? "",
      orgName: data.organization?.name,
      plan: data.organization?.organization_type ?? "unknown",
    }
  } catch {
    return undefined
  }
}

export function createClaudeOAuthProvider(): QuotaProvider {
  return {
    providerType: "claude-oauth",

    validateCredential(credential: Credential): boolean {
      return extractOAuth(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "claude-oauth",
        checkedAt: Date.now(),
      }

      const oauth = extractOAuth(credential)
      if (!oauth) {
        return { ...base, available: false, windows: [], error: "No access token found" }
      }

      try {
        const resp = await fetch(USAGE_URL, {
          headers: {
            Authorization: `Bearer ${oauth.accessToken}`,
            "anthropic-beta": BETA_HEADER,
          },
        })

        if (!resp.ok) {
          return {
            ...base,
            available: false,
            windows: [],
            error: `HTTP ${resp.status}: ${resp.statusText}`,
          }
        }

        const data = (await resp.json()) as UsageResponse

        if (data.error) {
          return {
            ...base,
            available: false,
            windows: [],
            error: data.error.message,
          }
        }

        const windows: QuotaWindow[] = []

        for (const [key, value] of Object.entries(data)) {
          if (key === "error") continue
          if (value === null) continue

          if (isExtraUsage(value)) {
            if (!value.is_enabled) continue
            windows.push({
              name: WINDOW_LABELS[key] ?? key,
              utilization: Math.round(value.utilization),
              remaining: value.monthly_limit - value.used_credits,
              limit: value.monthly_limit,
            })
          } else if (isUsageWindow(value)) {
            windows.push({
              name: WINDOW_LABELS[key] ?? key,
              utilization: Math.round(value.utilization),
              resetsAt: value.resets_at,
            })
          }
        }

        // Available if the primary 5-hour window is not at 100%
        const fiveHour = windows.find((w) => w.name === "5-hour")
        const available = fiveHour ? fiveHour.utilization < 100 : windows.every((w) => w.utilization < 100)

        return { ...base, available, windows }
      } catch (err) {
        return {
          ...base,
          available: false,
          windows: [],
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}
