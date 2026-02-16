import type { AccountProvider, QuotaProvider } from "../types.ts"
import { createClaudeOAuthProvider } from "./claude-oauth.ts"
import { createAnthropicApiProvider } from "./anthropic-api.ts"
import { createOpenAIProvider } from "./openai.ts"
import { createGoogleProvider } from "./google.ts"

const providers = new Map<AccountProvider, QuotaProvider>()

function ensureProviders(): void {
  if (providers.size > 0) return
  const all: QuotaProvider[] = [
    createClaudeOAuthProvider(),
    createAnthropicApiProvider(),
    createOpenAIProvider(),
    createGoogleProvider(),
  ]
  for (const p of all) {
    providers.set(p.providerType, p)
  }
}

/** Get a provider by type */
export function getProvider(type: AccountProvider): QuotaProvider {
  ensureProviders()
  const provider = providers.get(type)
  if (!provider) throw new Error(`Unknown provider: ${type}`)
  return provider
}

/** Get all registered providers */
export function getAllProviders(): QuotaProvider[] {
  ensureProviders()
  return [...providers.values()]
}
