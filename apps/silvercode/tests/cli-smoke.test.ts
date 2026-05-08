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
 * - SIGTERM during post-mount banner → exits within budget (regression
 *   guard for km-silvercode.signal-hang-investigate; without bootstrap.ts'
 *   SIGTERM fast-exit, this test would hang at 100% CPU)
 *
 * The pre-flight tests do NOT enter alt-screen mode because every failing
 * pre-flight exits BEFORE `await run(...)` gets called. The post-mount
 * SIGTERM test DOES enter alt-screen and verifies the bootstrap fast-exit
 * handler is wired correctly — that is the regression we care about.
 *
 * Bead: km-silvercode.resume-blank-screen, km-silvercode.signal-hang-investigate.
 */

import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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

  test("--resume <missing-uuid> for Codex exits 2 before ACP loadSession", () => {
    const sid = "019ddb5f-2c6d-7861-a927-e13423f9e89"
    const r = silvercode(["--resume", `codex:${sid}`])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain(`--resume ${sid}`)
    expect(r.stderr).toContain("no codex transcript")
    expect(r.stderr).toContain("~/.codex/sessions/")
    expect(r.stderr).not.toContain("Resource not found")
    expect(r.stdout).not.toContain("\x1b[?1049h")
  })

  test("--agent + sid prefix conflict exits 2 with conflict text", () => {
    const r = silvercode(["--agent", "codex", "--resume", "claude-code:00000000-aaaa-bbbb-cccc-dddddddddddd"])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("--agent codex conflicts with sid prefix claude")
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

  test("doctor checker subcommands honor --json before or after the checker", () => {
    for (const args of [
      ["doctor", "connections", "--json"],
      ["doctor", "--json", "connections"],
    ]) {
      const r = silvercode(args)
      expect(r.status).toBe(0)
      expect(() => JSON.parse(r.stdout)).not.toThrow()
      const parsed = JSON.parse(r.stdout) as { sections: unknown[] }
      expect(parsed.sections).toHaveLength(1)
      expect(r.stdout).toContain('"title": "ai.acp + ai.mcp"')
      expect(r.stdout).not.toContain("silvercode doctor\n")
    }
  })

  test("doctor inherits top-level --cwd unless the checker overrides it", () => {
    const inherited = silvercode(["--cwd", "/tmp", "doctor", "--json"])
    expect(inherited.status).toBe(0)
    expect(JSON.parse(inherited.stdout)).toMatchObject({ cwd: "/tmp" })

    const overridden = silvercode(["--cwd", "/tmp", "doctor", "connections", "--cwd", "/var", "--json"])
    expect(overridden.status).toBe(0)
    expect(JSON.parse(overridden.stdout)).toMatchObject({ cwd: "/var" })
  })

  test("traffic replay --json exits before TUI and reports projection provenance", () => {
    const dir = mkdtempSync(join(tmpdir(), "silvercode-traffic-cli-"))
    const path = join(dir, "events.jsonl")
    const sessionId = "traffic-cli-session"
    const turnId = "turn-1"
    const lines = [
      {
        kind: "session-init",
        sessionId,
        cwd: "/repo",
        model: "claude-sonnet",
        mode: "auto",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "2.1.119",
        apiKeySource: "OAuth",
        ts: 1,
      },
      { kind: "turn-start", sessionId, turnId, role: "assistant", ts: 2 },
      { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "hello", ts: 3 },
      { kind: "turn-end", sessionId, turnId, stopReason: "end_turn", ts: 4 },
    ]
    writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`)

    const r = silvercode(["traffic", "replay", path, "--json"])
    expect(r.status).toBe(0)
    expect(r.stdout).not.toContain("\x1b[?1049h")
    const parsed = JSON.parse(r.stdout) as {
      rawEvents: unknown[]
      normalizedEvents: Array<{ type: string }>
      projectedLeaves: Array<{ type: string; props: unknown }>
      frames: Array<{ normalizedEventIds: string[]; projectedLeafIds: string[] }>
    }
    expect(parsed.rawEvents).toHaveLength(4)
    expect(parsed.normalizedEvents.map((event) => event.type)).toContain("message.block.added")
    expect(parsed.projectedLeaves.some((leaf) => leaf.type === "message")).toBe(true)
    expect(
      parsed.frames.some((frame) => frame.normalizedEventIds.length > 0 && frame.projectedLeafIds.length > 0),
    ).toBe(true)
  })

  test("traffic view scrubs and traffic replay exports selected JSONL before TUI", () => {
    const dir = mkdtempSync(join(tmpdir(), "silvercode-traffic-view-cli-"))
    const path = join(dir, "events.jsonl")
    const sessionId = "traffic-view-session"
    const turnId = "turn-1"
    const lines = [
      {
        kind: "session-init",
        sessionId,
        cwd: "/repo",
        model: "claude-sonnet",
        mode: "auto",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "2.1.119",
        apiKeySource: "OAuth",
        ts: 1,
      },
      { kind: "turn-start", sessionId, turnId, role: "assistant", ts: 2 },
      { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "hello", ts: 3 },
      {
        kind: "plan-update",
        sessionId,
        source: "codex-plan",
        entries: [{ id: "step-cli", content: "Inspect traffic", status: "in_progress" }],
        ts: 4,
      },
      { kind: "turn-end", sessionId, turnId, stopReason: "end_turn", ts: 5 },
    ]
    writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`)

    const view = silvercode(["traffic", "view", path, "--track", "plan"])
    expect(view.status).toBe(0)
    expect(view.stdout).toContain("traffic viewer")
    expect(view.stdout).toContain("selector track=plan")
    expect(view.stdout).toContain("plan.updated")
    expect(view.stdout).not.toContain("\x1b[?1049h")

    const exported = silvercode(["traffic", "replay", path, "--plan-step", "step-cli", "--export-jsonl"])
    expect(exported.status).toBe(0)
    expect(exported.stdout.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(exported.stdout)).toMatchObject({ kind: "plan-update", entries: [{ id: "step-cli" }] })
    expect(exported.stdout).not.toContain("\x1b[?1049h")
  })
})

