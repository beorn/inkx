import type { Credential, QuotaInfo, QuotaProvider } from "../types.ts"

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

/** Google/Gemini provider — validates key via models list endpoint */
export function createGoogleProvider(): QuotaProvider {
  return {
    providerType: "google",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "google",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(`${MODELS_URL}?key=${apiKey}&pageSize=1`)

        if (resp.status === 400 || resp.status === 403) {
          return { ...base, available: false, windows: [], error: "Invalid API key" }
        }
        if (!resp.ok) {
          return { ...base, available: false, windows: [], error: `HTTP ${resp.status}` }
        }

        // Key is valid — Gemini doesn't expose quota usage via API
        return { ...base, available: true, windows: [] }
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
