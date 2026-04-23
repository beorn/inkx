import { test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import React from "react"
import { SearchProvider } from "silvery"
import { App } from "../src/App.tsx"
import type { LogRow, ViewConfig } from "../src/view-config.ts"

const config: ViewConfig = { name: "test", fields: [{ key: "msg", label: "msg" }] } as ViewConfig
const rows: LogRow[] = Array.from({ length: 100 }, (_, i) => ({
  id: `r${i}`,
  lineNo: i + 1,
  kind: "msg",
  fields: { msg: `row ${i.toString().padStart(3, "0")}` },
  raw: { msg: `row ${i.toString().padStart(3, "0")}` },
}))

const getCursor = (text: string): string => text.match(/\b(\d+)\/100\b/)?.[1] ?? "?"

test("wheel scrolls viewport, cursor stays put", async () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(
    <SearchProvider>
      <App path={__filename} config={config} rows={rows} />
    </SearchProvider>,
  )
  // Cursor starts at end (follow mode): 100/100, viewport shows ~rows 080..099.
  expect(getCursor(app.text)).toBe("100")
  expect(app.text).toContain("row 099")

  // Wheel up 10x: viewport must scroll past the initial window so the bottom
  // rows drop out of view. Cursor stays put throughout.
  for (let i = 0; i < 10; i++) await app.wheel(10, 10, -1)
  expect(getCursor(app.text)).toBe("100") // cursor unchanged
  // Viewport should have scrolled up enough that row 099 is off-screen
  expect(app.text).not.toContain("row 099")
  // And earlier rows should now be visible
  expect(app.text).toMatch(/row 0[56]\d/)

  // Keyboard `k` — cursor moves, viewport snaps back to cursor.
  await app.press("k")
  expect(getCursor(app.text)).toBe("99")
  expect(app.text).toContain("row 098") // viewport repositioned to cursor
})
