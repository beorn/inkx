import { afterEach, describe, expect, test, vi } from "vitest"
import { discoverAccounts } from "../src/discover.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("discoverAccounts", () => {
  test("discovers Cursor SDK API account from CURSOR_API_KEY", () => {
    vi.stubEnv("CURSOR_API_KEY", "cursor-test-key")

    const cursor = discoverAccounts().find((account) => account.config.provider === "cursor-api")

    expect(cursor).toBeDefined()
    expect(cursor?.config.name).toBe("cursor")
    expect(cursor?.credential.apiKey).toBe("cursor-test-key")
  })

  test("discovers Codex API account from CODEX_API_KEY", () => {
    vi.stubEnv("CODEX_API_KEY", "codex-test-key")
    vi.stubEnv("OPENAI_API_KEY", "")

    const codex = discoverAccounts().find((account) => account.config.name === "codex")

    expect(codex).toBeDefined()
    expect(codex?.config.provider).toBe("openai")
    expect(codex?.credential.apiKey).toBe("codex-test-key")
  })
})
