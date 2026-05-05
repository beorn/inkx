import { describe, expect, test } from "vitest"
import { act } from "react"
import { stripAnsi } from "@silvery/test"
import { renderResumedSession } from "../src/test/render-resumed-session.tsx"

describe("renderResumedSession", () => {
  test("loads a real codex rollout into the transcript renderer without spawning the app", () => {
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 120,
      rows: 200,
      follow: false,
      includeMetadata: false,
    })

    const text = stripAnsi(session.text)
    expect(session.messages.length).toBeGreaterThan(0)
    expect(text).toContain("Implemented both fixes")
    expect(text).toContain("list the file directory 3 levels deep")
    expect(text).toContain("$ npx tsc --noEmit")
    expect(text).not.toContain("I’m rerunning it.\n\n                                    Ran 1 command")
    expect(session.metadata.transcriptPath).toContain("019ddfc8-0749-7da1-b892-b2e1c6bc389f")
    session.dispose()
  })

  test("does not show a large blank top gap after wheel-scrolling a resumed codex transcript", async () => {
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 210,
      rows: 108,
      follow: "end",
      includeMetadata: true,
    })

    await act(async () => {
      for (let i = 0; i < 100; i++) await session.app.wheel(100, 50, -1)
    })

    const textLines = stripAnsi(session.text).split("\n")
    const firstContentRow = textLines.findIndex((line, row) => {
      if (line.trim().length > 0) return true
      for (let col = 0; col < session.cols; col++) {
        if (session.app.cell(col, row).bg !== null) return true
      }
      return false
    })

    expect(firstContentRow, session.text).toBeGreaterThanOrEqual(0)
    expect(firstContentRow, session.text).toBeLessThanOrEqual(1)
    session.dispose()
  })
})
