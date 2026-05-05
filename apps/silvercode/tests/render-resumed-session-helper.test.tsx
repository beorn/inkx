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

  test("renders resumed transcript content at the 143 column blank-screen repro size", () => {
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 143,
      rows: 117,
      follow: "end",
      includeMetadata: true,
      autoRender: true,
    })

    const text = stripAnsi(session.text)
    expect(session.messages.length).toBeGreaterThan(0)
    expect(text).toContain("Session resumed")
    expect(
      text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .at(-1),
      session.text,
    ).toContain("Session resumed")
    expect(text.split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThan(5)
    session.dispose()
  })

  test("does not visibly scroll down after the resumed transcript first appears", async () => {
    const visibleFirstLine = (text: string): string | undefined =>
      stripAnsi(text)
        .split("\n")
        .find((line) => line.trim().length > 0)

    const frames: string[] = []
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 143,
      rows: 117,
      follow: "end",
      includeMetadata: true,
      singlePassLayout: true,
      autoRender: true,
      onFrame: (text) => frames.push(text),
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    const visibleFrames = frames.map(visibleFirstLine).filter((line): line is string => line !== undefined)
    const firstVisible = visibleFrames[0]
    const lastVisible = visibleFrames.at(-1)

    expect(firstVisible, frames.join("\n--- frame ---\n")).toBeDefined()
    expect(lastVisible, frames.join("\n--- frame ---\n")).toBe(firstVisible)
    session.dispose()
  })

  test("keeps resumed transcript content pinned to the top after side-panel-width reflow", async () => {
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 111,
      rows: 117,
      follow: "end",
      includeMetadata: true,
    })

    session.rerender({ cols: 143, rows: 117 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
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
    expect(session.text).toContain("I’m applying the implementation fixes now")
    session.dispose()
  })

  test("keeps resumed transcript content visible after expanding an edit activity", async () => {
    const session = renderResumedSession({
      resume: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
      cols: 143,
      rows: 117,
      follow: "end",
      includeMetadata: true,
      autoRender: true,
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })

    const beforeLines = stripAnsi(session.text).split("\n")
    const summaryRow = beforeLines.findIndex((line) => line.includes("Edited 6 files"))
    expect(summaryRow, session.text).toBeGreaterThanOrEqual(0)
    const summaryCol = beforeLines[summaryRow]!.indexOf("Edited 6 files")

    await act(async () => {
      await session.app.click(summaryCol, summaryRow)
      await new Promise((resolve) => setTimeout(resolve, 160))
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
    expect(session.text).toContain("Edited 6 files")
    session.dispose()
  })
})
