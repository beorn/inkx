import type { Credential, QuotaInfo, QuotaProvider, QuotaWindow } from "../types.ts"

const COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions"

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

/** Parse rate limit windows from xAI response headers (OpenAI-compatible) */
function parseRateLimitHeaders(headers: Headers): QuotaWindow[] {
  const windows: QuotaWindow[] = []

  // RPM
  const rpmLimit = Number(headers.get("x-ratelimit-limit-requests"))
  const rpmRemaining = Number(headers.get("x-ratelimit-remaining-requests"))
  const rpmReset = headers.get("x-ratelimit-reset-requests")
  if (rpmLimit > 0) {
    windows.push({
      name: "RPM",
      utilization: Math.round(((rpmLimit - rpmRemaining) / rpmLimit) * 100),
      remaining: rpmRemaining,
      limit: rpmLimit,
      resetsAt: rpmReset ?? undefined,
    })
  }

  // TPM
  const tpmLimit = Number(headers.get("x-ratelimit-limit-tokens"))
  const tpmRemaining = Number(headers.get("x-ratelimit-remaining-tokens"))
  const tpmReset = headers.get("x-ratelimit-reset-tokens")
  if (tpmLimit > 0) {
    windows.push({
      name: "TPM",
      utilization: Math.round(((tpmLimit - tpmRemaining) / tpmLimit) * 100),
      remaining: tpmRemaining,
      limit: tpmLimit,
      resetsAt: tpmReset ?? undefined,
    })
  }

  return windows
}

/** xAI/Grok provider — uses minimal chat completion to get rate limit headers */
export function createXaiProvider(): QuotaProvider {
  return {
    providerType: "xai",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "xai",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-3-mini-fast",
            max_tokens: 1,
            messages: [{ role: "user", content: "." }],
          }),
        })

        if (resp.status === 401) {
          return { ...base, available: false, windows: [], error: "Invalid API key" }
        }
        if (!resp.ok) {
          return { ...base, available: false, windows: [], error: `HTTP ${resp.status}` }
        }

        const windows = parseRateLimitHeaders(resp.headers)
        return { ...base, available: true, windows }
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