describe("silvercode CLI smoke — SIGTERM mitigation", () => {
  /**
   * Regression guard for km-silvercode.signal-hang-investigate.
   *
   * Spawns silvercode with no credentials so the controller's
   * `spawnSession()` rejects with "ACP connection closed", surfacing the
   * "Spawn failed" banner inside alt-screen. We then send SIGTERM and
   * assert the process exits within a budget — the bootstrap-level
   * `installFastExit("SIGTERM", ...)` handler should drain in <=1s.
   *
   * Without that handler, only SIGKILL would reap the child (per the
   * original incident). With a future regression that re-introduces a
   * wedged-loop after mount, this test would time out and SIGKILL
   * escalate — failing loudly instead of leaking 100% CPU processes.
   *
   * `SILVERCODE_AGENT=fake://does-not-exist` forces a registry lookup
   * miss so the spawn path runs with no credentials. The connection-string
   * scheme is rejected by `resolveExplicit`, which exits the program at the
   * pre-mount gate — for the post-mount path we instead rely on the
   * default `claude-code` agent + `--account d@delei.org-nonexistent`
   * combination, which lets mount succeed and spawn fail asynchronously.
   *
   * Budget rationale: 500ms grace from `installFastExit` + 500ms slack
   * for cleanup + 1500ms margin for slow CI = 2500ms wall budget.
   */
  test("SIGTERM during post-mount spawn-failure banner exits within budget", async () => {
    const SIGTERM_BUDGET_MS = 2500
    // Spawn detached so we own the pgid and can clean up grandchildren.
    const child = spawn(
      "bun",
      [
        BOOTSTRAP,
        // Non-existent account ensures spawnClaude fails (no creds dir),
        // surfacing the "Spawn failed" banner. Mount completes; the
        // failure happens async via the controller's eager spawnSession.
        "--account",
        "definitely-nonexistent-account-zzz-9999",
      ],
      {
        cwd: REPO_ROOT,
        // Pipe stdin so silvercode doesn't see TTY (no real keystrokes
        // can interrupt the test). Pipe stdout/stderr so we can check
        // alt-screen entry was attempted.
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    )
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf8")
    })
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString("utf8")
    })

    // Wait for alt-screen entry (\x1b[?1049h) — that confirms mount
    // started and we're in the post-pre-flight path. Cap the wait so a
    // pre-flight regression fails fast.
    const altScreenSeen = await new Promise<boolean>((resolve) => {
      const deadline = setTimeout(() => resolve(false), 5000)
      const check = () => {
        if (stdout.includes("\x1b[?1049h")) {
          clearTimeout(deadline)
          resolve(true)
        }
      }
      child.stdout?.on("data", check)
      check()
    })
    expect(altScreenSeen).toBe(true)

    // Send SIGTERM and time the exit.
    const start = Date.now()
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }))
    })
    child.kill("SIGTERM")

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), SIGTERM_BUDGET_MS)
    })

    const result = await Promise.race([exitPromise, timeoutPromise])
    const elapsed = Date.now() - start

    if (result === "timeout") {
      // Escalate to SIGKILL so we don't leak a 100% CPU process from a
      // failing test. This is the EXACT behavior cli-smoke uses and the
      // exact behavior callers MUST replicate per the bead's contract.
      child.kill("SIGKILL")
      await exitPromise.catch(() => undefined)
      throw new Error(
        `silvercode failed to exit within ${SIGTERM_BUDGET_MS}ms of SIGTERM (took >${elapsed}ms). ` +
          `This is the regression guarded by km-silvercode.signal-hang-investigate — ` +
          `bootstrap.ts' installFastExit("SIGTERM") handler is missing or broken, OR a new wedge ` +
          `was introduced. stderr=<<<${stderr.slice(0, 500)}>>>`,
      )
    }

    // SIGTERM fast-exit uses code 143; bun/node may report code OR signal
    // depending on whether process.exit() ran before SIGTERM was actually
    // delivered to the kernel. Either is acceptable.
    expect(elapsed).toBeLessThan(SIGTERM_BUDGET_MS)
    const exitedCleanly = result.code === 143 || result.signal === "SIGTERM"
    if (!exitedCleanly) {
      // Non-fatal diagnostic — the timing assertion is the load-bearing one.
      // We still want visibility if the exit path drifts.
      console.warn(`silvercode SIGTERM smoke: unexpected exit code=${result.code} signal=${result.signal}`)
    }
  }, 15_000)
})
