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
 */

import { spawnSync } from "node:child_process"

export function probeClaudeVersion(): string | null {
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
