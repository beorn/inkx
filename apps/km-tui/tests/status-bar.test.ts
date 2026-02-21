/**
 * StatusBar Acceptance Tests - Status message display
 *
 * Tests the StatusBar component's rendering behavior with different
 * status levels and message lengths.
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { StatusBar } from "../src/views/StatusBar.tsx"
import { createInitialUIState } from "../src/ui-reducer.ts"
import type { UIState } from "../src/ui-reducer.ts"
import { testEnv, item } from "./helpers/board-test.ts"

// Module-level renderers (created once, reused across tests)
const render80 = createRenderer({ cols: 80, rows: 24 })
const render40 = createRenderer({ cols: 40, rows: 24 })

/**
 * Helper to render StatusBar with custom UI state
 */
function renderStatusBar(
  statusConfig: {
    level: "info" | "success" | "warning" | "error"
    message: string
  } | null,
  termWidth = 80,
) {
  const ui: UIState = {
    ...createInitialUIState("cards", [], { columns: termWidth, rows: 24 }),
    status: statusConfig,
  }

  const render = termWidth === 40 ? render40 : render80
  return render(React.createElement(StatusBar, { ui, termWidth }))
}

describe("StatusBar", () => {
  test("not rendered when status is null", () => {
    const app = renderStatusBar(null)

    // Should not render anything
    expect(app.text.trim()).toBe("")
  })

  test("info level - renders message", () => {
    const app = renderStatusBar({
      level: "info",
      message: "Test info message",
    })

    expect(app.text).toContain("Test info message")
    // Icon may not render as unicode in test output, but message should be there
  })

  test("success level - renders message", () => {
    const app = renderStatusBar({
      level: "success",
      message: "Test success message",
    })

    expect(app.text).toContain("Test success message")
  })

  test("warning level - renders message", () => {
    const app = renderStatusBar({
      level: "warning",
      message: "Test warning message",
    })

    expect(app.text).toContain("Test warning message")
  })

  test("error level - renders message", () => {
    const app = renderStatusBar({
      level: "error",
      message: "Test error message",
    })

    expect(app.text).toContain("Test error message")
  })

  test("message displayed correctly", () => {
    const app = renderStatusBar({
      level: "info",
      message: "Exact message to verify",
    })

    expect(app.text).toContain("Exact message to verify")
  })

  test("message truncates with ellipsis when too long", () => {
    const longMessage = "A".repeat(100) // 100 chars, way longer than terminal width
    const app = renderStatusBar(
      {
        level: "info",
        message: longMessage,
      },
      40, // Small terminal width
    )

    // Message should be truncated with ellipsis
    expect(app.text).toContain("⋯")
    // Should not contain the full message
    expect(app.text).not.toContain("A".repeat(100))
    // Message should fit within terminal (approx 40 - 4 for icon/padding)
    const lines = app.text.split("\n")
    const statusLine = lines.find((line) => line.includes("ℹ"))
    if (statusLine) {
      // Strip ANSI codes for accurate length check
      const cleanLine = statusLine.replace(/\x1b\[[0-9;]*m/g, "")
      expect(cleanLine.length).toBeLessThanOrEqual(40)
    }
  })

  test("message not truncated when fits within terminal width", () => {
    const message = "Short message"
    const app = renderStatusBar(
      {
        level: "info",
        message,
      },
      80, // Wide terminal
    )

    expect(app.text).toContain(message)
    expect(app.text).not.toContain("⋯") // No truncation needed
  })

  test("truncation boundary - exactly at limit", () => {
    // termWidth=40, maxMessageLength=36 (40-4), so 36 char message should not truncate
    const exactMessage = "A".repeat(36)
    const app = renderStatusBar(
      {
        level: "info",
        message: exactMessage,
      },
      40,
    )

    expect(app.text).toContain(exactMessage)
    expect(app.text).not.toContain("⋯")
  })

  test("truncation boundary - one char over limit", () => {
    // termWidth=40, maxMessageLength=36 (40-4), so 37 char message should truncate
    const overMessage = "A".repeat(37)
    const app = renderStatusBar(
      {
        level: "info",
        message: overMessage,
      },
      40,
    )

    expect(app.text).toContain("⋯")
    expect(app.text).not.toContain("A".repeat(37))
  })
})

// =============================================================================
// Bottom bar VIEW indicator
// =============================================================================

describe("Bottom bar VIEW indicator", () => {
  test("shows CARDS VIEW on startup", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    const text = env.board.screenshot()
    expect(text).toContain("CARDS VIEW")
  })

  test("shows other VIEW after pressing v", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    env.board.press("g").press("v") // Switch view mode (g.v chord)
    const text = env.board.screenshot()
    // Could be LIST, COLUMNS, or TABS
    expect(text).toMatch(/(LIST|COLUMNS|TABS) VIEW/)
  })
})
