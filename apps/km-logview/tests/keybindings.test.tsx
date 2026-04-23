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
const MANY = resolve(HERE, "fixtures/many-rows.jsonl")
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

describe("km-logview keybindings", () => {
  test("j / k move cursor by 1", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // App starts with cursor at the last row (follow=true default).
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length)

    await handle.press("k")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length - 1)

    await handle.press("k")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length - 2)

    await handle.press("j")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length - 1)

    handle.unmount()
  })

  test("ArrowUp / ArrowDown are equivalent to k / j", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    const start = cursorFromStatus(term.screen.getText(), rows.length)

    await handle.press("ArrowUp")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(start - 1)

    await handle.press("ArrowDown")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(start)

    handle.unmount()
  })

  test("G jumps to the last row", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Move up a few rows, then G should jump back to the end.
    await handle.press("k")
    await handle.press("k")
    await handle.press("k")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length - 3)

    await handle.press("G")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length)

    handle.unmount()
  })

  test("gg jumps to the first row (two g's within 1s)", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(rows.length)

    // Two g's in rapid succession — the 1s chord window is trivially satisfied.
    await handle.press("g")
    await handle.press("g")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(1)

    handle.unmount()
  })

  test("Space pages down, b pages up", async () => {
    // Use a small visible viewport so a single page step is small.
    using term = createTermless({ cols: 120, rows: 10 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Go to row 1 via gg.
    await handle.press("g")
    await handle.press("g")
    expect(cursorFromStatus(term.screen.getText(), rows.length)).toBe(1)

    // Space: cursor += (listHeight - 1). listHeight = max(5, rows - 1) = 9.
    // Pages are "up to" — clamp is inside, we just assert cursor > 1 and <= total.
    await handle.press("Space")
    const afterSpace = cursorFromStatus(term.screen.getText(), rows.length)
    expect(afterSpace).toBeGreaterThan(1)

    await handle.press("b")
    const afterB = cursorFromStatus(term.screen.getText(), rows.length)
    expect(afterB).toBeLessThan(afterSpace)

    handle.unmount()
  })

  test("/ opens the search bar", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Before: no search bar.
    expect(term.screen.getText()).not.toContain("find…")

    await handle.press("/")
    // SearchBar renders ` / <query> ` — when open but empty, the slash is there.
    expect(term.screen.getText()).toContain("/")
    // Status bar should gain the "find…" suffix while search is active.
    expect(term.screen.getText()).toContain("find…")

    handle.unmount()
  })

  // NOTE: n/N cycle test omitted — the shipped App has an architectural
  // mismatch between SearchProvider (scrollTo-based) and the cursor-based App
  // state. search.next()/prev() don't move the App's cursor, and Escape
  // clears matches, so `n`/`N` are effectively dead keys. Reported back to
  // the parent session instead of codifying broken UX.

  test("F toggles follow mode — status shows paused when off", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Default: follow=true, no paused marker.
    expect(term.screen.getText()).not.toContain("paused")

    await handle.press("F")
    // Note: the source emits U+23F8 (⏸) but xterm.js normalizes to the
    // emoji-presentation form (U+23F8 U+FE0F). Match the word instead.
    expect(term.screen.getText()).toContain("paused")

    await handle.press("F")
    expect(term.screen.getText()).not.toContain("paused")

    handle.unmount()
  })

  test("q exits cleanly", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MANY, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MANY} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    await handle.press("q")
    await handle.waitUntilExit()
    // If waitUntilExit resolved, exit was clean.
    expect(true).toBe(true)
  })
})
