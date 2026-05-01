import { describe, expect, test } from "vitest"
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

    expect(session.messages.length).toBeGreaterThan(0)
    expect(session.text).toContain("Implemented both fixes")
    expect(session.text).toContain("list the file directory 3 levels deep")
    expect(session.metadata.transcriptPath).toContain("019ddfc8-0749-7da1-b892-b2e1c6bc389f")
    session.dispose()
  })
})
