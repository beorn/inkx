/**
 * Backend spec: ACP config options.
 *
 * Default mode runs against deterministic fakes. Set
 * `SILVERCODE_BACKEND_CONTRACT=live` to append live backend targets and run
 * the same assertions against installed/credentialed agents.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import {
  ACP_REGISTRY_IDS,
  createAcpAgentBackend,
  createFakeAcpAgentBackend,
  type AcpAgentSession,
  type AgentBackendSpecTarget,
} from "@km/agent-harness"
import {
  agentBackendSpecTargetsForEnv,
  assertConfigOptionRoundTrip,
  runAgentBackendSpec,
} from "@km/agent-harness/testing/backend-spec-runner"

const fakeCodex = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "contract-codex-config" })

function genericConfigOptions(): AcpAgentSession["configOptions"] {
  return [
    {
      type: "select",
      id: "permission_policy",
      name: "Permission Policy",
      category: "mode",
      currentValue: "untrusted",
      options: [
        { value: "untrusted", name: "Untrusted" },
        { value: "on-request", name: "On Request" },
        { value: "never", name: "Never" },
      ],
    },
    {
      type: "boolean",
      id: "web_search",
      name: "Web Search",
      category: "_test",
      currentValue: false,
    },
  ]
}

function currentConfigValue(options: AcpAgentSession["configOptions"], configId: string): string | boolean {
  const option = options.find((item) => item.id === configId)
  if (!option) throw new Error(`missing config option ${configId}`)
  return option.currentValue
}

const targets = agentBackendSpecTargetsForEnv({
  fake: [
    {
      mode: "fake",
      backend: fakeCodex.backend,
      controller: fakeCodex.controller,
      cwd: "/tmp/silvercode-contract",
    },
  ] satisfies AgentBackendSpecTarget[],
  live: [
    {
      mode: "live",
      backend: createAcpAgentBackend("codex"),
      cwd: process.cwd(),
    },
  ] satisfies AgentBackendSpecTarget[],
})

describe("backend spec: config options", () => {
  for (const backendId of ACP_REGISTRY_IDS) {
    test(`fake:${backendId} applies startup ACP session config defaults`, async () => {
      const fake = createFakeAcpAgentBackend(backendId, {
        sessionIdPrefix: `contract-${backendId}-session-config-defaults`,
        configOptions: genericConfigOptions(),
      })

      await using scope = createScope(`test-${backendId}-session-config-defaults`)
      const conn = await fake.backend.connect(scope, {
        cwd: "/tmp/silvercode-contract",
        sessionConfig: {
          permission_policy: "on-request",
          web_search: true,
        },
      })

      const options = fake.controller.getSessionConfigOptions(conn.sessionId)
      expect(currentConfigValue(options, "permission_policy")).toBe("on-request")
      expect(currentConfigValue(options, "web_search")).toBe(true)
    })

    test(`fake:${backendId} generic ACP config changes round-trip`, async () => {
      const fake = createFakeAcpAgentBackend(backendId, {
        sessionIdPrefix: `contract-${backendId}-session-config-roundtrip`,
        configOptions: genericConfigOptions(),
      })

      await using scope = createScope(`test-${backendId}-session-config-roundtrip`)
      const conn = await fake.backend.connect(scope, {
        cwd: "/tmp/silvercode-contract",
      })

      await conn.setSessionConfigOption({ configId: "permission_policy", value: "never" })
      await conn.setSessionConfigOption({ configId: "web_search", type: "boolean", value: true })

      expect(currentConfigValue(conn.configOptions, "permission_policy")).toBe("never")
      expect(currentConfigValue(conn.configOptions, "web_search")).toBe(true)
      expect(currentConfigValue(fake.controller.getSessionConfigOptions(conn.sessionId), "permission_policy")).toBe(
        "never",
      )
      expect(currentConfigValue(fake.controller.getSessionConfigOptions(conn.sessionId), "web_search")).toBe(true)
    })
  }

  test("codex reasoning effort default is applied to the ACP session config", async () => {
    const fake = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "contract-codex-default-reasoning" })

    await using scope = createScope("test-codex-default-reasoning")
    const conn = await fake.backend.connect(scope, {
      cwd: "/tmp/silvercode-contract",
      reasoningEffort: "xhigh",
    })

    expect(
      fake.controller.getSessionConfigOptions(conn.sessionId).find((item) => item.id === "reasoning_effort"),
    ).toMatchObject({
      type: "select",
      currentValue: "xhigh",
    })
  })

  for (const target of targets) {
    test(`${target.mode}:${target.backend.id} reasoning effort round-trips through ACP config options`, async () => {
      await runAgentBackendSpec(target, (ctx) =>
        assertConfigOptionRoundTrip(ctx, {
          configId: "reasoning_effort",
          category: "thought_level",
          initialValue: "medium",
          nextValue: "high",
        }),
      )
    })
  }
})
