import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { SearchProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { App } from "../src/App.tsx"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { loadRows } from "../src/parse-jsonl.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const MATCHES = resolve(HERE, "fixtures/with-matches.jsonl")

/**
 * Cursor position in the status bar reads "<configName> · <cursor>/<total> · <path>".
 * Parse the 1-based cursor index out so tests can assert without caring about
 * other status bits (find/paused suffixes).
 */
function cursorFromStatus(text: string, total: number): number {
  const m = text.match(new RegExp(`·\\s*(\\d+)/${total}\\s*·`))
  if (!m) throw new Error(`no cursor/total marker in status:\n${text.slice(0, 200)}`)
  return Number(m[1])
}

/**
 * DetailPane renders "row #<lineNo> · <kind> · Esc/q to close".
 * Use that sentinel to assert whether we've landed in detail view.
 */
function isInDetailPane(text: string): boolean {
  return text.includes("Esc/q to close")
}

/**
 * Match count suffix in status bar: " · N match" or " · N matches".
 * Returns -1 when the bar isn't showing a match count.
 */
function matchCountFromStatus(text: string): number {
  const m = text.match(/·\s*(\d+)\s+match(?:es)?\b/)
  return m ? Number(m[1]) : -1
}

describe("km-logview search flow", () => {
  test("Enter inside search bar advances to next match — does NOT open detail pane", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MATCHES, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MATCHES} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Open search and type a query that matches multiple rows ("needle one/two/three").
    await handle.press("/")
    await handle.press("n")
    await handle.press("e")
    await handle.press("e")
    await handle.press("d")
    await handle.press("l")
    await handle.press("e")

    expect(term.screen.getText()).toContain("find…")

    // Enter — SearchBindings treats this as "next match". Must NOT also fire
    // ListView's onSelect (which would open the detail pane).
    await handle.press("Enter")
    expect(isInDetailPane(term.screen.getText())).toBe(false)
    // Still in search mode with the bar visible.
    expect(term.screen.getText()).toContain("find…")

    handle.unmount()
  })

  test("n / N cycle matches after Escape closes the search bar", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MATCHES, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MATCHES} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Type a query matching 3 rows.
    await handle.press("/")
    for (const ch of "needle") await handle.press(ch)

    // Close the search bar — matches must persist so `n` / `N` can cycle.
    await handle.press("Escape")
    expect(term.screen.getText()).not.toContain("find…")
    // Status bar surfaces the match count once the bar is closed.
    expect(matchCountFromStatus(term.screen.getText())).toBe(3)

    // Cursor should now track match position. Record cursor before cycling,
    // then cycle forward and back and verify it moved.
    const c0 = cursorFromStatus(term.screen.getText(), rows.length)

    await handle.press("n")
    const c1 = cursorFromStatus(term.screen.getText(), rows.length)
    expect(c1).not.toBe(c0)

    await handle.press("n")
    const c2 = cursorFromStatus(term.screen.getText(), rows.length)
    expect(c2).not.toBe(c1)

    await handle.press("N")
    const c3 = cursorFromStatus(term.screen.getText(), rows.length)
    expect(c3).toBe(c1)

    handle.unmount()
  })

  test("cursor tracks search matches as the user types", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MATCHES, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MATCHES} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Initial cursor is at the last row (follow=true default).
    const initial = cursorFromStatus(term.screen.getText(), rows.length)
    expect(initial).toBe(rows.length)

    // Open search and type "needle" — first match is row 2 (1-based), far
    // above the initial end-of-list cursor. App's cursor must track it.
    await handle.press("/")
    for (const ch of "needle") await handle.press(ch)

    // "needle one" is on line 2 of the fixture (1-based).
    // App's cursor state must update to follow the first match — not stay
    // at end-of-list.
    const afterType = cursorFromStatus(term.screen.getText(), rows.length)
    expect(afterType).toBe(2)

    handle.unmount()
  })
})
