import type { AccountConfig, AccountProvider, Credential } from "./types.ts"
import { getAccounts } from "./config.ts"
import { readCredential } from "./credentials.ts"
import { readKeychainCredential } from "./keychain.ts"

/** Env var → provider mapping, in display order */
const ENV_SOURCES: { envVar: string; provider: AccountProvider; name: string }[] = [
  { envVar: "ANTHROPIC_API_KEY", provider: "anthropic-api", name: "anthropic" },
  { envVar: "OPENAI_API_KEY", provider: "openai", name: "openai" },
  { envVar: "XAI_API_KEY", provider: "xai", name: "xai" },
  { envVar: "GEMINI_API_KEY", provider: "google", name: "gemini" },
  { envVar: "GOOGLE_API_KEY", provider: "google", name: "google" },
  { envVar: "OPENROUTER_API_KEY", provider: "openrouter", name: "openrouter" },
]

export interface DiscoveredAccount {
  config: AccountConfig
  credential: Credential
}

/**
 * Discover all available accounts:
 * 1. Persisted accounts (Claude OAuth from ~/.config/accountly/)
 * 2. API keys from environment variables (zero-config)
 */
export function discoverAccounts(): DiscoveredAccount[] {
  const results: DiscoveredAccount[] = []
  const seen = new Set<string>()

  // 1. Persisted accounts (Claude OAuth multi-account)
  for (const account of getAccounts()) {
    const credential = readCredential(account.name)
    if (credential) {
      results.push({ config: account, credential })
      seen.add(account.name)
    }
  }

  // 2. Auto-discover from env vars
  const seenProviders = new Set<string>()
  for (const { envVar, provider, name } of ENV_SOURCES) {
    if (seenProviders.has(provider)) continue
    if (seen.has(name)) continue

    const apiKey = process.env[envVar]
    if (!apiKey) continue

    seenProviders.add(provider)
    results.push({
      config: { name, provider },
      credential: { apiKey },
    })
  }

  return results
}

/**
 * Get credential for an account — checks persisted first, then env vars.
 */
export function getCredentialForAccount(name: string): Credential | undefined {
  // Check persisted
  const persisted = readCredential(name)
  if (persisted) return persisted

  // Check env vars
  for (const { envVar, name: envName } of ENV_SOURCES) {
    if (envName === name) {
      const apiKey = process.env[envVar]
      if (apiKey) return { apiKey }
    }
  }

  return undefined
}
