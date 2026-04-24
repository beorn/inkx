import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import type { AgentEvent } from "../src/events.ts"
import { spawnClaude } from "../src/spawn.ts"

/**
 * Live integration test — spawns the real `claude` binary with our
 * `--mcp-config` materializer, mounts the echo-mcp fixture, and asks claude
 * to call the `echo_mcp` tool. Guards against future regressions where
 * `--mcp-config` / `--strict-mcp-config` get accidentally dropped from
 * spawn.ts's argv builder.
 *
 * Double-gated so normal CI stays green:
 *   1. `TEST_LIVE` env var must be set (opt-in). Unset → test.skip.
 *   2. The `claude` binary must be resolvable on PATH. Missing → test.skip.
 *
 * The mcp-wiring.test.ts unit test covers the JSON shape the materializer
 * emits; this one asserts the shape actually survives being handed to claude
 * and routed through the MCP plumbing.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url))
const FIXTURE = resolve(HERE, "fixtures/echo-mcp.ts")

function claudeBinaryAvailable(): boolean {
  const which = spawnSync("which", ["claude"], { encoding: "utf8" })
  return which.status === 0 && which.stdout.trim().length > 0
}

const liveGate = process.env.TEST_LIVE ? claudeBinaryAvailable() : false

describe("live: --mcp-config end-to-end", () => {
  test.skipIf(!liveGate)(
    "spawned claude reaches mounted echo-mcp tool",
    async () => {
      const session = spawnClaude({
        mcpServers: [
          {
            name: "echo",
            command: "bun",
            args: ["run", FIXTURE],
          },
        ],
        silentStderr: true,
      })

      const events: AgentEvent[] = []
      const unsubscribe = session.subscribe((e) => {
        events.push(e)
      })

      try {
        session.send(
          'Call the MCP tool named mcp__echo__echo_mcp with the arguments {"foo":"bar"}. ' +
            "Do not ask for confirmation. Report the tool result verbatim.",
        )

        // Wait (max 30s) for a session-end event. The tool-use may or may not
        // arrive before session-end depending on how claude batches; we
        // inspect `events` below either way.
        const deadlineMs = 30_000
        const start = Date.now()
        while (!session.closed && Date.now() - start < deadlineMs) {
          if (events.some((e) => e.kind === "session-end")) break
          await new Promise<void>((r) => setTimeout(r, 100))
        }
      } finally {
        unsubscribe()
        await session.close()
      }

      const init = events.find((e) => e.kind === "session-init")
      expect(init, "session-init must arrive — proves claude was spawned with valid args").toBeDefined()
      if (init?.kind === "session-init") {
        expect(init.model, "model should be set on session-init").toBeTruthy()
        expect(init.cwd, "cwd should be set on session-init").toBeTruthy()
      }

      const toolUses = events.filter((e): e is Extract<AgentEvent, { kind: "tool-use" }> => e.kind === "tool-use")
      const echoUses = toolUses.filter((e) => /echo/.test(e.name))
      expect(
        echoUses.length,
        `at least one tool-use with name matching /echo/; saw names: ${
          toolUses.map((t) => t.name).join(", ") || "<none>"
        }`,
      ).toBeGreaterThan(0)

      const end = events.find((e): e is Extract<AgentEvent, { kind: "session-end" }> => e.kind === "session-end")
      expect(end, "session-end must arrive before the 30s deadline").toBeDefined()
      if (end) {
        expect(end.stopReason, "session-end should carry a stopReason").toBeTruthy()
      }
    },
    60_000,
  )

  test("TEST_LIVE gate honored when env unset", () => {
    if (!process.env.TEST_LIVE) {
      expect(liveGate).toBe(false)
    } else {
      expect(liveGate).toBe(claudeBinaryAvailable())
    }
  })
})
