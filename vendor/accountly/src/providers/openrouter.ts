import type { Credential, QuotaInfo, QuotaProvider, QuotaWindow } from "../types.ts"

const KEY_URL = "https://openrouter.ai/api/v1/key"

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

interface KeyResponse {
  data?: {
    label?: string
    limit?: number | null
    limit_remaining?: number | null
    usage?: number
    usage_daily?: number
    usage_weekly?: number
    usage_monthly?: number
    is_free_tier?: boolean
  }
}

/** Format dollar amount: "$1.23" or "$0.00" */
function fmtDollars(n: number): string {
  return `$${n.toFixed(2)}`
}

/** OpenRouter provider — checks credits and usage via /api/v1/key */
export function createOpenRouterProvider(): QuotaProvider {
  return {
    providerType: "openrouter",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "openrouter",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(KEY_URL, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (resp.status === 401) {
          return { ...base, available: false, windows: [], error: "Invalid API key" }
        }
        if (!resp.ok) {
          return { ...base, available: false, windows: [], error: `HTTP ${resp.status}` }
        }

        const data = (await resp.json()) as KeyResponse
        const key = data.data
        if (!key) {
          return { ...base, available: true, windows: [] }
        }

        const windows: QuotaWindow[] = []

        // Credit limit utilization
        if (key.limit !== null && key.limit > 0) {
          const remaining = key.limit_remaining ?? key.limit - (key.usage ?? 0)
          const utilization = Math.round(((key.limit - remaining) / key.limit) * 100)
          windows.push({
            name: `Credits (${fmtDollars(remaining)} / ${fmtDollars(key.limit)})`,
            utilization,
            remaining,
            limit: key.limit,
          })
        }

        // Total usage (when no limit, still show spend)
        if (key.usage !== null && key.usage > 0 && key.limit === 0) {
          windows.push({
            name: `Spent ${fmtDollars(key.usage)} total`,
            utilization: 0,
          })
        }

        // Daily usage
        if (key.usage_daily !== null && key.usage_daily > 0) {
          windows.push({
            name: `Today ${fmtDollars(key.usage_daily)}`,
            utilization: 0,
          })
        }

        const available = key.limit !== null ? (key.limit_remaining ?? 0) > 0 : true
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
