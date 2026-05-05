import { afterEach, describe, expect, test } from "vitest"
import { discoverAccounts } from "../src/discover.ts"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("discoverAccounts", () => {
  test("keeps separate OpenAI API and Codex API key accounts", () => {
    process.env.CODEX_API_KEY = "codex-test-key"
    process.env.OPENAI_API_KEY = "openai-test-key"

    const openaiAccounts = discoverAccounts().filter((account) => account.config.provider === "openai")

    expect(openaiAccounts.map((account) => account.config.name)).toEqual(["codex", "openai"])
    expect(openaiAccounts.map((account) => account.config.metadata?.envVar)).toEqual(["CODEX_API_KEY", "OPENAI_API_KEY"])
  })
})
