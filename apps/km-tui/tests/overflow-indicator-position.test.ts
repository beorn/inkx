/**
 * Test: overflow indicator positioning in board columns
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("overflow indicator position in board columns", () => {
  test("▼ indicator is adjacent to last card, dump for debugging", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 50,
    })

    const text = board.screenshot()
    const lines = text.split("\n")

    // Dump all lines with row numbers for analysis
    const dump: string[] = []
    let indicatorRow = -1
    let lastCardBorderRow = -1
    let lastCardContentRow = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || ""
      const flags: string[] = []
      if (line.includes("▼")) {
        indicatorRow = i
        flags.push("<<< ▼ INDICATOR")
      }
      if (line.includes("▲")) flags.push("<<< ▲ INDICATOR")
      if (/card-\d+/.test(line)) {
        lastCardContentRow = i
        flags.push("<<< CARD CONTENT")
      }
      if (line.includes("╰")) {
        lastCardBorderRow = i
        flags.push("<<< CARD BORDER BOTTOM")
      }
      if (line.includes("╭")) flags.push("<<< CARD BORDER TOP")
      if (line.includes("─".repeat(10))) flags.push("<<< SEPARATOR")
      dump.push(`${String(i).padStart(2)}: ${line}  ${flags.join(" ")}`)
    }

    const gap = indicatorRow - lastCardBorderRow

    // Fail with full dump
    expect({ indicatorRow, lastCardBorderRow, lastCardContentRow, gap, dump: "\n" + dump.join("\n") }).toEqual(
      expect.objectContaining({ gap: 1 }),
    )
  })
})
