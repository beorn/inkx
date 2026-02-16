import type { Credential, QuotaInfo, QuotaProvider } from "../types.ts"

/** Anthropic direct API key provider (stub for v0.2) */
export function createAnthropicApiProvider(): QuotaProvider {
  return {
    providerType: "anthropic-api",

    validateCredential(credential: Credential): boolean {
      return typeof credential.apiKey === "string" && credential.apiKey.length > 0
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      // Direct API keys use rate limit headers — need to make an actual API call
      // For now, just validate the key exists
      const valid = this.validateCredential(credential)
      return {
        accountName: "",
        provider: "anthropic-api",
        available: valid,
        windows: [],
        error: valid ? undefined : "Invalid API key",
        checkedAt: Date.now(),
      }
    },
  }
}
