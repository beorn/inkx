import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { Box } from "silvery"
import { SessionPromptComposer } from "../src/components/SessionPromptComposer.tsx"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

function sameRgb(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b
  const left = a as { r?: number; g?: number; b?: number }
  const right = b as { r?: number; g?: number; b?: number }
  return left.r === right.r && left.g === right.g && left.b === right.b
}

describe("SessionPromptComposer", () => {
  test("command box surface changes on hover to show it is clickable", async () => {
    const renderer = createRenderer({ cols: 80, rows: 8 })
    const tree = (
      <Box width={80} height={8} flexDirection="column">
        <SessionPromptComposer
          queueText=""
          onQueueChange={() => {}}
          onQueueSubmit={() => {}}
          inputValue=""
          onInputChange={() => {}}
          onSubmit={() => {}}
          onExit={() => {}}
          focusedRegion="command"
          onFocusRegion={() => {}}
        />
      </Box>
    )
    const app = renderer(tree)
    const before = app.cell(1, 1).bg

    await app.hover(1, 1)
    renderer(tree)
    const after = app.cell(1, 1).bg

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(sameRgb(after, before)).toBe(false)
  })
})
