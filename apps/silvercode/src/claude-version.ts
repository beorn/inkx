/**
 * Probe `claude --version` synchronously at startup.
 *
 * Why: `session-init` from Claude Code's stream-json only arrives AFTER the
 * user sends their first message. Before that, the side-panel version line
 * reads "Claude Code v…" which looks unfinished. A one-shot version probe
 * fills the value immediately so the UI is never blank.
 *
 * Cheap: `claude --version` returns in ~30ms and the output format is
 * "2.1.119 (Claude Code)" — the first whitespace-separated token is the
 * semver. Returns `null` if the binary isn't found or the output doesn't
 * match the expected shape; the caller falls back to the "…" placeholder.
 *
 * Test injection
 * --------------
 * Tests inject a fake version via `setVersionFactoryOverride()` (preferred,
 * type-safe) or by setting `SILVERCODE_FAKE_CLAUDE_VERSION=<string>` before
 * the module is imported. Both bypass the spawn so visual tests don't read
 * the host's installed CLI.
 */

import { spawnSync } from "node:child_process"

/** Test-only override. When set, replaces the spawn-based probe entirely. */
let versionOverride: (() => string | null) | null = null

/**
 * Test-only: install a fake version probe. Pass `null` to clear.
 * Production callers MUST NOT use this.
 */
export function setVersionFactoryOverride(factory: (() => string | null) | null): void {
  versionOverride = factory
}

export function probeClaudeVersion(): string | null {
  if (versionOverride) return versionOverride()
  const envFake = process.env.SILVERCODE_FAKE_CLAUDE_VERSION
  if (typeof envFake === "string" && envFake.length > 0) return envFake
  try {
    const result = spawnSync("claude", ["--version"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (result.status !== 0) return null
    const out = (result.stdout ?? "").trim()
    const m = out.match(/^(\d+\.\d+\.\d+\S*)/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}
