/**
 * Shared fake ACP backend contract tests.
 *
 * These run `connectAcp` against an in-process ACP server over the real
 * ndJSON-RPC wire. The fake is intentionally below the `AgentSession` layer:
 * tests exercise the same spawn, SDK connection, and config-option methods
 * used by real Codex/Gemini/Copilot/pi-acp backends.
 */

import * as acp from "@agentclientprotocol/sdk"
import { createScope } from "@silvery/scope"
import { afterEach, describe, expect, test, vi } from "vitest"
import { __setAcpSpawnForTesting, connectAcp, connectAcpRegistry } from "../src/acp-client.ts"
import type { AgentEvent } from "../src/events.ts"
import {
  createFakeAcpRegistrySpawn,
  createFakeAcpSpawn,
  createFakeCodexAcpSpawn,
} from "../src/testing/fake-acp-server.ts"

afterEach(() => {
  __setAcpSpawnForTesting(null)
})

describe("fake ACP server", () => {
  test.each(["codex", "gemini", "github-copilot-cli", "pi-acp", "claude", "claude-code"] as const)(
    "%s registry profile can initialize and answer a prompt",
    async (registryId) => {
      const fake = createFakeAcpRegistrySpawn(registryId, { sessionIdPrefix: `fake-${registryId}` })
      __setAcpSpawnForTesting(fake.spawn)

      await using scope = createScope(`test-fake-acp-${registryId}`)
      const session = await connectAcpRegistry(scope, registryId, {
        cwd: "/tmp/silvercode-test",
      })
      const events: AgentEvent[] = []
      session.subscribe((event) => events.push(event))

      await session.prompt([{ type: "text", text: "ping" }])

      expect(session.sessionId).toBe(`fake-${registryId}-1`)
      expect(events.some((event) => event.kind === "text-delta")).toBe(true)
      expect(fake.backend.getSession(session.sessionId)).toMatchObject({
        sessionId: session.sessionId,
      })
    },
  )

  test("Codex profile can run through the registry path", async () => {
    const fake = createFakeCodexAcpSpawn({ sessionIdPrefix: "codex-registry-test" })
    __setAcpSpawnForTesting(fake.spawn)

    await using scope = createScope("test-fake-codex-acp-registry")
    const session = await connectAcpRegistry(scope, "codex", {
      cwd: "/tmp/silvercode-test",
    })

    expect(session.sessionId).toBe("codex-registry-test-1")
    expect(selectOption(session.configOptions, "reasoning_effort").currentValue).toBe("medium")
  })

  test("Codex profile advertises and mutates config options over the real ACP wire", async () => {
    const fake = createFakeCodexAcpSpawn({ sessionIdPrefix: "codex-test" })
    __setAcpSpawnForTesting(fake.spawn)

    await using scope = createScope("test-fake-codex-acp-config")
    const session = await connectAcp(scope, {
      command: "fake-codex-acp",
      cwd: "/tmp/silvercode-test",
    })
    const events: AgentEvent[] = []
    const unsubscribe = session.subscribe((event) => events.push(event))

    const initialReasoning = selectOption(session.configOptions, "reasoning_effort")
    expect(initialReasoning.category).toBe("thought_level")
    expect(initialReasoning.currentValue).toBe("medium")

    const response = await session.setSessionConfigOption({
      configId: "reasoning_effort",
      value: "high",
    })

    expect(selectOption(response.configOptions, "reasoning_effort").currentValue).toBe("high")
    expect(selectOption(session.configOptions, "reasoning_effort").currentValue).toBe("high")
    expect(selectOption(fake.backend.getSessionConfigOptions(session.sessionId), "reasoning_effort").currentValue).toBe(
      "high",
    )
    await vi.waitFor(() =>
      expect(events.some((event) => event.kind === "status" && event.status === "acp:config_option_update")).toBe(true),
    )
    unsubscribe()
  })

  test("Codex profile rejects unsupported config values without mutating state", async () => {
    // The ACP SDK logs request-handler errors; suppress the deliberate
    // invalid-params path so the global no-stray-console guard stays useful.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const fake = createFakeCodexAcpSpawn({ sessionIdPrefix: "codex-test" })
    __setAcpSpawnForTesting(fake.spawn)

    try {
      await using scope = createScope("test-fake-codex-acp-invalid-config")
      const session = await connectAcp(scope, {
        command: "fake-codex-acp",
        cwd: "/tmp/silvercode-test",
      })

      await expect(
        session.setSessionConfigOption({
          configId: "reasoning_effort",
          value: "extreme",
        }),
      ).rejects.toThrow(/reasoning_effort/)

      expect(selectOption(session.configOptions, "reasoning_effort").currentValue).toBe("medium")
      expect(
        selectOption(fake.backend.getSessionConfigOptions(session.sessionId), "reasoning_effort").currentValue,
      ).toBe("medium")
    } finally {
      errSpy.mockRestore()
    }
  })

  test("scripted prompt can request permission through the real client callback", async () => {
    const fake = createFakeAcpSpawn({
      id: "permission-script",
      onPrompt: async ({ conn, params, emitText }) => {
        const response = await conn.requestPermission({
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: "tc-fake-perm",
            title: "Run echo",
            kind: "execute",
            status: "pending",
            rawInput: { command: "echo ok" },
          },
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "deny", name: "Deny", kind: "reject_once" },
          ],
        })
        await emitText(`permission:${response.outcome.outcome}`)
      },
    })
    __setAcpSpawnForTesting(fake.spawn)

    await using scope = createScope("test-fake-acp-permission-script")
    const session = await connectAcp(scope, {
      command: "fake-acp-permission",
      permissionHandler: async (req) => ({
        outcome: { outcome: "selected", optionId: req.options[0]!.optionId },
      }),
    })
    const events: AgentEvent[] = []
    session.subscribe((event) => events.push(event))

    await session.prompt([{ type: "text", text: "needs permission" }])

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "permission-request",
        requestId: "tc-fake-perm",
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "permission-decision",
        requestId: "tc-fake-perm",
        approved: true,
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "text-delta",
        text: "permission:selected",
      }),
    )
  })

  test("scripted prompt can call client filesystem handlers over ACP", async () => {
    const writes: Array<{ path: string; content: string }> = []
    const fake = createFakeAcpSpawn({
      id: "fs-script",
      onPrompt: async ({ conn, params, emitText }) => {
        const read = await conn.readTextFile({
          sessionId: params.sessionId,
          path: "/tmp/input.txt",
        })
        await conn.writeTextFile({
          sessionId: params.sessionId,
          path: "/tmp/output.txt",
          content: read.content.toUpperCase(),
        })
        await emitText(`fs:${read.content}`)
      },
    })
    __setAcpSpawnForTesting(fake.spawn)

    await using scope = createScope("test-fake-acp-fs-script")
    const session = await connectAcp(scope, {
      command: "fake-acp-fs",
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      fsHandler: {
        async readTextFile(req) {
          expect(req.path).toBe("/tmp/input.txt")
          return { content: "hello" }
        },
        async writeTextFile(req) {
          writes.push({ path: req.path, content: req.content })
          return {}
        },
      },
    })
    const events: AgentEvent[] = []
    session.subscribe((event) => events.push(event))

    await session.prompt([{ type: "text", text: "use fs" }])

    expect(writes).toEqual([{ path: "/tmp/output.txt", content: "HELLO" }])
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "text-delta",
        text: "fs:hello",
      }),
    )
  })
})

function selectOption(
  options: acp.SessionConfigOption[],
  id: string,
): Extract<acp.SessionConfigOption, { type: "select" }> {
  const option = options.find((item) => item.id === id)
  expect(option, `expected config option ${id}`).toBeTruthy()
  expect(option?.type).toBe("select")
  return option as Extract<acp.SessionConfigOption, { type: "select" }>
}
