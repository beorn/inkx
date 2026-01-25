/**
 * StatusBar Acceptance Tests - Status message display
 *
 * Tests the StatusBar component's rendering behavior with different
 * status levels and message lengths.
 */
import { describe, test, expect } from "bun:test"
import React from "react"
import { createTestRenderer, createLocator } from "inkx/testing"
import { StatusBar } from "../src/views/StatusBar.tsx"
import { createInitialUIState } from "../src/ui-reducer.ts"
import type { UIState } from "../src/ui-reducer.ts"

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

  const render = createTestRenderer({ columns: termWidth, rows: 24 })
  const result = render(React.createElement(StatusBar, { ui, termWidth }))

  return {
    result,
    locator: createLocator(result.getContainer()),
    screenshot: () => result.lastFrameText() ?? "",
  }
}

describe("StatusBar", () => {
  test("not rendered when status is null", () => {
    const { screenshot } = renderStatusBar(null)

    // Should not render anything
    const text = screenshot()
    expect(text.trim()).toBe("")
  })

  test("info level - renders message", () => {
    const { screenshot } = renderStatusBar({
      level: "info",
      message: "Test info message",
    })

    const text = screenshot()
    expect(text).toContain("Test info message")
    // Icon may not render as unicode in test output, but message should be there
  })

  test("success level - renders message", () => {
    const { screenshot } = renderStatusBar({
      level: "success",
      message: "Test success message",
    })

    const text = screenshot()
    expect(text).toContain("Test success message")
  })

  test("warning level - renders message", () => {
    const { screenshot } = renderStatusBar({
      level: "warning",
      message: "Test warning message",
    })

    const text = screenshot()
    expect(text).toContain("Test warning message")
  })

  test("error level - renders message", () => {
    const { screenshot } = renderStatusBar({
      level: "error",
      message: "Test error message",
    })

    const text = screenshot()
    expect(text).toContain("Test error message")
  })

  test("message displayed correctly", () => {
    const { screenshot } = renderStatusBar({
      level: "info",
      message: "Exact message to verify",
    })

    const text = screenshot()
    expect(text).toContain("Exact message to verify")
  })

  test("message truncates with ellipsis when too long", () => {
    const longMessage = "A".repeat(100) // 100 chars, way longer than terminal width
    const { screenshot } = renderStatusBar(
      {
        level: "info",
        message: longMessage,
      },
      40, // Small terminal width
    )

    const text = screenshot()
    // Message should be truncated with ellipsis
    expect(text).toContain("…")
    // Should not contain the full message
    expect(text).not.toContain("A".repeat(100))
    // Message should fit within terminal (approx 40 - 4 for icon/padding)
    const lines = text.split("\n")
    const statusLine = lines.find((line) => line.includes("ℹ"))
    if (statusLine) {
      // Strip ANSI codes for accurate length check
      const cleanLine = statusLine.replace(/\x1b\[[0-9;]*m/g, "")
      expect(cleanLine.length).toBeLessThanOrEqual(40)
    }
  })

  test("message not truncated when fits within terminal width", () => {
    const message = "Short message"
    const { screenshot } = renderStatusBar(
      {
        level: "info",
        message,
      },
      80, // Wide terminal
    )

    const text = screenshot()
    expect(text).toContain(message)
    expect(text).not.toContain("…") // No truncation needed
  })

  test("truncation boundary - exactly at limit", () => {
    // termWidth=40, maxMessageLength=36 (40-4), so 36 char message should not truncate
    const exactMessage = "A".repeat(36)
    const { screenshot } = renderStatusBar(
      {
        level: "info",
        message: exactMessage,
      },
      40,
    )

    const text = screenshot()
    expect(text).toContain(exactMessage)
    expect(text).not.toContain("…")
  })

  test("truncation boundary - one char over limit", () => {
    // termWidth=40, maxMessageLength=36 (40-4), so 37 char message should truncate
    const overMessage = "A".repeat(37)
    const { screenshot } = renderStatusBar(
      {
        level: "info",
        message: overMessage,
      },
      40,
    )

    const text = screenshot()
    expect(text).toContain("…")
    expect(text).not.toContain("A".repeat(37))
  })
})
