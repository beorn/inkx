/**
 * Registry-adapter integration tests.
 *
 * Each registry id (`pi-acp`, `codex`, `gemini`, `github-copilot-cli`) maps to
 * a known spawn command + args in `acp-client.ts#ACP_REGISTRY`. These tests
 * assert that `connectAcpRegistry(scope, id, opts)` produces the correct wire
 * spawn — they do NOT actually invoke any external binary. The spawn seam is
 * mocked with the same in-memory `AgentSideConnection` harness used by
 * `acp-client.test.ts`, so the test exercises the real ACP wire end-to-end
 * without `npx`.
 *
 * Per-bead context (close at session end):
 * - km-silvercode.acp-adapter-pi      → pi-acp registry entry
 * - km-silvercode.acp-adapter-codex   → codex registry entry
 * - km-silvercode.acp-adapter-gemini  → gemini registry entry
 *
 * The fourth backend (`github-copilot-cli`) ships in the registry too; we
 * cover it here because the table treats all four uniformly.
 */

import { existsSync, statSync } from "node:fs"
import { Readable, Writable } from "node:stream"
import { fileURLToPath } from "node:url"
import * as acp from "@agentclientprotocol/sdk"
import { createScope } from "@silvery/scope"
import { afterEach, describe, expect, test } from "vitest"
import {
  type AcpRegistryId,
  type AcpSpawn,
  type AcpSpawnedChild,
  __setAcpSpawnForTesting,
  connectAcpRegistry,
} from "../src/acp-client.ts"

// ---------------------------------------------------------------------------
// Spawn-capture harness
// ---------------------------------------------------------------------------

interface SpawnCapture {
  command?: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

/**
 * Build a spawn fake that records the (command, args, options) tuple AND runs
 * a tiny in-memory ACP server on the other side of stdio. The server returns
 * a deterministic sessionId so the test can also confirm the connection
 * round-trips after spawn.
 */
function createCapturingSpawn(): { spawn: AcpSpawn; capture: SpawnCapture } {
  const capture: SpawnCapture = {}

  const spawn: AcpSpawn = (command, args, options) => {
    capture.command = command
    capture.args = [...args]
    capture.cwd = options.cwd
    capture.env = options.env

    // Two simplex pipes between parent and (in-process) ACP server.
    const parentToServer = pair()
    const serverToParent = pair()

    const serverWritable = Writable.toWeb(serverToParent.writable as Writable) as WritableStream<Uint8Array>
    const serverReadable = Readable.toWeb(parentToServer.readable as Readable) as unknown as ReadableStream<Uint8Array>
    const serverStream = acp.ndJsonStream(serverWritable, serverReadable)
    void new acp.AgentSideConnection(
      () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: `sess-${command}` }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
      serverStream,
    )

    const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = []
    const child = {
      pid: 12345,
      stdin: parentToServer.writable,
      stdout: serverToParent.readable,
      stderr: new Readable({
        read() {
          this.push(null)
        },
      }),
      kill(signal?: NodeJS.Signals | number): boolean {
        const s = typeof signal === "string" ? signal : ("SIGTERM" as NodeJS.Signals)
        try {
          parentToServer.writable.end()
        } catch {
          /* ignore */
        }
        try {
          serverToParent.writable.end()
        } catch {
          /* ignore */
        }
        process.nextTick(() => {
          for (const fn of exitListeners) fn(0, s)
        })
        return true
      },
      on(event: string, listener: (...args: unknown[]) => void): unknown {
        if (event === "exit") {
          exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void)
        }
        return child
      },
    }
    return child as unknown as AcpSpawnedChild
  }

  return { spawn, capture }
}

function pair(): { readable: Readable; writable: Writable } {
  const readable = new Readable({
    read() {
      // pull-driven; data arrives via writable.write below
    },
  })
  const writable = new Writable({
    write(chunk: Buffer, _enc, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      readable.push(buf)
      cb()
    },
    final(cb) {
      readable.push(null)
      cb()
    },
  })
  return { readable, writable }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  __setAcpSpawnForTesting(null)
})

/**
 * Expected wire spawn for each registry id. Update both the registry table
 * (`acp-client.ts#ACP_REGISTRY`) and these expectations together — they're
 * the contract. See per-backend docs in `docs/adapter-{pi,codex,gemini}.md`
 * for the rationale behind each command/arg choice.
 */
