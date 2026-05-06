/**
 * Zero-config first-run tests — exercise the credential auto-discovery and
 * the pre-flight check that runs before silvercode mounts.
 *
 * Strategy: redirect `$HOME` to a tmpdir per test so the resolver's
 * `~/.config/claude-profiles/` and `~/.claude/` lookups hit synthetic fixtures
 * instead of the developer's real home. Mirrors the pattern in
 * `accounts.ts` (which honors `$HOME` over `os.homedir()` precisely so
 * tests can do this).
 *
 * Each test seeds exactly one cred source so the assertions are
 * orthogonal — failures point straight at which source the resolver
 * stopped recognising.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "@silvery/config"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveConnection } from "../src/resolve-connection.ts"

let tmpDir: string
let homeDir: string
const ORIGINAL_ENV = { ...process.env }

async function configWith(yaml: string) {
  const path = join(tmpDir, "config.yaml")
  writeFileSync(path, yaml)
  return await loadConfig({ path, searchProject: false, watch: false })
}

/** Populate `$HOME/.config/claude-profiles/<name>/settings.json` so `accountExists` is true. */
function seedAccount(name: string) {
  const dir = join(homeDir, ".config", "claude-profiles", name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "settings.json"), "{}")
}

/** Populate `$HOME/.claude/` so the credDir reachability check passes. */
function seedCredDir() {
  const dir = join(homeDir, ".claude")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "settings.json"), "{}")
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvercode-zero-config-"))
  homeDir = await mkdtemp(join(tmpdir(), "silvercode-zero-config-home-"))
  // Redirect `$HOME` so accounts.ts + credDir expansion hit the synthetic
  // dirs. Remove any notification cred env vars so each test seeds its own.
  process.env["HOME"] = homeDir
  delete process.env["SILVERCODE_AGENT"]
  delete process.env["KM_AGENT"]
  delete process.env["ANTHROPIC_API_KEY"]
  delete process.env["CLAUDE_CODE_OAUTH_TOKEN"]
  delete process.env["OPENAI_API_KEY"]
  delete process.env["GEMINI_API_KEY"]
  delete process.env["GOOGLE_API_KEY"]
  delete process.env["GITHUB_TOKEN"]
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("resolveConnection — zero-config preflight", () => {
  it("passes when a single account dir exists (auto-picks it)", async () => {
    seedAccount("default")
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection(undefined, config)
    expect(resolved.source).toBe("default-builtin")
    expect(resolved.entry.agent).toBe("claude")
    // Auto-discovered single account flows into `entry.account`.
    expect(resolved.entry.account).toBe("default")
    expect(resolved.autoAccount).toBe("default")
    config.unwatch()
  })

  it("passes when credDir exists (no account, env not set)", async () => {
    seedCredDir()
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection(undefined, config)
    expect(resolved.entry.agent).toBe("claude")
    // No account dir — entry.account stays undefined, runtime uses ~/.claude.
    expect(resolved.entry.account).toBeUndefined()
    expect(resolved.autoAccount).toBeUndefined()
    config.unwatch()
  })

  it("passes when a credEnv var is set (no account, no credDir)", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test-fake-token"
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection(undefined, config)
    expect(resolved.entry.agent).toBe("claude")
    expect(resolved.entry.account).toBeUndefined()
    config.unwatch()
  })

  it("passes for codex when OPENAI_API_KEY is set (no credDir for codex)", async () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-fake"
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection("codex", config)
    expect(resolved.source).toBe("builtin")
    expect(resolved.entry.agent).toBe("codex")
    config.unwatch()
  })

  it("errors with an actionable message when no creds are reachable for a built-in", async () => {
    const config = await configWith("ai:\n  acp: {}\n")
    expect(() => resolveConnection(undefined, config)).toThrowError(/no credentials reachable for agent=claude/)
    // The error must name at least one env var so the user knows what to set.
    expect(() => resolveConnection(undefined, config)).toThrowError(/ANTHROPIC_API_KEY/)
    // And mention the profile-dir copy hint.
    expect(() => resolveConnection(undefined, config)).toThrowError(/claude-profiles/)
    config.unwatch()
  })

  it("errors for codex when OPENAI_API_KEY is missing (no credDir, no account)", async () => {
    const config = await configWith("ai:\n  acp: {}\n")
    expect(() => resolveConnection("codex", config)).toThrowError(/no credentials reachable for agent=codex/)
    expect(() => resolveConnection("codex", config)).toThrowError(/OPENAI_API_KEY/)
    config.unwatch()
  })

  it("skips the preflight for custom (non-built-in) agents", async () => {
    // Custom agent id — no entry in BUILTIN_AGENTS, so preflight returns early.
    // Connection-string syntax sidesteps the registry-label path and goes
    // through the connection-string parser, then misses isBuiltinAgentId.
    const config = await configWith("ai:\n  acp: {}\n")
    // A registry entry with a free-form `agent` works the same way — no
    // preflight, no error, even though no creds are reachable.
    const config2 = await configWith(
      `ai:
  acp:
    my-fork: {agent: my-fork-of-claude, transport: spawn}
`,
    )
    const resolved = resolveConnection("my-fork", config2)
    expect(resolved.entry.agent).toBe("my-fork-of-claude")
    config.unwatch()
    config2.unwatch()
  })

  it("auto-picks nothing when multiple account dirs exist (ambiguous)", async () => {
    seedAccount("personal")
    seedAccount("work")
    // Also seed credDir so the preflight has *something* to grab onto —
    // otherwise this test would fail with "no creds" instead of the
    // ambiguity behaviour we want to verify.
    seedCredDir()
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection(undefined, config)
    // Multiple accounts → leave undefined; doctor / runtime resolves later.
    expect(resolved.entry.account).toBeUndefined()
    expect(resolved.autoAccount).toBeUndefined()
    config.unwatch()
  })
})
