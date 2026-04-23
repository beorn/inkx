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

describe("km-logview smoke", () => {
  test("mounts and renders the Claude session fixture", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    expect(rows.length).toBeGreaterThan(0)

    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Header shows the row count + config name.
    expect(term.screen.getText()).toContain("claude-session")
    expect(term.screen.getText()).toContain(`${rows.length} rows`)

    // First user message body shows up.
    expect(term.screen.getText()).toContain("hello")
    // Tool use should show the command.
    expect(term.screen.getText()).toContain("ls /tmp")

    handle.unmount()
  })

  test("q exits the app", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    await handle.press("q")
    await handle.waitUntilExit()
    // If we reach here, the app exited cleanly.
    expect(true).toBe(true)
  })
})
