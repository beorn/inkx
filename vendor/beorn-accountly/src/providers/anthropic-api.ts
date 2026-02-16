import type { Credential, QuotaInfo, QuotaProvider, QuotaWindow } from "../types.ts"

const MESSAGES_URL = "https://api.anthropic.com/v1/messages"

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

/** Parse rate limit windows from Anthropic response headers */
function parseRateLimitHeaders(headers: Headers): QuotaWindow[] {
  const windows: QuotaWindow[] = []

  // RPM (requests per minute)
  const rpmLimit = Number(headers.get("anthropic-ratelimit-requests-limit"))
  const rpmRemaining = Number(headers.get("anthropic-ratelimit-requests-remaining"))
  const rpmReset = headers.get("anthropic-ratelimit-requests-reset")
  if (rpmLimit > 0) {
    windows.push({
      name: "RPM",
      utilization: Math.round(((rpmLimit - rpmRemaining) / rpmLimit) * 100),
      remaining: rpmRemaining,
      limit: rpmLimit,
      resetsAt: rpmReset ?? undefined,
    })
  }

  // Input TPM (input tokens per minute)
  const itpmLimit = Number(headers.get("anthropic-ratelimit-input-tokens-limit"))
  const itpmRemaining = Number(headers.get("anthropic-ratelimit-input-tokens-remaining"))
  const itpmReset = headers.get("anthropic-ratelimit-input-tokens-reset")
  if (itpmLimit > 0) {
    windows.push({
      name: "Input TPM",
      utilization: Math.round(((itpmLimit - itpmRemaining) / itpmLimit) * 100),
      remaining: itpmRemaining,
      limit: itpmLimit,
      resetsAt: itpmReset ?? undefined,
    })
  }

  // Output TPM (output tokens per minute)
  const otpmLimit = Number(headers.get("anthropic-ratelimit-output-tokens-limit"))
  const otpmRemaining = Number(headers.get("anthropic-ratelimit-output-tokens-remaining"))
  const otpmReset = headers.get("anthropic-ratelimit-output-tokens-reset")
  if (otpmLimit > 0) {
    windows.push({
      name: "Output TPM",
      utilization: Math.round(((otpmLimit - otpmRemaining) / otpmLimit) * 100),
      remaining: otpmRemaining,
      limit: otpmLimit,
      resetsAt: otpmReset ?? undefined,
    })
  }

  return windows
}

/** Anthropic direct API key provider — uses minimal messages call to get rate limit headers */
export function createAnthropicApiProvider(): QuotaProvider {
  return {
    providerType: "anthropic-api",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "anthropic-api",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(MESSAGES_URL, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
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
        const available = windows.length === 0 || windows.every((w) => w.utilization < 100)
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
