/**
 * Backend spec: ACP config options.
 *
 * Default mode runs against deterministic fakes. Set
 * `SILVERCODE_BACKEND_CONTRACT=live` to append live backend targets and run
 * the same assertions against installed/credentialed agents.
 */

import { describe, test } from "vitest"
import { createAcpAgentBackend, createFakeAcpAgentBackend, type AgentBackendSpecTarget } from "@km/agent-harness"
import {
  agentBackendSpecTargetsForEnv,
  assertConfigOptionRoundTrip,
  runAgentBackendSpec,
} from "@km/agent-harness/testing/backend-spec-runner"

const fakeCodex = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "contract-codex-config" })

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
