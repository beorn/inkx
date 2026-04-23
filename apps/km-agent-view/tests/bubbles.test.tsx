import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { claudeSessionConfig } from "@km/logview/configs/claude-session"
import { loadRows } from "@km/logview/parse-jsonl"
import { describe, expect, test } from "vitest"
import { App } from "../src/App.tsx"

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/tiny.jsonl")

/**
 * Bubble alignment — the iMessage-shaped invariant.
 *
 *   USER        → right-aligned (body text near the right edge)
 *   ASSISTANT   → left-aligned  (body text near the left edge)
 *
 * We don't assert exact column (wrap/gutter/pad can shift a cell or two).
 * Instead we compare the USER body's leftmost-non-space column to the
 * ASSISTANT body's leftmost-non-space column: USER must be strictly to
 * the right of ASSISTANT, by more than half the terminal width. That's
 * a robust signal for "it's a right-aligned bubble" regardless of pad.
 */

function leftEdge(line: string): number {
  const m = line.match(/\S/)
  return m ? m.index! : -1
}

describe("km-agent-view bubble alignment", () => {
  test("USER right, ASSISTANT left", async () => {
    const cols = 80
    using term = createTermless({ cols, rows: 24 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(<App path={FIXTURE} title="session" rows={rows} />, term)

    const lines = term.screen.getLines()
    const userLine = lines.find((l) => l.includes("hello world"))
    const assistLine = lines.find((l) => l.includes("greetings"))

    expect(userLine, "USER body line should render").toBeDefined()
    expect(assistLine, "ASSISTANT body line should render").toBeDefined()

    const userEdge = leftEdge(userLine!)
    const assistEdge = leftEdge(assistLine!)

    // ASSISTANT left-edge should be within the first 1/3 of cols.
    expect(assistEdge).toBeGreaterThanOrEqual(0)
    expect(assistEdge).toBeLessThan(Math.floor(cols / 3))

    // USER left-edge should be past the midpoint — that's the right-bubble
    // signature. Not an exact column — bubble width caps shift things —
    // just the "it's on the right half" invariant.
    expect(userEdge).toBeGreaterThan(Math.floor(cols / 2))

    // And USER must be strictly right of ASSISTANT — sanity.
    expect(userEdge).toBeGreaterThan(assistEdge)

    handle.unmount()
  })
})
