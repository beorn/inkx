/**
 * All-backends smoke tests — spawn each ACP agent for real, assert
 * close() resolves cleanly within budget.
 *
 * What's tested
 * - For each registry-id we ship in BUILTIN_AGENTS:
 *   1. The documented spawn command works (binary exists on PATH).
 *   2. connectAcpRegistry() returns within a reasonable timeout.
 *   3. session.close() resolves within the SIGTERM-then-SIGKILL window
 *      (10 s ceiling per gracefulKillTree). Catches the codex hang
 *      regression we fixed in c8bc60107.
 *
 * What's NOT tested here
 * - A real turn round-trip (auth-dependent, network-dependent, slow).
 *   That's a higher-tier integration test gated behind an env var.
 *
 * Skip behavior
 * - Each test calls `which <binary>` first; missing binary → test.skip().
 *   Lets CI run the file without every backend installed; failures only
 *   come from binaries the host actually has.
 *
 * Bead-class: km-silvercode.acp-rename / agent integration sweep.
 */

import { describe, test, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { createScope } from "@silvery/scope"
import { connectAcpRegistry, type AcpRegistryId } from "@km/agent-harness"

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

/** Resolve a binary on PATH, return absolute path or null. */
function which(binary: string): string | null {
  const out = spawnSync("which", [binary], { encoding: "utf8" })
  if (out.status !== 0) return null
  const path = (out.stdout ?? "").trim()
  return path.length > 0 ? path : null
}

/**
 * The actual binary each registry id resolves to via its documented
 * spawn command. Mirrors `ACP_REGISTRY` in
 * @km/agent-harness/acp-client.ts but lifted here so the test layer
 * doesn't depend on private state. Update both together when an
 * upstream wrapper switches binaries.
 */
const REGISTRY_BINARY: Readonly<Record<string, string>> = {
  // npx is what claude-code-acp / codex / pi-acp / gemini all front-end through.
  // The actual codex / gemini / pi binaries are pulled by npx-y at first use,
  // but we still want the npx binary to exist as a precondition.
  "claude-code": "npx",
  codex: "npx",
  "pi-acp": "npx",
  gemini: "npx",
  "github-copilot-cli": "copilot",
}

/** Should the test for `id` run on this host? */
function canRun(id: string): boolean {
  const bin = REGISTRY_BINARY[id]
  if (!bin) return false
  return which(bin) !== null
}

// ---------------------------------------------------------------------------
// Per-backend smoke test
// ---------------------------------------------------------------------------

const REGISTRY_IDS: readonly AcpRegistryId[] = [
  "claude-code",
  "codex",
  "gemini",
  "github-copilot-cli",
] as const

describe.each(REGISTRY_IDS)("backend smoke: %s", (id) => {
  const skip = !canRun(id)

  test.skipIf(skip)(
    "connectAcpRegistry → close() resolves within the 10s window",
    { timeout: 30_000 },
    async () => {
      // Fresh scope per test so dispose-time SIGTERM/SIGKILL teardown
      // doesn't leak across cases.
      const scope = createScope(`smoke-${id}`)
      try {
        const session = await connectAcpRegistry(scope, id, {
          cwd: process.cwd(),
          sessionCwd: process.cwd(),
          // Minimal capabilities — we're not testing fs/permissions here.
          clientCapabilities: {},
          // No-op handlers for any callbacks the agent might fire during init.
          permissionHandler: async () => ({
            outcome: { outcome: "cancelled" },
          }),
        })
        // Real test: close() must resolve. Pre-fix codex-acp could hang
        // here indefinitely waiting for in-flight session work. Post-fix
        // (c8bc60107: detached spawn + stdio drain + 10s SIGKILL via
        // gracefulKillTree) it resolves within the 10s window.
        const closeStart = Date.now()
        await session.close()
        const closeMs = Date.now() - closeStart
        expect(closeMs).toBeLessThan(15_000)
      } finally {
        await scope[Symbol.asyncDispose]()
      }
    },
  )
})

// ---------------------------------------------------------------------------
// Sanity: at least one backend exercises the test, otherwise the file is
// invisibly skipped on every host and the regression coverage evaporates.
// ---------------------------------------------------------------------------

describe("backend smoke: at least one registry id is testable on this host", () => {
  test("at least one of claude-code / codex / gemini / copilot is on PATH", () => {
    const reachable = REGISTRY_IDS.filter((id) => canRun(id))
    // If you see this fail in CI, install at least one ACP-speaking
    // agent — `npx -y @zed-industries/codex-acp --help` smoke-installs
    // codex into the npx cache and is enough to satisfy the gate.
    expect(reachable.length).toBeGreaterThan(0)
  })
})
