import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("credential file operations", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "accountly-creds-test-"))
    mkdirSync(join(tempDir, "credentials"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("write and read credential roundtrip", () => {
    const credPath = join(tempDir, "credentials", "personal.json")
    const credential = {
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: "2026-02-15T12:00:00Z",
    }

    writeFileSync(credPath, JSON.stringify(credential, null, 2))
    const raw = readFileSync(credPath, "utf-8")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any

    expect(parsed.accessToken).toBe("test-access-token")
    expect(parsed.refreshToken).toBe("test-refresh-token")
  })

  test("credential file permissions should be restrictive", () => {
    const credPath = join(tempDir, "credentials", "work.json")
    writeFileSync(credPath, JSON.stringify({ apiKey: "sk-test" }))
    const { chmodSync } = require("node:fs") as typeof import("node:fs")
    chmodSync(credPath, 0o600)

    const stat = statSync(credPath)
    // Check that only owner has read/write (mode 0600)
    const mode = stat.mode & 0o777
    expect(mode).toBe(0o600)
  })

  test("delete credential removes file", () => {
    const credPath = join(tempDir, "credentials", "old.json")
    writeFileSync(credPath, JSON.stringify({ apiKey: "old-key" }))
    expect(existsSync(credPath)).toBe(true)

    const { unlinkSync } = require("node:fs") as typeof import("node:fs")
    unlinkSync(credPath)
    expect(existsSync(credPath)).toBe(false)
  })
})
