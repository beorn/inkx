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

describe("km-agent-view smoke", () => {
  test("mounts and renders the Claude session fixture", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    expect(rows.length).toBeGreaterThan(0)

    const handle = await run(<App path={FIXTURE} title="test session" rows={rows} />, term)

    const text = term.screen.getText()
    // SessionTabs header shows the title.
    expect(text).toContain("test session")
    // Composer placeholder hints at direction.
    expect(text).toContain("Type a message")
    // First user message body.
    expect(text).toContain("hello world")
    // Tool use body.
    expect(text).toContain("ls /tmp")

    handle.unmount()
  })

  test("q exits the app", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(<App path={FIXTURE} title="test session" rows={rows} />, term)
    await handle.press("q")
    await handle.waitUntilExit()
    expect(true).toBe(true)
  })
})
