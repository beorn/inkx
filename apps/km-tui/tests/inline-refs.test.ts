/**
 * Regression: km-tui.inline-refs
 *
 * Inline ^caret references (Asana-style numeric block IDs) should be
 * stripped from display text. They appear as "See previous ^1202466275397380"
 * or "talk to Fidelity^1212075048027297" in imported content.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("inline-refs: ^numeric-id stripped from card display", () => {
  test("inline ^ref mid-text is stripped from card title", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("See previous ^1202466275397380 notes"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1202466275397380")
    expect(text).toContain("See previous")
    expect(text).toContain("notes")
  })

  test("^ref at end of title is stripped", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Talk to Fidelity^1212075048027297"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1212075048027297")
    expect(text).toContain("Talk to Fidelity")
  })

  test("^ref followed by URL (no space) strips ID but keeps URL", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Beautiful places ^1209904823302245https://example.com"))),
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1209904823302245")
    expect(text).toContain("Beautiful places")
    expect(text).toContain("https://example.com")
  })

  test("multiple ^refs in same title are all stripped", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("ref ^1202466275397380 and ^1212075048027297 end"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1202466275397380")
    expect(text).not.toContain("^1212075048027297")
    expect(text).toContain("ref")
    expect(text).toContain("end")
  })

  test("short ^refs (not Asana IDs) are preserved", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("value ^42 is good"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("^42")
    expect(text).toContain("value")
    expect(text).toContain("is good")
  })
})
