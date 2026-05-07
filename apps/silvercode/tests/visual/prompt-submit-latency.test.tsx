import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { createFakeSession } from "../../src/test/fake-session.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"

const COLS = 120
const ROWS = 30

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("prompt submit responsiveness", () => {
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

      await nextTask()
      s.resample()
      expect(fake.sent.length).toBe(before + 1)
      expect(fake.sent[fake.sent.length - 1]).toMatchObject({ type: "user", payload: prompt })
    } finally {
      s.dispose()
    }
  })
})