const EXPECTED: Record<AcpRegistryId, { command: string; args: string[]; env?: Record<string, string> }> = {
  codex: { command: "bun", args: ["x", "@zed-industries/codex-acp"] },
  // `--acp` replaced deprecated `--experimental-acp` (gemini-cli 0.38+).
  // GEMINI_CLI_TRUST_WORKSPACE suppresses info-level stdout pollution that
  // corrupts the ndJSON-RPC stream (bead km-silvercode.acp-gemini-stdout-pollution).
  gemini: {
    command: "bun",
    args: ["x", "@google/gemini-cli", "--acp"],
    env: { GEMINI_CLI_TRUST_WORKSPACE: "true" },
  },
  "github-copilot-cli": { command: "copilot", args: [] },
  "pi-acp": { command: "bun", args: ["x", "pi-acp"] },
  // claude-code resolves its bin via import.meta.url because @km/claude-acp is
  // a private workspace package (npm 404). The exact resolved path depends on
  // where the test runs; assert structure (`bun <…/claude-acp/bin/silvercode-claude-acp.js>`)
  // rather than a brittle string match.
  "claude-code": { command: "bun", args: ["__claude-acp-bin__"] },
}

describe("connectAcpRegistry", () => {
  for (const [id, expected] of Object.entries(EXPECTED) as [
    AcpRegistryId,
    { command: string; args: string[]; env?: Record<string, string> },
  ][]) {
    test(`${id}: spawns the documented command + args`, async () => {
      const { spawn, capture } = createCapturingSpawn()
      __setAcpSpawnForTesting(spawn)

      await using scope = createScope(`test-registry-${id}`)
      const session = await connectAcpRegistry(scope, id, { cwd: "/tmp/work" })

      expect(capture.command).toBe(expected.command)
      if (expected.args[0] === "__claude-acp-bin__") {
        // Workspace-resolved bin — assert shape, not exact path.
        expect(capture.args).toHaveLength(1)
        expect(capture.args?.[0]).toMatch(/\/claude-acp\/bin\/silvercode-claude-acp\.js$/)
      } else {
        expect(capture.args).toEqual(expected.args)
      }
      expect(capture.cwd).toBe("/tmp/work")
      // Confirm the connection round-tripped to the in-memory server.
      expect(session.protocolVersion).toBe(1)
      expect(session.sessionId).toBe(`sess-${expected.command}`)
      // Registry-level env vars must be present in the spawned env.
      if (expected.env) {
        for (const [k, v] of Object.entries(expected.env)) {
          expect(capture.env?.[k]).toBe(v)
        }
      }
    })
  }

  test("extraArgs are appended after the registry args", async () => {
    const { spawn, capture } = createCapturingSpawn()
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-registry-extra")
    await connectAcpRegistry(scope, "gemini", {
      cwd: "/tmp/work",
      extraArgs: ["--model", "gemini-2.5-pro"],
    })

    expect(capture.command).toBe("bun")
    expect(capture.args).toEqual(["x", "@google/gemini-cli", "--acp", "--model", "gemini-2.5-pro"])
  })

  test("env overrides are merged over process.env", async () => {
    const { spawn, capture } = createCapturingSpawn()
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-registry-env")
    await connectAcpRegistry(scope, "codex", {
      cwd: "/tmp/work",
      env: { CODEX_API_KEY: "sk-test-codex" },
    })

    expect(capture.env?.CODEX_API_KEY).toBe("sk-test-codex")
    // process.env values still flow through (sample a stable one).
    expect(capture.env?.PATH).toBeTruthy()
  })

  test("unknown registry id throws", async () => {
    await using scope = createScope("test-registry-unknown")
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing the runtime guard for unknown ids
      connectAcpRegistry(scope, "no-such-agent" as any),
    ).toThrow(/unknown registryId/)
  })
})

