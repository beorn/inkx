import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Point HOME at a fresh tmp dir so accountsRoot() resolves under our control.
// We need to do this BEFORE importing the module under test, since it reads
// homedir() at call time (good — no import-time side effects to dodge).

let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "silvercode-accounts-"))
  vi.stubEnv("HOME", tmpHome)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("accounts", () => {
  test("resolveAccountDir joins ~/.km/accounts/<name> and creates the parent", async () => {
    const mod = await import("../src/accounts.ts")
    const dir = mod.resolveAccountDir("work")
    expect(dir).toBe(join(tmpHome, ".km", "accounts", "work"))
    // resolve should have MkdirP'd the parent so downstream writes don't race.
    expect(mod.accountsRoot()).toBe(join(tmpHome, ".km", "accounts"))
    // Parent exists, but NOT the account dir itself — caller populates that.
    const rootStat = await import("node:fs").then((f) => f.statSync(mod.accountsRoot()))
    expect(rootStat.isDirectory()).toBe(true)
    expect(await import("node:fs").then((f) => f.existsSync(dir))).toBe(false)
  })

  test("accountExists — false when dir missing, false when empty, true with settings.json", async () => {
    const mod = await import("../src/accounts.ts")
    expect(mod.accountExists("ghost")).toBe(false)

    const dir = mod.resolveAccountDir("empty")
    mkdirSync(dir, { recursive: true })
    expect(mod.accountExists("empty")).toBe(false)

    writeFileSync(join(dir, "settings.json"), "{}")
    expect(mod.accountExists("empty")).toBe(true)
  })

  test("accountExists — true with .credentials.json alone (OAuth-only account)", async () => {
    const mod = await import("../src/accounts.ts")
    const dir = mod.resolveAccountDir("oauth-only")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, ".credentials.json"), "{}")
    expect(mod.accountExists("oauth-only")).toBe(true)
  })

  test("listAccounts — empty when root missing, sorted dir names when populated", async () => {
    const mod = await import("../src/accounts.ts")
    expect(mod.listAccounts()).toEqual([])

    mkdirSync(mod.resolveAccountDir("work"), { recursive: true })
    mkdirSync(mod.resolveAccountDir("personal"), { recursive: true })
    mkdirSync(mod.resolveAccountDir("experimental"), { recursive: true })
    // Stray file in the root — should be ignored.
    writeFileSync(join(mod.accountsRoot(), "README"), "ignore me")

    expect(mod.listAccounts()).toEqual(["experimental", "personal", "work"])
  })
})
