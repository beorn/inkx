/**
 * Test: Collapsed column renders at narrow width, not full column width.
 *
 * Tests both the React layout (Box width props) and the actual rendered output
 * (incremental rendering must match fresh rendering).
 */
import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("collapsed column width", () => {
  it("collapsed column via keypress should be narrow (<=5 chars wide)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to col2 and collapse it
    board.press("l").press("c")

    // The collapsed column should exist and be narrow
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  it("collapsed column via collapse=true rule should be narrow (<=5 chars wide)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2 collapse=true", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 80, rows: 24 },
    )

    // col2 should be collapsed from the start
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  it("expanded columns should get more space when sibling is collapsed", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24 },
    )

    // Get col1 width before collapse
    const col1Before = board.q("#col1").boundingBox()
    expect(col1Before).not.toBeNull()

    // Collapse col2
    board.press("l").press("c")

    // Get col1 width after collapse — should be wider
    const col1After = board.q("#col1").boundingBox()
    expect(col1After).not.toBeNull()
    expect(col1After!.width).toBeGreaterThan(col1Before!.width)
  })

  it("incremental render of collapse matches fresh render", () => {
    // Render board and collapse col2 incrementally
    const { board: incrementalBoard } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24, incremental: true },
    )
    incrementalBoard.press("l").press("c")
    const incrementalScreenshot = incrementalBoard.screenshot()

    // Render same board with same collapse, but use fresh (non-incremental) rendering
    const { board: freshBoard } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24, incremental: false },
    )
    freshBoard.press("l").press("c")
    const freshScreenshot = freshBoard.screenshot()

    // Both should produce identical output
    expect(incrementalScreenshot).toBe(freshScreenshot)
  })

  it("incremental render buffer matches fresh render after collapse", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 120, rows: 30, incremental: true },
    )
    board.press("l").press("c")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char || JSON.stringify(a.fg) !== JSON.stringify(b.fg) || JSON.stringify(a.bg) !== JSON.stringify(b.bg) || JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)) {
          expect.fail(
            `Cell mismatch at (${x},${y}): ` +
              `inc={char:${JSON.stringify(a.char)} fg:${JSON.stringify(a.fg)} bg:${JSON.stringify(a.bg)} attrs:${JSON.stringify(a.attrs)}} ` +
              `fresh={char:${JSON.stringify(b.char)} fg:${JSON.stringify(b.fg)} bg:${JSON.stringify(b.bg)} attrs:${JSON.stringify(b.attrs)}}`,
          )
        }
      }
    }
  })

  it("collapsed column cards are not visible in rendered output", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24 },
    )

    // Verify cards are visible before collapse
    const beforeScreenshot = board.screenshot()
    expect(beforeScreenshot).toContain("task-c")
    expect(beforeScreenshot).toContain("task-d")

    // Collapse col2
    board.press("l").press("c")

    // Cards inside collapsed column should NOT be visible
    const afterScreenshot = board.screenshot()
    expect(afterScreenshot).not.toContain("task-c")
    expect(afterScreenshot).not.toContain("task-d")

    // But col1 cards should still be visible
    expect(afterScreenshot).toContain("task-a")
    expect(afterScreenshot).toContain("task-b")
  })
})
