import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "silvercode-account-status-"))
  vi.stubEnv("HOME", tmpHome)
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock("@beorn/accountly")
  vi.unstubAllEnvs()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("account status cache", () => {
  test("ignores legacy claude-accounts cache rows without account status fields", async () => {
    const { silvercodeAllAccountsCachePath } = await import("@km/config/paths")
    const { readAllAccountsCacheSync } = await import("../src/account-status.ts")
    const cachePath = silvercodeAllAccountsCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        fetchedAt: Date.now(),
        accounts: [{ name: "old", email: "old@example.com", plan: "claude_max_20x", quotas: [], isActive: true }],
      }),
    )

    expect(readAllAccountsCacheSync()).toBeNull()
  })

  test("can read stale all-account cache for first paint while refresh runs", async () => {
    const { silvercodeAllAccountsCachePath } = await import("@km/config/paths")
    const { readAllAccountsCacheSync } = await import("../src/account-status.ts")
    const cachePath = silvercodeAllAccountsCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 2,
        fetchedAt: Date.now() - 10 * 60 * 1000,
        accounts: [
          {
            kind: "claude-profile",
            name: "stale@example.com",
            label: "Claude Code",
            provider: "claude-oauth",
            email: "stale@example.com",
            plan: "claude_max_20x",
            quotas: [],
            error: null,
            current: true,
            isActive: true,
            loading: false,
          },
        ],
      }),
    )

    expect(readAllAccountsCacheSync()).toBeNull()
    expect(readAllAccountsCacheSync({ allowStale: true })?.[0]?.name).toBe("stale@example.com")
  })

  test("does not treat cached transient 429 rows as durable all-account data", async () => {
    const { silvercodeAllAccountsCachePath } = await import("@km/config/paths")
    const { readAllAccountsCacheSync } = await import("../src/account-status.ts")
    const cachePath = silvercodeAllAccountsCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 2,
        fetchedAt: Date.now(),
        accounts: [
          {
            kind: "claude-profile",
            name: "active@example.com",
            label: "Claude Code",
            provider: "claude-oauth",
            email: "active@example.com",
            plan: "claude_max_20x",
            dir: "/profiles/active@example.com",
            authenticated: true,
            default: true,
            stock: false,
            available: false,
            current: true,
            isActive: true,
            quotas: [],
            error: "HTTP 429: Too Many Requests",
            loading: false,
          },
          {
            kind: "api-key",
            name: "openai",
            label: "OpenAI API",
            provider: "openai",
            email: null,
            available: true,
            current: false,
            isActive: false,
            quotas: [{ name: "RPM", utilization: 1 }],
            error: null,
            loading: false,
          },
        ],
      }),
    )

    const cached = readAllAccountsCacheSync()
    expect(cached?.map((account) => account.name)).toEqual(["openai"])
  })

  test("can read stale active-account cache for first paint while refresh runs", async () => {
    const profileDir = join(tmpHome, ".config", "claude-profiles", "stale@example.com")
    vi.stubEnv("CLAUDE_CONFIG_DIR", profileDir)
    const { silvercodeActiveAccountCachePath } = await import("@km/config/paths")
    const { readCachedProbeSync, setAccountFactoryOverride } = await import("../src/claude-account.ts")
    setAccountFactoryOverride(null)
    const cachePath = silvercodeActiveAccountCachePath(profileDir)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        fetchedAt: Date.now() - 10 * 60 * 1000,
        probe: {
          email: "stale@example.com",
          plan: "claude_max_20x",
          quotas: [],
          error: null,
          loading: false,
        },
      }),
    )

    expect(readCachedProbeSync()).toBeNull()
    expect(readCachedProbeSync({ allowStale: true })?.email).toBe("stale@example.com")
  })

  test("all-account refresh reuses cached good data for transient 429 profile failures", async () => {
    vi.doMock("@beorn/accountly", () => ({
      getAccountStatuses: async () => [
        {
          kind: "claude-profile",
          name: "active@example.com",
          label: "Claude Code",
          provider: "claude-oauth",
          email: "active@example.com",
          plan: "claude_max_20x",
          dir: "/profiles/active@example.com",
          authenticated: true,
          current: true,
          default: true,
          stock: false,
          available: false,
          quotas: [],
          error: "HTTP 429: Too Many Requests",
        },
        {
          kind: "api-key",
          name: "openai",
          label: "OpenAI API",
          provider: "openai",
          email: null,
          current: false,
          default: false,
          stock: false,
          available: true,
          quotas: [{ name: "RPM", utilization: 1 }],
          error: null,
        },
      ],
    }))
    const { silvercodeAllAccountsCachePath } = await import("@km/config/paths")
    const cachePath = silvercodeAllAccountsCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 2,
        fetchedAt: Date.now() - 10 * 60 * 1000,
        accounts: [
          {
            kind: "claude-profile",
            name: "active@example.com",
            label: "Claude Code",
            provider: "claude-oauth",
            email: "active@example.com",
            plan: "claude_max_20x",
            dir: "/profiles/active@example.com",
            authenticated: true,
            default: true,
            stock: false,
            available: true,
            current: true,
            isActive: true,
            quotas: [{ name: "5-hour", utilization: 12 }],
            error: null,
            loading: false,
          },
        ],
      }),
    )

    const { probeAllAccounts } = await import("../src/account-status.ts")
    const accounts = await probeAllAccounts(true)
    const active = accounts.find((account) => account.name === "active@example.com")
    expect(active?.error).toBeNull()
    expect(active?.quotas).toHaveLength(1)

    const written = JSON.parse(readFileSync(cachePath, "utf8")) as {
      accounts: Array<{ name: string; error: string | null; quotas: unknown[] }>
    }
    const cachedActive = written.accounts.find((account) => account.name === "active@example.com")
    expect(cachedActive?.error).toBeNull()
    expect(cachedActive?.quotas).toHaveLength(1)
  })
})
