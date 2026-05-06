/**
 * Tests for the shared backend contract runner.
 *
 * The runner exists so each backend behavior can be asserted once and then
 * executed against fake backends by default, plus live backends when explicitly
 * enabled by the caller's environment.
 */

import { describe, expect, test } from "vitest"
import {
  acpBackendContractTargetsForEnv,
  assertConfigOptionRoundTrip,
  runAcpBackendContract,
} from "../src/testing/backend-contract-runner.ts"
import { createFakeCodexAcpSpawn } from "../src/testing/fake-acp-server.ts"

describe("backend contract runner", () => {
  test("uses fake targets by default and adds live targets only behind the live flag", () => {
    const fake = createFakeCodexAcpSpawn()
    const fakeTarget = { mode: "fake" as const, registryId: "codex" as const, spawn: fake.spawn }
    const liveTarget = { mode: "live" as const, registryId: "codex" as const }

    expect(
      acpBackendContractTargetsForEnv(
        {
          fake: [fakeTarget],
          live: [liveTarget],
        },
        {},
      ).map((target) => target.mode),
    ).toEqual(["fake"])

    expect(
      acpBackendContractTargetsForEnv(
        {
          fake: [fakeTarget],
          live: [liveTarget],
        },
        { SILVERCODE_BACKEND_CONTRACT: "live" },
      ).map((target) => target.mode),
    ).toEqual(["fake", "live"])
  })

  test("runs the config-option round-trip assertion against a fake Codex target", async () => {
    const fake = createFakeCodexAcpSpawn({ sessionIdPrefix: "contract-codex" })

    const result = await runAcpBackendContract(
      {
        mode: "fake",
        registryId: "codex",
        spawn: fake.spawn,
        backend: fake.backend,
        cwd: "/tmp/silvercode-contract",
      },
      (ctx) =>
        assertConfigOptionRoundTrip(ctx, {
          configId: "reasoning_effort",
          category: "thought_level",
          initialValue: "medium",
          nextValue: "xhigh",
        }),
    )

    expect(result.mode).toBe("fake")
    expect(result.registryId).toBe("codex")
    expect(
      fake.backend.getSessionConfigOptions(result.sessionId).find((item) => item.id === "reasoning_effort"),
    ).toMatchObject({
      type: "select",
      currentValue: "xhigh",
    })
  })
})
