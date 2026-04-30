import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"
import { AmbientEventRow } from "../src/components/AmbientEventRow.tsx"

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))

describe("AmbientEventRow disclosure", () => {
  test("plain one-line notifications are not clickable disclosures", async () => {
    using term = createTermless({ cols: 100, rows: 12 })
    let toggles = 0
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "recall-1",
            source: "recall",
            timestamp: 1_700_000_000_000,
            content: "recall hit: feedback-quiet-tribe-ack — relevance 0.82",
          }}
          onToggleExpand={() => {
            toggles++
          }}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const before = term.screen.getLines()
      const row = before.findIndex((l) => l.includes("feedback-quiet-tribe-ack"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(before.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)

      const col = before[row]!.indexOf("feedback-quiet-tribe-ack")
      await term.mouse.click(col + 1, row)
      await settle(80)

      const after = term.screen.getLines()
      expect(toggles).toBe(0)
      expect(after.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)
      expect(after.filter((l) => l.includes("feedback-quiet-tribe-ack")).length).toBe(1)
    } finally {
      handle.unmount()
    }
  })
})
