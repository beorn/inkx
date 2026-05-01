import type { Credential, QuotaInfo, QuotaProvider } from "../types.ts"

const ME_URL = "https://api.cursor.com/v0/me"

interface CursorMeResponse {
  apiKeyName?: string
  createdAt?: string
  userEmail?: string
}

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

function metadataFrom(data: CursorMeResponse): Record<string, string> {
  const metadata: Record<string, string> = {}
  if (data.apiKeyName) metadata.apiKeyName = data.apiKeyName
  if (data.createdAt) metadata.createdAt = data.createdAt
  if (data.userEmail) metadata.userEmail = data.userEmail
  return metadata
}

/** Cursor SDK/API provider — validates CURSOR_API_KEY via the Background Agent API metadata endpoint. */
export function createCursorApiProvider(): QuotaProvider {
  return {
    providerType: "cursor-api",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "cursor-api",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(ME_URL, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (resp.status === 401) {
          return { ...base, available: false, windows: [], error: "Invalid API key" }
        }
        if (!resp.ok) {
          return { ...base, available: false, windows: [], error: `HTTP ${resp.status}` }
        }

        const data = (await resp.json()) as CursorMeResponse
        return { ...base, available: true, windows: [], metadata: metadataFrom(data) }
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
