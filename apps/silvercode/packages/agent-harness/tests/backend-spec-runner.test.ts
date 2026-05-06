import { describe, expect, test } from "vitest"
import { createAcpAgentBackend, createFakeAcpAgentBackend, createFakeAcpAgentBackends } from "../src/agent-backends.ts"
import {
  agentBackendSpecTargetsForEnv,
  assertConfigOptionRoundTrip,
  assertPromptRoundTrip,
  runAgentBackendSpec,
} from "../src/testing/backend-spec-runner.ts"

describe("agent backend spec runner", () => {
  test("runs fake targets by default, appends live targets behind the live flag, and filters by backend id", () => {
    const fakes = createFakeAcpAgentBackends()
    const targets = {
      fake: [
        { mode: "fake" as const, backend: fakes.backends.get("codex")!, controller: fakes.controllers.get("codex")! },
        {
          mode: "fake" as const,
          backend: fakes.backends.get("gemini")!,
          controller: fakes.controllers.get("gemini")!,
        },
      ],
      live: [
        { mode: "live" as const, backend: createAcpAgentBackend("codex") },
        { mode: "live" as const, backend: createAcpAgentBackend("gemini") },
      ],
    }

    expect(agentBackendSpecTargetsForEnv(targets, {}).map((target) => `${target.mode}:${target.backend.id}`)).toEqual([
      "fake:codex",
      "fake:gemini",
    ])

    expect(
      agentBackendSpecTargetsForEnv(targets, {
        SILVERCODE_BACKEND_CONTRACT: "live",
        SILVERCODE_BACKENDS: "gemini",
      }).map((target) => `${target.mode}:${target.backend.id}`),
    ).toEqual(["fake:gemini", "live:gemini"])
  })

  test("runs prompt specs against a fake backend provider", async () => {
    const fake = createFakeAcpAgentBackend("gemini", { sessionIdPrefix: "spec-gemini" })

    const result = await runAgentBackendSpec(
      {
        mode: "fake",
        backend: fake.backend,
        controller: fake.controller,
        cwd: "/tmp/silvercode-spec",
      },
      (ctx) => assertPromptRoundTrip(ctx, { prompt: "ping" }),
    )

    expect(result.mode).toBe("fake")
    expect(result.backendId).toBe("gemini")
    expect(fake.controller.getSession(result.sessionId)).toMatchObject({ sessionId: "spec-gemini-1" })
  })

  test("runs config-option specs against a fake Codex backend provider", async () => {
    const fake = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "spec-codex" })

    const result = await runAgentBackendSpec(
      {
        mode: "fake",
        backend: fake.backend,
        controller: fake.controller,
        cwd: "/tmp/silvercode-spec",
      },
      (ctx) =>
        assertConfigOptionRoundTrip(ctx, {
          configId: "reasoning_effort",
          category: "thought_level",
          initialValue: "medium",
          nextValue: "xhigh",
        }),
    )

    expect(
      fake.controller.getSessionConfigOptions(result.sessionId).find((item) => item.id === "reasoning_effort"),
    ).toMatchObject({
      type: "select",
      currentValue: "xhigh",
    })
  })
})
