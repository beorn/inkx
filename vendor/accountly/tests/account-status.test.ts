import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { getAccountStatuses } from "../src/account-status.ts"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("getAccountStatuses", () => {
  test("returns API-key accounts, including Cursor, through the shared status API", async () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "CODEX_API_KEY",
      "OPENAI_API_KEY",
      "XAI_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY",
    ]) {
      vi.stubEnv(key, "")
    }
    vi.stubEnv("CURSOR_API_KEY", "key_cursor_test")
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        apiKeyName: "Cursor SDK",
        createdAt: "2026-04-30T12:00:00Z",
        userEmail: "dev@example.com",
      }),
    }) as unknown as typeof fetch

    try {
      const statuses = await getAccountStatuses({ includeProfiles: false })
      expect(statuses).toHaveLength(1)
      expect(statuses[0]).toMatchObject({
        kind: "api-key",
        name: "cursor",
        provider: "cursor-api",
        label: "Cursor API",
        email: "dev@example.com",
        credentialHint: "…test",
        available: true,
      })
      expect(statuses[0]?.quota?.metadata?.apiKeyName).toBe("Cursor SDK")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("labels CODEX_API_KEY as Codex", async () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "XAI_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY",
      "CURSOR_API_KEY",
    ]) {
      vi.stubEnv(key, "")
    }
    vi.stubEnv("CODEX_API_KEY", "codex-test-key")
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "x-ratelimit-limit-requests": "500",
        "x-ratelimit-remaining-requests": "499",
      }),
    }) as unknown as typeof fetch

    try {
      const statuses = await getAccountStatuses({ includeProfiles: false })
      expect(statuses).toHaveLength(1)
      expect(statuses[0]).toMatchObject({
        kind: "api-key",
        name: "codex",
        provider: "openai",
        label: "Codex",
        sourceEnvVar: "CODEX_API_KEY",
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("marks the current profile by CLAUDE_CONFIG_DIR for embedded callers", async () => {
    const root = mkdtempSync(join(tmpdir(), "accountly-status-"))
    const workDir = join(root, "work@example.com")
    const personalDir = join(root, "personal@example.com")
    mkdirSync(workDir, { recursive: true })
    mkdirSync(personalDir, { recursive: true })
    vi.stubEnv("CLAUDE_PROFILE_ROOT", root)
    vi.stubEnv("CLAUDE_CONFIG_DIR", workDir)

    try {
      const statuses = await getAccountStatuses({ includeApiKeys: false })
      expect(statuses.find((status) => status.name === "work@example.com")?.current).toBe(true)
      expect(statuses.find((status) => status.name === "personal@example.com")?.current).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
