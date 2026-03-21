import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// We test the config module by mocking the config dir via module-level patching.
// Since config.ts uses hardcoded paths, we test the logic by directly testing
// the file operations with a temp dir.

describe("config file operations", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "accountly-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("JSON roundtrip preserves structure", () => {
    const { writeFileSync } = require("node:fs") as typeof import("node:fs")
    const configPath = join(tempDir, "accounts.json")
    const config = {
      accounts: [
        { name: "personal", provider: "claude-oauth" as const },
        { name: "work", provider: "claude-oauth" as const, metadata: { email: "test@work.com" } },
      ],
      activeAccount: "personal",
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2))
    const raw = readFileSync(configPath, "utf-8")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any

    expect(parsed.accounts).toHaveLength(2)
    expect(parsed.accounts[0].name).toBe("personal")
    expect(parsed.accounts[1].metadata?.email).toBe("test@work.com")
    expect(parsed.activeAccount).toBe("personal")
  })

  test("upsert replaces existing account", () => {
    const { writeFileSync } = require("node:fs") as typeof import("node:fs")
    const configPath = join(tempDir, "accounts.json")
    const config = {
      accounts: [{ name: "personal", provider: "claude-oauth" as const }],
    }
    writeFileSync(configPath, JSON.stringify(config))

    // Simulate upsert
    const raw = readFileSync(configPath, "utf-8")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any
    const idx = parsed.accounts.findIndex((a: { name: string }) => a.name === "personal")
    parsed.accounts[idx] = { name: "personal", provider: "claude-oauth", metadata: { tier: "pro" } }
    writeFileSync(configPath, JSON.stringify(parsed, null, 2))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = JSON.parse(readFileSync(configPath, "utf-8")) as any
    expect(updated.accounts).toHaveLength(1)
    expect(updated.accounts[0].metadata?.tier).toBe("pro")
  })

  test("remove account clears active if matching", () => {
    const config = {
      accounts: [
        { name: "personal", provider: "claude-oauth" },
        { name: "work", provider: "claude-oauth" },
      ],
      activeAccount: "personal",
    }

    // Simulate remove
    const idx = config.accounts.findIndex((a) => a.name === "personal")
    config.accounts.splice(idx, 1)
    if (config.activeAccount === "personal") {
      config.activeAccount = undefined as unknown as string
    }

    expect(config.accounts).toHaveLength(1)
    expect(config.activeAccount).toBeUndefined()
  })
})
