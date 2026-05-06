/**
 * Backend spec: prompt lifecycle.
 *
 * Default mode runs the spec against every provider-injected fake ACP backend.
 * Set `SILVERCODE_BACKEND_CONTRACT=live` to append selected live backends.
 */

import { describe, test } from "vitest"
import {
  ACP_REGISTRY_IDS,
  createAcpAgentBackend,
  createFakeAcpAgentBackends,
  type AgentBackendSpecTarget,
} from "@km/agent-harness"
import {
  agentBackendSpecTargetsForEnv,
  assertPromptRoundTrip,
  runAgentBackendSpec,
} from "@km/agent-harness/testing/backend-spec-runner"

const fakes = createFakeAcpAgentBackends({ sessionIdPrefix: "contract-prompt" })

const targets = agentBackendSpecTargetsForEnv({
  fake: ACP_REGISTRY_IDS.map((id) => ({
    mode: "fake",
    backend: fakes.backends.get(id)!,
    controller: fakes.controllers.get(id)!,
    cwd: "/tmp/silvercode-contract",
  })) satisfies AgentBackendSpecTarget[],
  live: ACP_REGISTRY_IDS.map((id) => ({
    mode: "live",
    backend: createAcpAgentBackend(id),
    cwd: process.cwd(),
  })) satisfies AgentBackendSpecTarget[],
})

describe("backend spec: prompt lifecycle", () => {
  for (const target of targets) {
    test(`${target.mode}:${target.backend.id} settles a text prompt`, async () => {
      await runAgentBackendSpec(target, (ctx) => assertPromptRoundTrip(ctx, { prompt: "ping" }))
    })
  }
})
