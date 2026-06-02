import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import {
  getLastOutputPhaseDiagnostics,
  outputPhase,
} from "../../packages/ag-term/src/pipeline/output-phase"

describe("output phase diagnostics", () => {
  test("records first-render diagnostics", () => {
    const next = new TerminalBuffer(8, 3)
    next.setCell(0, 0, { char: "A" })

    outputPhase(null, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toEqual({
      reason: "first-render",
      mode: "fullscreen",
      width: 8,
      height: 3,
      prevWidth: 0,
      prevHeight: 0,
      changedCells: 24,
      rawChangedCells: 24,
      dirtyRows: 3,
    })
  })

  test("records incremental diff diagnostics", () => {
    const prev = new TerminalBuffer(8, 3)
    const next = prev.clone()
    next.setCell(2, 1, { char: "B" })

    outputPhase(prev, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toMatchObject({
      reason: "diff",
      mode: "fullscreen",
      width: 8,
      height: 3,
      prevWidth: 8,
      prevHeight: 3,
      changedCells: 1,
      rawChangedCells: 1,
      dirtyRows: 1,
    })
  })

  test("records dimension-mismatch diagnostics", () => {
    const prev = new TerminalBuffer(8, 3)
    const next = new TerminalBuffer(10, 4)

    outputPhase(prev, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toMatchObject({
      reason: "dimension-mismatch",
      mode: "fullscreen",
      width: 10,
      height: 4,
      prevWidth: 8,
      prevHeight: 3,
      changedCells: 40,
      rawChangedCells: 40,
      dirtyRows: 4,
    })
  })
})
