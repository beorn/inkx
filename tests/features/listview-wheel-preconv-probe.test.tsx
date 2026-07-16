/**
 * SCRATCH PROBE (21184) — DO NOT LAND. Finds which mount shape keeps
 * ListView's maxRow<=0 across a settled frame so the first wheel is dropped.
 *
 * @failure  probe only — deleted before handoff
 * @level    l1
 * @consumer @km/code/trackpad-wheel-not-scrolling/21184-listview-wheel-preconv
 */
import React, { useRef } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useBoxRect } from "@silvery/ag-react"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

const items = Array.from({ length: 40 }, (_, i) => `item ${i}`)

function list(extra: Record<string, unknown> = {}) {
  return (
    <ListView
      items={items}
      nav
      getKey={(item) => item as string}
      renderItem={(item) => <Text>{item as string}</Text>}
      {...extra}
    />
  )
}

// Shape A: deferred-height wrapper (useBoxRect empty-rect first batch).
function DeferredHeight({ children }: { children: React.ReactNode }) {
  const { ref, height } = useBoxRect()
  return (
    <Box ref={ref} flexGrow={1} flexShrink={1} minHeight={0} flexDirection="column">
      {height > 0 ? <Box height={height}>{children}</Box> : <Text>measuring…</Text>}
    </Box>
  )
}

describe("probe: which shape drops the first wheel", () => {
  test("A: deferred-height wrapper", async () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    const app = render(
      <Box width={40} height={12} flexDirection="column">
        <DeferredHeight>{list()}</DeferredHeight>
      </Box>,
    )
    const before = app.text
    await app.wheel(20, 6, 5)
    console.log(`A: changed=${app.text !== before} before[0]=${JSON.stringify(before.split("\n")[0])} after[0]=${JSON.stringify(app.text.split("\n")[0])}`)
  })

  test("B: measured virtualization, pixel mode — first vs second wheel", async () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    const app = render(
      <Box width={40} height={12} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          {list({ virtualization: "measured", height: 12 })}
        </Box>
      </Box>,
    )
    const before = app.text
    await app.wheel(20, 6, 5)
    const firstChanged = app.text !== before
    const afterFirst = app.text
    await app.wheel(20, 6, 5)
    const secondChanged = app.text !== afterFirst
    throw new Error(`B-RESULT first=${firstChanged} second=${secondChanged} frame0=${JSON.stringify(before.split("\n")[0])}`)
  })

  test("D: wheel during zero-content-rows frame, then rows measure", async () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    function Harness({ measured }: { measured: boolean }) {
      return (
        <Box width={40} height={12} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              getKey={(item) => item as string}
              renderItem={(item) =>
                measured ? <Text>{item as string}</Text> : <Box height={0} />
              }
            />
          </Box>
        </Box>
      )
    }
    const app = render(<Harness measured={false} />)
    const before = app.text
    await app.wheel(20, 6, 5)
    app.rerender(<Harness measured={true} />)
    const after = app.text
    throw new Error(
      `D-RESULT beforeBlank=${before.trim() === ""} topAfter=${JSON.stringify(after.split("\n").find((l) => l.trim() !== "") ?? "")}`,
    )
  })

  test("noop", () => expect(true).toBe(true))
})
