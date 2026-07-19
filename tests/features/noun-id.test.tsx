/**
 * @failure Product identifiers hand-roll punctuation and emphasis, so notation
 *   drifts and the meaningful value segment does not pop consistently.
 * @level l2
 * @consumer silvery component consumers
 */
import React from "react"
import { createRenderer } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { Box, formatNounId, NounId, Text } from "../../src/index.js"

describe("NounId", () => {
  test("owns noun#value.revision formatting for numeric and opaque values", () => {
    expect(formatNounId("pr", 875, 1)).toBe("pr#875.1")
    expect(formatNounId("main", 1112)).toBe("main#1112")
    expect(formatNounId("yrd", "019f7942-da71")).toBe("yrd#019f7942-da71")
  })

  test("renders only the value segment bold", () => {
    const app = createRenderer({ cols: 80, rows: 3 })(
      <Box>
        <NounId noun="pr" value={875} revision={1} />
        <Text> </Text>
        <NounId noun="main" value={1112} />
      </Box>,
    )
    try {
      expect(app.text).toContain("pr#875.1 main#1112")
      const row = app.text.split("\n")[0] ?? ""
      const prValue = row.indexOf("875")
      const revision = row.indexOf(".1", prValue)
      const mainValue = row.indexOf("1112")

      expect(app.cell(row.indexOf("pr#"), 0).bold).not.toBe(true)
      expect(app.cell(prValue, 0).bold).toBe(true)
      expect(app.cell(revision, 0).bold).not.toBe(true)
      expect(app.cell(mainValue, 0).bold).toBe(true)
    } finally {
      app.unmount()
    }
  })
})
