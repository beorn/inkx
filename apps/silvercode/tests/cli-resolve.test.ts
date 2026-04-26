/**
 * resolveConnection tests — verify the four resolution paths
 * (registry-label, connection-string, built-in, env / default fallback)
 * plus the missing-entry error shape.
 *
 * Each test loads a synthetic YAML config from a tmpdir to keep the
 * fixture isolated from the developer's real `~/.config/km/config.yaml`.
 * Pattern mirrors `vendor/silvery/packages/config/tests/multi-source.test.ts`.
 */

import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "@silvery/config"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveConnection } from "../src/resolve-connection.ts"

let tmpDir: string
const ORIGINAL_ENV = { ...process.env }

async function configWith(yaml: string) {
  const path = join(tmpDir, "config.yaml")
  await writeFile(path, yaml)
  // `path:` (not `appName`) — single explicit file, no project walk-up.
  // searchProject:false so the test never accidentally picks up the
  // developer's real config from km's worktree.
  return await loadConfig({ path, searchProject: false, watch: false })
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvercode-cli-resolve-"))
  // Prevent ambient SILVERCODE_AGENT / KM_AGENT from leaking into the
  // explicit-input tests — env-fallback gets its own test that sets them.
  delete process.env["SILVERCODE_AGENT"]
  delete process.env["KM_AGENT"]
  // Seed an ambient credential so the zero-config pre-flight is satisfied
  // for whichever built-in agent each test happens to resolve to. The
  // pre-flight's intent is verified in `zero-config.test.ts`; here we
  // just need *some* cred source so resolution returns a value.
  process.env["ANTHROPIC_API_KEY"] ||= "sk-test-resolve-fixture"
  process.env["OPENAI_API_KEY"] ||= "sk-test-resolve-fixture"
  process.env["GEMINI_API_KEY"] ||= "test-resolve-fixture"
  process.env["GITHUB_TOKEN"] ||= "ghp-test-resolve-fixture"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("resolveConnection — explicit input", () => {
  it("resolves a registry label → registry-label source", async () => {
    const config = await configWith(
      `ai:
  acp:
    work: "claude-code?model=opus-4.7&bare"
`,
    )
    const resolved = resolveConnection("work", config)
    expect(resolved.source).toBe("registry-label")
    expect(resolved.label).toBe("work")
    expect(resolved.entry.agent).toBe("claude-code")
    expect(resolved.entry.model).toBe("opus-4.7")
    expect(resolved.entry.bare).toBe(true)
    config.unwatch()
  })

  it("parses a connection-string → connection-string source", async () => {
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection("codex?model=gpt-5-mini", config)
    expect(resolved.source).toBe("connection-string")
    expect(resolved.entry.agent).toBe("codex")
    expect(resolved.entry.model).toBe("gpt-5-mini")
    config.unwatch()
  })

  it("recognises a built-in agent id → builtin source", async () => {
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection("gemini", config)
    expect(resolved.source).toBe("builtin")
    expect(resolved.entry.agent).toBe("gemini")
    config.unwatch()
  })

  it("throws a multi-line error when input matches nothing", async () => {
    const config = await configWith(
      `ai:
  acp:
    work: "claude-code"
`,
    )
    expect(() => resolveConnection("does-not-exist", config)).toThrowError(/did not match any known connection/)
    // The error body should also list the configured labels so the user
    // knows what's available — guard against a regression that drops
    // the helpful hint.
    expect(() => resolveConnection("does-not-exist", config)).toThrowError(/work/)
    config.unwatch()
  })
})

describe("resolveConnection — fallbacks", () => {
  it("uses SILVERCODE_AGENT env var when --agent is omitted", async () => {
    const config = await configWith(
      `ai:
  acp:
    env-preset: "codex?model=gpt-5"
`,
    )
    process.env["SILVERCODE_AGENT"] = "env-preset"
    const resolved = resolveConnection(undefined, config)
    expect(resolved.source).toBe("registry-label")
    expect(resolved.label).toBe("env-preset")
    expect(resolved.entry.agent).toBe("codex")
    expect(resolved.entry.model).toBe("gpt-5")
    config.unwatch()
  })

  it("falls back to ai.acp.default → registry-default source", async () => {
    const config = await configWith(
      `ai:
  acp:
    default: claude-work
    claude-work: "claude-code?model=opus-4.7"
`,
    )
    const resolved = resolveConnection(undefined, config)
    expect(resolved.source).toBe("registry-default")
    expect(resolved.label).toBe("claude-work")
    expect(resolved.entry.agent).toBe("claude-code")
    expect(resolved.entry.model).toBe("opus-4.7")
    config.unwatch()
  })

  it("falls back to built-in claude-code when nothing is configured", async () => {
    const config = await configWith("ai:\n  acp: {}\n")
    const resolved = resolveConnection(undefined, config)
    expect(resolved.source).toBe("default-builtin")
    expect(resolved.entry.agent).toBe("claude-code")
    config.unwatch()
  })

  it("throws when ai.acp.default points to a missing entry", async () => {
    const config = await configWith(
      `ai:
  acp:
    default: ghost
`,
    )
    expect(() => resolveConnection(undefined, config)).toThrowError(/ai\.acp\.default = "ghost".*no matching entry/s)
    config.unwatch()
  })
})
