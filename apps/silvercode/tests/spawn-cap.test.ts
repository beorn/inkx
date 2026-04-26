/**
 * Spawn hard-cap regression — `spawnSession()` past MAX_LIVE_SESSIONS rejects
 * with an explicit error. This is the in-process safety net replacing the
 * old supervisor pidfile + reaper combo: no cross-launch state, just a
 * runtime ceiling so a runaway loop fails closed instead of fork-bombing.
 *
 * MAX_LIVE_SESSIONS lives in `controller.ts` (8 today). 8 panes is generous
 * for a TUI; bump if a real workflow needs more.
 *
 * Bead: km-silvercode.simplify-supervisor.
 */
import { describe, expect, test } from "vitest"
import { createFakeSession } from "../src/test/fake-session.ts"
import { createSilvercodeController } from "../src/controller.ts"

describe("controller spawn cap", () => {
  test("9th spawn rejects when 8 live sessions exist", async () => {
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-cap-test",
      model: "claude-test",
      track: "claude",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => createFakeSession(),
    })

    // Eight succeed.
    for (let i = 0; i < 8; i++) {
      await controller.spawnSession(`s${i}`)
    }
    expect(controller.snapshot().length).toBe(8)

    // Ninth fails with the explicit message.
    await expect(controller.spawnSession("s9")).rejects.toThrow(/spawn cap reached/)
    expect(controller.snapshot().length).toBe(8)
  })
})
