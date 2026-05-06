/**
 * Backend contract: ACP config options.
 *
 * Default mode runs against deterministic fakes. Set
 * `SILVERCODE_BACKEND_CONTRACT=live` to append live backend targets and run
 * the same assertions against installed/credentialed agents.
 */

import { describe, test } from "vitest"
import {
  acpBackendContractTargetsForEnv,
  assertConfigOptionRoundTrip,
  runAcpBackendContract,
} from "@km/agent-harness/testing/backend-contract-runner"
import { createFakeCodexAcpSpawn } from "@km/agent-harness/testing/fake-acp-server"

const fakeCodex = createFakeCodexAcpSpawn({ sessionIdPrefix: "contract-codex-config" })

const targets = acpBackendContractTargetsForEnv({
  fake: [
    {
      mode: "fake",
      registryId: "codex",
      spawn: fakeCodex.spawn,
      backend: fakeCodex.backend,
      cwd: "/tmp/silvercode-contract",
    },
  ],
  live: [
    {
      mode: "live",
      registryId: "codex",
      cwd: process.cwd(),
    },
  ],
})

describe("backend contract: config options", () => {
  for (const target of targets) {
    test(`${target.mode}:${target.registryId} reasoning effort round-trips through ACP config options`, async () => {
      await runAcpBackendContract(target, (ctx) =>
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
