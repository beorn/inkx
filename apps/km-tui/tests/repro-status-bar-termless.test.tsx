/**
 * Termless regression for km-tui.status-bar-stray-chars — exercises the real
 * StatusCounters component through a real xterm.js emulator.
 *
 * Root cause: `justifyContent="flex-end"` (bottom-bar layout) + any conditional
 * Text in StatusCounters that appears/disappears causes the whole group to
 * shift RIGHT when its total width changes. A wide emoji's continuation cell
 * lands on cells that held stale letters from the prior longer render, and
 * silvery's incremental pipeline doesn't repaint them.
 *
 * Fix (km-tui only): explicit space between emoji and number, plus stable
 * widths for all conditional fragments (padded watcher-suffix, always-present
 * watcher-loading slot) so the group never reflows.
 */
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import { Box } from "@silvery/ag-react"
import { run } from "silvery/runtime"
import "@termless/test/matchers"
import React, { useState, useEffect } from "react"
import { StatusCounters } from "../src/views/CommandBox.tsx"
import type { UIState } from "../src/state/ui-reducer.ts"

function makeUI(overrides: Partial<UIState> = {}): UIState {
  const base = {
    pendingChord: null,
    chordTimedOut: false,
    bellState: null,
    status: null,
    omnibox: null,
    searchReplace: null,
    isLoading: false,
    backgroundParsing: false,
    loadingStartTime: null,
    terminalFocused: true,
    watcherStatus: null,
  } as unknown as UIState
  return { ...base, ...overrides } as UIState
}

describe("termless regression: status bar stray chars (km-tui.status-bar-stray-chars)", () => {
  test("watcher starting → idle: no stray letters after wide emoji", async () => {
    using term = createTermless({ cols: 80, rows: 3 })
    function App() {
      const [state, setState] = useState<"starting" | "idle">("starting")
      useEffect(() => {
        setTimeout(() => setState("idle"), 10)
      }, [])
      const ui = makeUI({
        watcherStatus: { state, pendingPaths: 0, watchedPaths: 4 },
      } as Partial<UIState>)
      return (
        <Box flexDirection="row" flexShrink={0} height={1} justifyContent="flex-end" paddingX={1}>
          <StatusCounters ui={ui} storageMode="disk" rootPath="/tmp/vault" nodeCount={1} />
        </Box>
      )
    }
    const handle = await run(<App />, term)
    await new Promise((r) => setTimeout(r, 150))
    const screen = term.screen!.getText()
    expect(screen).not.toMatch(/📋[A-Za-z:]/)
    expect(screen).not.toMatch(/📄[A-Za-z:]/)
    expect(screen).not.toContain("starting")
    handle.unmount()
  })

  test("watcher syncing → idle: no stray letters after wide emoji", async () => {
    using term = createTermless({ cols: 80, rows: 3 })
    function App() {
      const [pending, setPending] = useState(2)
      useEffect(() => {
        setTimeout(() => setPending(0), 10)
      }, [])
      const state: "syncing" | "idle" = pending > 0 ? "syncing" : "idle"
      const ui = makeUI({
        watcherStatus: { state, pendingPaths: pending, watchedPaths: 3 },
      } as Partial<UIState>)
      return (
        <Box flexDirection="row" flexShrink={0} height={1} justifyContent="flex-end" paddingX={1}>
          <StatusCounters ui={ui} storageMode="disk" rootPath="/tmp/vault" nodeCount={3} />
        </Box>
      )
    }
    const handle = await run(<App />, term)
    await new Promise((r) => setTimeout(r, 150))
    const screen = term.screen!.getText()
    expect(screen).not.toMatch(/📋[A-Za-z:]/)
    expect(screen).not.toMatch(/📄[A-Za-z:]/)
    expect(screen).not.toContain("sync:")
    handle.unmount()
  })

  test("isLoading toggle: no stray letters after wide emoji", async () => {
    using term = createTermless({ cols: 80, rows: 3 })
    function App() {
      const [isLoading, setIsLoading] = useState(true)
      useEffect(() => {
        setTimeout(() => setIsLoading(false), 10)
      }, [])
      const ui = makeUI({
        isLoading,
        watcherStatus: { state: "idle", pendingPaths: 0, watchedPaths: 4 },
      } as Partial<UIState>)
      return (
        <Box flexDirection="row" flexShrink={0} height={1} justifyContent="flex-end" paddingX={1}>
          <StatusCounters ui={ui} storageMode="disk" rootPath="/tmp/vault" nodeCount={1} />
        </Box>
      )
    }
    const handle = await run(<App />, term)
    await new Promise((r) => setTimeout(r, 150))
    const screen = term.screen!.getText()
    expect(screen).not.toMatch(/📋[A-Za-z:]/)
    expect(screen).not.toMatch(/📄[A-Za-z:]/)
    handle.unmount()
  })

  test("console-indicator toggle: no stray letters after wide emoji", async () => {
    using term = createTermless({ cols: 80, rows: 3 })
    function App() {
      const [logs, setLogs] = useState(0)
      useEffect(() => {
        setTimeout(() => setLogs(3), 10)
      }, [])
      const ui = makeUI({
        watcherStatus: { state: "idle", pendingPaths: 0, watchedPaths: 4 },
      } as Partial<UIState>)
      return (
        <Box flexDirection="row" flexShrink={0} height={1} justifyContent="flex-end" paddingX={1}>
          <StatusCounters
            ui={ui}
            storageMode="disk"
            rootPath="/tmp/vault"
            nodeCount={1}
            consoleStats={{ total: logs, errors: 0, warnings: 0 }}
          />
        </Box>
      )
    }
    const handle = await run(<App />, term)
    await new Promise((r) => setTimeout(r, 150))
    const screen = term.screen!.getText()
    expect(screen).not.toMatch(/📋[A-Za-z:]/)
    expect(screen).not.toMatch(/📄[A-Za-z:]/)
    handle.unmount()
  })
})
