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

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/tiny.jsonl")

describe("km-logview color emission", () => {
  test("at least one cell in the status bar has a non-default fg or bg", async () => {
    using term = createTermless({ cols: 120, rows: 24 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Scan the rendered buffer — if ANY cell has a non-null fg or bg, colors
    // are being emitted. The App uses $bg-muted on the status bar and various
    // $fg-* tokens on kind labels.
    const distinctFg = new Set<string>()
    const distinctBg = new Set<string>()
    let coloredCount = 0
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 120; col++) {
        const c = term.cell(row, col)
        if (c.fg !== null || c.bg !== null || c.bold) coloredCount++
        if (c.fg) distinctFg.add(JSON.stringify(c.fg))
        if (c.bg) distinctBg.add(JSON.stringify(c.bg))
      }
    }
    // Write diagnostic to a file (stderr would fail vitest setup).
    const fs = await import("node:fs")
    fs.writeFileSync(
      "/tmp/km-logview-colors.txt",
      [
        `coloredCount=${coloredCount}`,
        `distinct fg (${distinctFg.size}): ${Array.from(distinctFg).join(", ")}`,
        `distinct bg (${distinctBg.size}): ${Array.from(distinctBg).join(", ")}`,
      ].join("\n"),
    )
    expect(distinctFg.size + distinctBg.size).toBeGreaterThan(2)
    handle.unmount()
  })
})
