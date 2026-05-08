import { describe, expect, test, vi } from "vitest"
import type { SessionId } from "@km/agent-harness"
import { renderScenario } from "../src/test/render-harness.tsx"

describe("App error handling", () => {
  test("session error events panic the app instead of rendering in-screen errors", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      const scenario = await renderScenario({ script: [], autoEmit: false })
      const sessionId = "panic-session" as SessionId

      scenario.emit({
        kind: "error",
        sessionId,
        message: "fatal transport failure",
        ts: Date.now(),
      })

      expect(scenario.app.exitCalled()).toBe(true)
      expect(scenario.app.exitError()?.message).toContain("fatal transport failure")
      scenario.dispose()
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      stderrSpy.mockRestore()
      stdoutSpy.mockRestore()
      infoSpy.mockRestore()
      debugSpy.mockRestore()
    }
  })
})
