/**
 * `--account <name>` must propagate to silvercode's OWN process env, not
 * just to spawned subprocesses.
 *
 * Bug: when the user runs `silvercode --account d@delei.org`, spawnClaude
 * correctly sets CLAUDE_CONFIG_DIR=~/.config/claude-profiles/d@delei.org/ for the
 * spawned subprocess. But silvercode's SidePanel calls
 * `resolveActiveEmail()` which reads silvercode's OWN
 * `process.env.CLAUDE_CONFIG_DIR` — which was inherited from the user's
 * shell (typically pointing at ~/.claude/<other-account>/). The side panel
 * then displays the wrong email even though the agent is correctly billing
 * the requested account.
 *
 * Fix: `applyActiveAccountEnv(name)` overrides `process.env.CLAUDE_CONFIG_DIR`
 * before App is mounted so SidePanel's email resolver returns the
 * requested account.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "silvercode-account-env-"))
  vi.stubEnv("HOME", tmpHome)
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("--account env propagation: SidePanel sees the requested account, not the shell default", () => {
  test("applyActiveAccountEnv overrides process.env.CLAUDE_CONFIG_DIR for the requested account", async () => {
    // Simulate the shell-default (the source of the bug — bjorn@stabell.org
    // in the user's report).
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/some/legacy/bjorn@stabell.org")

    // Materialize the requested account so accountExists() would pass — not
    // strictly required for env propagation but mirrors a real run.
    const accountsRoot = join(tmpHome, ".config", "claude-profiles", "d@delei.org")
    mkdirSync(accountsRoot, { recursive: true })
    writeFileSync(join(accountsRoot, "settings.json"), "{}")

    const accounts = await import("../src/accounts.ts")
    const claudeAccount = await import("../src/claude-account.ts")

    // Pre-condition: env still points at the shell-default.
    expect(claudeAccount.resolveActiveEmail()).toBe("bjorn@stabell.org")

    // Apply the account.
    accounts.applyActiveAccountEnv("d@delei.org")

    // Post-condition: env now points at the requested account's dir, and
    // resolveActiveEmail (which the SidePanel uses) returns the new email.
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(join(tmpHome, ".config", "claude-profiles", "d@delei.org"))
    expect(claudeAccount.resolveActiveEmail()).toBe("d@delei.org")
  })

  test("applyActiveAccountEnv with undefined leaves env untouched", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/some/legacy/dir")
    const accounts = await import("../src/accounts.ts")
    accounts.applyActiveAccountEnv(undefined)
    expect(process.env.CLAUDE_CONFIG_DIR).toBe("/some/legacy/dir")
  })

  test("applyActiveAccountEnv returns the resolved configDir so callers can pass it down", async () => {
    const accounts = await import("../src/accounts.ts")
    const dir = accounts.applyActiveAccountEnv("work")
    expect(dir).toBe(join(tmpHome, ".config", "claude-profiles", "work"))
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(dir)
  })
})
