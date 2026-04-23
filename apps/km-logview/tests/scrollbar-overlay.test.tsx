import { test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import React from "react"
import { SearchProvider } from "silvery"
import { App } from "../src/App.tsx"
import type { LogRow, ViewConfig } from "../src/view-config.ts"

const config: ViewConfig = { name: "test", fields: [{ key: "msg", label: "msg" }] } as ViewConfig
const rows: LogRow[] = Array.from({ length: 200 }, (_, i) => ({
  id: `r${i}`,
  lineNo: i + 1,
  kind: "msg",
  fields: { msg: `row ${i.toString().padStart(3, "0")}` },
  raw: { msg: `row ${i.toString().padStart(3, "0")}` },
}))

// Scrollbar thumb = one or more cells with the $muted background in the
// rightmost column of the list region. Check for consecutive non-default-bg
// cells in column width-1, rows inside the list.
function rightColumnThumbRows(app: ReturnType<ReturnType<typeof createRenderer>>): number {
  const lastCol = app.width - 1
  let count = 0
  for (let r = 0; r < app.height; r++) {
    const cell = app.cell(lastCol, r)
    // $muted is theme-resolved — we just need "has a non-default bg", not a
    // specific color. Default bg is undefined/transparent in termless.
    if (cell.bg !== undefined && cell.bg !== null) count++
  }
  return count
}

test("scrollbar appears on wheel and hides when idle", async () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(
    <SearchProvider>
      <App path={__filename} config={config} rows={rows} />
    </SearchProvider>,
  )
  // Idle at start — scrollbar should not be visible. Status bar has a bg
  // but it's in row 0, not the rightmost column by itself. Safer assertion:
  // rightmost column has no contiguous bg run of ≥2 rows when idle.
  const idleThumbRows = rightColumnThumbRows(app)
  // Trigger a wheel event — scrollbar should flash on.
  await app.wheel(10, 10, -1)
  const activeThumbRows = rightColumnThumbRows(app)
  expect(activeThumbRows).toBeGreaterThan(idleThumbRows)
})
