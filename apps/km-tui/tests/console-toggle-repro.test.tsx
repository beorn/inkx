/**
 * Console toggle termless test — verifies what the end user sees.
 * Checks all 3 layers: screen content, terminal mode, and app state.
 *
 * Bead: km-tui.console-toggle-broken
 */

import React, { useEffect, useState } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run, useInput, type RunHandle } from "silvery/runtime"
import { useRuntime } from "silvery"
import { Box, Text } from "silvery"

let appState = { consoleOpen: false }

/** Minimal app simulating console toggle via runtime.pause/resume */
function ConsoleToggleApp() {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const runtime = useRuntime()
  appState.consoleOpen = consoleOpen

  useInput((input) => {
    if (input === "`") setConsoleOpen((prev) => !prev)
    if (input === "q") return "exit"
  })

  useEffect(() => {
    if (!consoleOpen) return
    // Leave alt screen via runtime pause (same pattern as real km app)
    runtime?.pause?.()
    return () => {
      // Re-enter alt screen via runtime resume
      runtime?.resume?.()
    }
  }, [consoleOpen])

  return (
    <Box>
      <Text>{consoleOpen ? "CONSOLE MODE" : "BOARD VIEW"}</Text>
    </Box>
  )
}

describe("console toggle — termless", () => {
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
    appState = { consoleOpen: false }
  })

  test("initial: board on alt screen", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<ConsoleToggleApp />, term, { alternateScreen: true })

    // Content: board visible
    expect(term.screen).toContainText("BOARD VIEW")
    // Terminal: in alt screen mode
    expect(term).toBeInMode("altScreen")
    // App state: console closed
    expect(appState.consoleOpen).toBe(false)
  })

  test("backtick: leaves alt screen", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<ConsoleToggleApp />, term, { alternateScreen: true })

    await handle.press("`")

    // Terminal: should have left alt screen
    expect(term).not.toBeInMode("altScreen")
    // App state: console open
    expect(appState.consoleOpen).toBe(true)
  })

  test("second backtick: re-enters alt screen, board restored", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<ConsoleToggleApp />, term, { alternateScreen: true })

    await handle.press("`") // open console
    await handle.press("`") // close console

    // Terminal: back in alt screen
    expect(term).toBeInMode("altScreen")
    // Content: board visible again
    expect(term.screen).toContainText("BOARD VIEW")
    // App state: console closed
    expect(appState.consoleOpen).toBe(false)
  })
})
