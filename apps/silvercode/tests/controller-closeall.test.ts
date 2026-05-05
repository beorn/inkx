import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

describe("controller.closeAll", () => {
  test("surfaces synchronous close failures and keeps closing", async () => {
    const good = createFakeSession()
    const bad = createFakeSession()
    bad.close = () => {
      throw new Error("boom during close")
    }
    const spawned = [bad, good]
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-closeall-test",
      bare: true,
      initialSessions: 0,
      disableAmbientAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: () => {
        const next = spawned.shift()
        if (!next) throw new Error("unexpected spawn")
        return next
      },
    })

    const badHandle = await controller.spawnSession("bad")
    const goodHandle = await controller.spawnSession("good")

    expect(() => controller.closeAll()).not.toThrow()
    expect(goodHandle.session.closed).toBe(true)
    expect(badHandle.store.state.get().lastError?.message).toBe("session close failed: boom during close")
  })
})
