/**
 * CLI smoke tests — spawn `bun src/bootstrap.ts` with various flags and
 * assert exit code + stderr. These catch user-facing regressions that
 * unit tests miss because they live above the function boundary.
 *
 * Coverage areas:
 * - `--resume <synthetic-acp-id>` → exit 2, stderr explains the synthetic-id problem
 * - `--resume <missing-uuid>` → exit 2, stderr points to the projdir
 * - `--resume <agent>:<sid>` with conflicting `--agent` → exit 2 with conflict text
 * - `--help` → exit 0, prints help
 *
 * The tests do NOT enter alt-screen mode because every failing pre-flight
 * exits BEFORE `await run(...)` gets called. That's the whole point of
 * pre-flight: errors land in the user's normal terminal, not behind alt-screen.
 *
 * Bead: km-silvercode.resume-blank-screen.
 */

import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..")
const BOOTSTRAP = join(REPO_ROOT, "apps", "silvercode", "src", "bootstrap.ts")

function silvercode(args: string[], opts: { stdin?: string; timeoutMs?: number } = {}) {
  return spawnSync("bun", [BOOTSTRAP, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    input: opts.stdin ?? "",
    timeout: opts.timeoutMs ?? 8_000,
    // Default `killSignal` is SIGTERM. If the child's event loop is wedged
    // (a real failure mode — see km-silvercode.signal-hang-investigate),
    // SIGTERM is queued but never dispatched and the child keeps running
    // at 100% CPU until manually reaped. SIGKILL can't be ignored, so
    // escalate immediately on timeout. If we ever need a graceful drain
    // here we should add a SIGTERM-then-SIGKILL escalator instead of
    // weakening the signal back to SIGTERM.
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      // Force a non-TTY so the CLI doesn't try to enter alt-screen even
      // if pre-flight passed (unlikely in these tests but defensive).
      CI: "1",
    },
  })
}

describe("silvercode CLI smoke — pre-flight resume validation", () => {
  test("--resume <synthetic-acp-id> exits 2 with 'synthesized' message", () => {
    const r = silvercode(["--resume", "claude-code:claude-acp-1777334914180-1"])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("--resume claude-acp-1777334914180-1")
    expect(r.stderr).toContain("synthesized")
    expect(r.stderr).toContain("older silvercode")
    // Must NOT have entered alt-screen — no escape sequences in stdout.
    expect(r.stdout).not.toContain("\x1b[?1049h")
  })

  test("--resume <missing-uuid> for Claude exits 2 with 'not found' message", () => {
    const r = silvercode(["--resume", "claude-code:00000000-1111-2222-3333-444444444444"])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("--resume 00000000-1111-2222-3333-444444444444")
    expect(r.stderr).toContain("not found")
    expect(r.stderr).toContain("~/.claude/projects/")
    expect(r.stdout).not.toContain("\x1b[?1049h")
  })

  test("--agent + sid prefix conflict exits 2 with conflict text", () => {
    const r = silvercode(["--agent", "codex", "--resume", "claude-code:00000000-aaaa-bbbb-cccc-dddddddddddd"])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("--agent codex conflicts with sid prefix claude-code")
    expect(r.stdout).not.toContain("\x1b[?1049h")
  })

  test("--help exits 0 and prints usage", () => {
    const r = silvercode(["--help"])
    expect(r.status).toBe(0)
    // Commander's --help writes to stdout
    expect(r.stdout).toContain("silvercode")
    expect(r.stdout).toContain("--resume")
    expect(r.stdout).toContain("--agent")
  })
})