// ---------------------------------------------------------------------------
// Bin reachability — regression guard for d17afaa82
// ---------------------------------------------------------------------------
//
// d17afaa82 fixed a regression where `claude-code`'s registry entry pointed at
// `bun x @km/claude-acp` — but @km/claude-acp is private/workspace-only and
// 404s on npm. The spawn failed silently inside an unawaited
// `void spawnSession().catch(...)`, no session was created, and the App
// rendered an empty welcome card on a blank screen.
//
// This block asserts every entry in ACP_REGISTRY points at something
// reachable BEFORE we ship it:
//
//   - `bun x <pkg>` style: the package exists on the npm registry. We use
//     `bun pm view <pkg> --json` (resolves metadata, doesn't download). If
//     the network is down we warn-and-skip; if the network is up the
//     package MUST resolve. This catches "shipped a `bun x <pkg>` that
//     404s on npm" before it reaches a user.
//   - explicit binary on PATH (`copilot`): skipped. User binary, not
//     silvercode's responsibility — covered by the spawn-correctness test
//     above.
//   - workspace-resolved bin path (`silvercode-claude-acp.js`): assert
//     the absolute path exists and has the executable bit set. THIS is
//     the row that would have caught the d17afaa82 bug — when the
//     registry pointed at `bun x @km/claude-acp`, the npm-registry case
//     above would have failed with `404 Not Found`.
//
// We do NOT actually spawn the binaries here — that's structural
// reachability only. The welcome-card smoke test in
// apps/silvercode/tests/welcome-card-paints.test.tsx covers end-to-end
// "if a session can spawn, the App actually paints" via a fake factory.

type ReachabilityKind =
  | { kind: "npm"; package: string }
  | { kind: "path"; absolutePath: string }
  | { kind: "skip"; reason: string }

/**
 * Map each registry id to the resolved-spawn shape we need to verify.
 * Keep this in sync with `ACP_REGISTRY` in `acp-client.ts`. When a registry
 * entry changes (e.g. `bun x <pkg>` → workspace path, or vice versa), update
 * the matching row here too — the contract is "every registry id maps to a
 * reachable spawn target."
 */
const REACHABILITY: Record<AcpRegistryId, ReachabilityKind> = {
  codex: { kind: "npm", package: "@zed-industries/codex-acp" },
  gemini: { kind: "npm", package: "@google/gemini-cli" },
  "pi-acp": { kind: "npm", package: "pi-acp" },
  "github-copilot-cli": { kind: "skip", reason: "user binary on PATH (copilot) — not silvercode's responsibility" },
  // claude-code resolves its bin via fileURLToPath(import.meta.url) — same
  // resolution used by ACP_REGISTRY in acp-client.ts. If the source-resolved
  // path drifts from the runtime resolution, this row breaks. THIS is the
  // row that would have caught d17afaa82 — when the registry pointed at
  // `bun x @km/claude-acp`, switching this row's kind to `npm` would have
  // failed with 404.
  "claude-code": {
    kind: "path",
    absolutePath: fileURLToPath(new URL("../../claude-acp/bin/silvercode-claude-acp.js", import.meta.url)),
  },
}

describe("ACP_REGISTRY bin reachability", () => {
  for (const [id, target] of Object.entries(REACHABILITY) as [AcpRegistryId, ReachabilityKind][]) {
    test(`${id}: spawn target is reachable`, () => {
      if (target.kind === "skip") {
        // Document why we're skipping so a future maintainer can re-evaluate.
        // No assertion — the surrounding describe.each ensures every id has a row.
        expect(target.reason).toMatch(/.+/)
        return
      }

      if (target.kind === "path") {
        expect(existsSync(target.absolutePath)).toBe(true)
        const st = statSync(target.absolutePath)
        // Executable bit must be set on at least one of (owner, group, other).
        // A node script without +x can't be exec'd — `bun <path>` would
        // technically still run via the bun loader, but the registry contract
        // is "this is a runnable bin" so we enforce +x as documentation.
        expect(st.mode & 0o111).not.toBe(0)
        return
      }

      // npm — `bun pm view <pkg> --json` exits 0 when the package resolves
      // on the configured registry, 1 when 404. We don't parse the JSON;
      // exit code is sufficient for "the name is registered."
      const result = Bun.spawnSync({
        cmd: ["bun", "pm", "view", target.package, "--json"],
        stderr: "pipe",
        stdout: "pipe",
      })
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr ?? new Uint8Array())
        // Tolerate offline test environments — the contract is "if you have
        // network, the package must resolve." Without network, a real 404
        // looks the same as a connection failure, so we can't be strict.
        if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo|connect/i.test(stderr)) {
          // eslint-disable-next-line no-console -- diagnostic for offline runs
          console.warn(`registry-adapters[${id}]: skipping reachability check, network unavailable`)
          return
        }
        // Real 404 / unexpected failure — fail with the stderr so the
        // maintainer sees exactly why the registry name is unreachable.
        // This is the assertion that catches d17afaa82-class bugs.
        throw new Error(
          `bun pm view ${target.package} failed (exit ${result.exitCode}). ` +
            `Registry id "${id}" points at an unreachable npm name. stderr:\n${stderr}`,
        )
      }
    })
  }
})
