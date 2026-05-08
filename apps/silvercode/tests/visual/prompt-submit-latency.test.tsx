import type { AgentEvent, SessionId } from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { createFakeSession } from "../../src/test/fake-session.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"

const COLS = 120
const ROWS = 30

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let restoreConsoleLogs: (() => void) | undefined

beforeEach(() => {
  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
  restoreConsoleLogs = () => {
    debugSpy.mockRestore()
    infoSpy.mockRestore()
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  }
})

afterEach(() => {
  restoreConsoleLogs?.()
  restoreConsoleLogs = undefined
})

function longChat(sessionId: SessionId): AgentEvent[] {
  const events: AgentEvent[] = [
    {
      kind: "session-init",
      sessionId,
      cwd: "/tmp/silvercode-test",
      model: "claude-sonnet-4-6",
      mode: "auto",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "2.1.119",
      apiKeySource: "OAuth",
      ts: 1,
    },
  ]
  for (let index = 0; index < 80; index++) {
    events.push({
      kind: "user-message",
      sessionId,
      turnId: `u${index}` as never,
      text: `prompt ${index} ${"x".repeat(80)}`,
      ts: 10 + index * 2,
    })
    events.push({
      kind: "assistant-message",
      sessionId,
      turnId: `a${index}` as never,
      content: [{ type: "text", text: `answer ${index}\n${"long line ".repeat(80)}` }],
      ts: 11 + index * 2,
    })
  }
  return events
}

describe("prompt submit responsiveness", () => {
  test("typing in the composer does not scale with transcript size", async () => {
    const fake = createFakeSession()
    const s = await renderScenario({
      script: longChat("typing-latency" as SessionId),
      cols: COLS,
      rows: 40,
      fake,
    })

    try {
      const chars = "abcdefghijklmnopqrst"
      const timings: number[] = []
      for (const ch of chars) {
        const startedAt = performance.now()
        await s.app.press(ch)
        timings.push(performance.now() - startedAt)
      }

      const sortedTimings = [...timings].sort((a, b) => a - b)
      const trimmedTimings = sortedTimings.slice(2, -2)
      const trimmedAverage = trimmedTimings.reduce((sum, value) => sum + value, 0) / trimmedTimings.length
      const worst = Math.max(...timings)
      expect(s.text).toContain(chars)
      expect(trimmedAverage, `typing timings: ${timings.map((t) => t.toFixed(1)).join(", ")}`).toBeLessThan(28)
      expect(worst, `typing timings: ${timings.map((t) => t.toFixed(1)).join(", ")}`).toBeLessThan(60)
    } finally {
      s.dispose()
      await nextTask()
    }
  })

  test("Enter clears the composer before dispatching to the backend session", async () => {
    const fake = createFakeSession()
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS, fake })
    const prompt = "latency-order-check"

    try {
      for (const ch of prompt) await s.app.press(ch)
      expect(s.text).toContain(prompt)

      const before = fake.sent.length
      await s.app.press("Enter")

      expect(fake.sent.length).toBe(before)
      expect(s.text).not.toContain(prompt)
      expect(s.lines.find((line) => /^\s*>\s*$/.test(line))).toBeUndefined()

      await nextTask()
      s.resample()
      expect(fake.sent.length).toBe(before + 1)
      expect(fake.sent[fake.sent.length - 1]).toMatchObject({ type: "user", payload: prompt })
    } finally {
      s.dispose()
      await nextTask()
    }
  })
})
