import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import React from "react"
import { SearchProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { App } from "../src/App.tsx"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { loadRows } from "../src/parse-jsonl.ts"

/**
 * Follow mode — tail -f semantics.
 *
 * Default: follow=true → cursor snaps to the new last row on file growth.
 * After pressing F once: follow=false → cursor stays put when the file grows.
 *
 * fs.watch is real here; we rewrite a tmp fixture file to simulate growth and
 * wait briefly for the App's debounced reload (150ms).
 */

function cursorFromStatus(text: string, total: number): number {
  const m = text.match(new RegExp(`·\\s*(\\d+)/${total}\\s*·`))
  if (!m) throw new Error(`no cursor/total marker in status:\n${text.slice(0, 200)}`)
  return Number(m[1])
}

/** Wait up to `timeoutMs` for predicate to return true, polling every 25ms. */
async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out")
    await new Promise((r) => setTimeout(r, 25))
  }
}

const INITIAL = [
  `{"type":"user","timestamp":"2026-04-23T05:00:00.000Z","message":{"content":"row-1"}}`,
  `{"type":"user","timestamp":"2026-04-23T05:00:01.000Z","message":{"content":"row-2"}}`,
  `{"type":"user","timestamp":"2026-04-23T05:00:02.000Z","message":{"content":"row-3"}}`,
].join("\n")

const GROWN = `${INITIAL}\n${[
  `{"type":"user","timestamp":"2026-04-23T05:00:03.000Z","message":{"content":"row-4"}}`,
  `{"type":"user","timestamp":"2026-04-23T05:00:04.000Z","message":{"content":"row-5"}}`,
].join("\n")}`

describe("km-logview follow mode", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "km-logview-follow-"))
    path = join(dir, "session.jsonl")
    writeFileSync(path, INITIAL)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("follow=true: cursor snaps to the new last row when file grows", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(path, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={path} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Initial: 3 rows, cursor at 3.
    expect(cursorFromStatus(term.screen.getText(), 3)).toBe(3)

    // Grow the file.
    writeFileSync(path, GROWN)
    // The App debounces reload by 150ms + fs.watch async delivery.
    await waitFor(() => term.screen.getText().includes("5/5"), 3000)

    expect(cursorFromStatus(term.screen.getText(), 5)).toBe(5)
    handle.unmount()
  })

  test("follow=false: cursor stays put when file grows", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(path, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={path} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Pause follow (F), then move cursor off the end.
    await handle.press("F")
    await handle.press("g")
    await handle.press("g")
    expect(cursorFromStatus(term.screen.getText(), 3)).toBe(1)
    expect(term.screen.getText()).toContain("paused")

    // Grow the file.
    writeFileSync(path, GROWN)
    // Wait for the total to update.
    await waitFor(() => term.screen.getText().includes("/5"), 3000)

    // Cursor stays where the user left it (row 1), NOT snapped to end.
    expect(cursorFromStatus(term.screen.getText(), 5)).toBe(1)
    handle.unmount()
  })
})
