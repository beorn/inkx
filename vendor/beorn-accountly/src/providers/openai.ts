import type { Credential, QuotaInfo, QuotaProvider } from "../types.ts"

/** OpenAI provider (stub for v0.2) */
export function createOpenAIProvider(): QuotaProvider {
  return {
    providerType: "openai",

    validateCredential(credential: Credential): boolean {
      return typeof credential.apiKey === "string" && credential.apiKey.length > 0
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const valid = this.validateCredential(credential)
      return {
        accountName: "",
        provider: "openai",
        available: valid,
        windows: [],
        error: valid ? undefined : "Invalid API key",
        checkedAt: Date.now(),
      }
    },
  }
}
