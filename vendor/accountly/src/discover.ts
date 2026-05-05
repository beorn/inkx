import type { AccountConfig, AccountProvider, Credential } from "./types.ts"

/**
 * Env var → provider mapping, in display order.
 *
 * accountly's profile system handles Claude OAuth via macOS Keychain slots
 * (see src/profile.ts). This module now only handles zero-config API-key
 * providers discovered from environment variables — Anthropic API key users,
 * OpenAI, xAI, Gemini, OpenRouter. The old persistent-account registry was
 * removed when the profile model replaced it.
 */
const ENV_SOURCES: { envVar: string; provider: AccountProvider; name: string }[] = [
  { envVar: "ANTHROPIC_API_KEY", provider: "anthropic-api", name: "anthropic" },
  { envVar: "CODEX_API_KEY", provider: "openai", name: "codex" },
  { envVar: "OPENAI_API_KEY", provider: "openai", name: "openai" },
  { envVar: "XAI_API_KEY", provider: "xai", name: "xai" },
  { envVar: "GEMINI_API_KEY", provider: "google", name: "gemini" },
  { envVar: "GOOGLE_API_KEY", provider: "google", name: "google" },
  { envVar: "OPENROUTER_API_KEY", provider: "openrouter", name: "openrouter" },
  { envVar: "CURSOR_API_KEY", provider: "cursor-api", name: "cursor" },
]

export interface DiscoveredAccount {
  config: AccountConfig
  credential: Credential
}

/** Discover API-key-based providers from environment variables. */
export function discoverAccounts(): DiscoveredAccount[] {
  const results: DiscoveredAccount[] = []
  const seenAccounts = new Set<string>()
  for (const { envVar, provider, name } of ENV_SOURCES) {
    const key = provider === "openai" ? `${provider}:${name}` : provider
    if (seenAccounts.has(key)) continue
    const apiKey = process.env[envVar]
    if (!apiKey) continue
    seenAccounts.add(key)
    results.push({
      config: { name, provider, metadata: { envVar } },
      credential: { apiKey },
    })
  }
  return results
}
