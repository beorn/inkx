import type { Credential, QuotaInfo, QuotaProvider } from "../types.ts"

/** Google/Gemini provider (stub for v0.2) */
export function createGoogleProvider(): QuotaProvider {
  return {
    providerType: "google",

    validateCredential(credential: Credential): boolean {
      return typeof credential.apiKey === "string" && credential.apiKey.length > 0
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const valid = this.validateCredential(credential)
      return {
        accountName: "",
        provider: "google",
        available: valid,
        windows: [],
        error: valid ? undefined : "Invalid API key",
        checkedAt: Date.now(),
      }
    },
  }
}
