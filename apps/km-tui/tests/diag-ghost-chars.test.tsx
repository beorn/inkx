/**
 * Ghost Character Diagnostic Test (km-inkx.1)
 *
 * Tests rendering correctness at multiple levels:
 * 1. Board driver level (real TUI app) — press() + manual ANSI replay
 * 2. Component level (storybook pattern) — sidebar + content switching
 *
 * The ghost character bug: when content area shrinks, old characters
 * persist at the right edge of lines. This happens in the ANSI diff
 * output, not in the buffer.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { VirtualTerminal, Box, Text, useInput } from "inkx"
import { createRenderer } from "inkx/testing"
import { outputPhase } from "inkx/toolbelt"
import { item } from "./helpers/board-test.ts"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verify ANSI replay correctness between two buffer states.
 * This simulates what a real terminal would display after receiving the diff.
 */
function verifyReplay(
  prevBuffer: ReturnType<ReturnType<typeof createRenderer>["lastBuffer"]>,
  afterBuffer: ReturnType<ReturnType<typeof createRenderer>["lastBuffer"]>,
  label: string,
) {
  if (!prevBuffer || !afterBuffer) return

  const ansiDiff = outputPhase(prevBuffer, afterBuffer)
  const vterm = new VirtualTerminal(afterBuffer.width, afterBuffer.height)
  vterm.loadFromBuffer(prevBuffer)
  vterm.applyAnsi(ansiDiff)

  const mismatches = vterm.compareToBuffer(afterBuffer)
  if (mismatches.length > 0) {
    const details = mismatches
      .slice(0, 10)
      .map(
        (m) =>
          `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
      )
      .join("\n")
    expect.fail(
      `ANSI replay mismatch after ${label}: ${mismatches.length} cells differ:\n${details}`,
    )
  }
}

/**
 * Verify incremental vs fresh render match.
 */
function verifyIncremental(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  label: string,
) {
  const incremental = app.lastBuffer()
  let fresh: ReturnType<typeof app.freshRender> | undefined
  try {
    fresh = app.freshRender()
  } catch {
    return
  }
  if (!incremental || !fresh) return

  for (let y = 0; y < incremental.height; y++) {
    for (let x = 0; x < incremental.width; x++) {
      const incCell = incremental.getCell(x, y)
      const freshCell = fresh.getCell(x, y)
      if (incCell.char !== freshCell.char) {
        expect.fail(
          `Incremental/fresh mismatch after ${label} at (${x},${y}): ` +
            `incremental="${incCell.char}" fresh="${freshCell.char}"`,
        )
      }
    }
  }
}

// =============================================================================
// Part 1: Board Driver Tests (real TUI app)
// =============================================================================

const boardNodes = item.root(
  "board",
  item(
    "Inbox",
    item("Short task"),
    item("A much longer task name that fills up more horizontal space"),
    item("Medium task name"),
  ),
  item(
    "In Progress",
    item("Working on feature X with a long description"),
    item("Bug fix"),
  ),
  item(
    "Done",
    item("Completed task alpha"),
    item("Beta release"),
    item("Gamma"),
  ),
)

function createDiagDriver() {
  return createBoardDriver(createFakeRepo({ nodes: boardNodes }), "board", {
    incremental: true,
    columns: 80,
    rows: 24,
  })
}

/** Press a key and verify both replay and incremental correctness */
function pressAndVerify(
  driver: ReturnType<typeof createBoardDriver>,
  key: string,
) {
  const before = driver.lastBuffer()
  driver.press(key)
  verifyReplay(before, driver.lastBuffer(), `press("${key}")`)
  verifyIncremental(driver, `press("${key}")`)
}

describe("Ghost characters - Board driver (real app)", () => {
  test("basic j/k navigation", () => {
    const driver = createDiagDriver()
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "k")
    pressAndVerify(driver, "j")
  })

  test("column navigation (h/l)", () => {
    const driver = createDiagDriver()
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "k")
  })

  test("view mode switching (v)", () => {
    const driver = createDiagDriver()
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "v")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "v")
    pressAndVerify(driver, "k")
  })

  test("level navigation (zoom in/out)", () => {
    const driver = createDiagDriver()
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "k")
  })

  test("mixed navigation", () => {
    const driver = createDiagDriver()
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "k")
    pressAndVerify(driver, "v")
    pressAndVerify(driver, "j")
    pressAndVerify(driver, "l")
    pressAndVerify(driver, "v")
    pressAndVerify(driver, "h")
    pressAndVerify(driver, "k")
    pressAndVerify(driver, "k")
  })
})

// =============================================================================
// Part 2: Storybook Pattern (sidebar + content switching)
// =============================================================================

const render = createRenderer({ incremental: true, cols: 80, rows: 24 })

describe("Ghost characters - Storybook pattern (sidebar + content switching)", () => {
  test("switching from long content to short content clears old chars", async () => {
    const sections = [
      {
        title: "Rich Text",
        content: [
          "Rich Text Rendering Demo - Very long line content here",
          "  Bold, italic, underline, strikethrough styles",
          "  Colors: red, green, blue, cyan, magenta",
          "  Background colors and dim text applied",
          "  Nested styling with multiple attributes",
        ],
      },
      {
        title: "Tags",
        content: ["Tags Section", "  Simple"],
      },
      {
        title: "Fold Markers",
        content: [
          "Fold Markers Section",
          "  Fold State Indicators",
          "  Marker Constants",
          "  Colored Fold Markers Applied",
        ],
      },
    ]

    function SidebarApp() {
      const [idx, setIdx] = useState(0)
      useInput((input) => {
        if (input === "j")
          setIdx((prev) => Math.min(prev + 1, sections.length - 1))
        if (input === "k") setIdx((prev) => Math.max(prev - 1, 0))
      })

      const section = sections[idx]!
      return (
        <Box flexDirection="row" width={70} height={20}>
          {/* Sidebar */}
          <Box
            flexDirection="column"
            width={20}
            borderStyle="single"
            borderColor="gray"
          >
            <Text bold>Sections</Text>
            {sections.map((s, i) => (
              <Text
                key={s.title}
                backgroundColor={i === idx ? "cyan" : undefined}
                color={i === idx ? "black" : "white"}
              >
                {i === idx ? ">" : " "} {s.title}
              </Text>
            ))}
          </Box>
          {/* Content */}
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {section.content.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<SidebarApp />)
    expect(app.text).toContain("Rich Text Rendering Demo")

    // Long → Short: most likely to cause ghost chars
    const buf0 = app.lastBuffer()
    await app.press("j")
    verifyReplay(buf0, app.lastBuffer(), "Rich Text → Tags")
    verifyIncremental(app, "Rich Text → Tags")
    expect(app.text).toContain("Tags Section")
    expect(app.text).not.toContain("Rich Text Rendering Demo")
    expect(app.text).not.toContain("Background colors")

    // Short → Long
    const buf1 = app.lastBuffer()
    await app.press("j")
    verifyReplay(buf1, app.lastBuffer(), "Tags → Fold Markers")
    verifyIncremental(app, "Tags → Fold Markers")
    expect(app.text).toContain("Fold Markers Section")

    // Long → Short (back)
    const buf2 = app.lastBuffer()
    await app.press("k")
    verifyReplay(buf2, app.lastBuffer(), "Fold Markers → Tags")
    verifyIncremental(app, "Fold Markers → Tags")
    expect(app.text).toContain("Tags Section")
    expect(app.text).not.toContain("Fold Markers Section")
    expect(app.text).not.toContain("Colored Fold Markers")
  })

  test("styled content switching preserves border integrity", async () => {
    function App() {
      const [idx, setIdx] = useState(0)
      useInput((input) => {
        if (input === "j") setIdx(1)
        if (input === "k") setIdx(0)
      })

      return (
        <Box flexDirection="row" width={60} height={10}>
          <Box flexDirection="column" width={15} borderStyle="single">
            <Text>Sidebar</Text>
            <Text>{idx === 0 ? "> A" : "  A"}</Text>
            <Text>{idx === 1 ? "> B" : "  B"}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {idx === 0 ? (
              <>
                <Text color="red">
                  Long colored line that fills the content area
                </Text>
                <Text color="green">
                  Another styled line with green text here
                </Text>
                <Text color="blue">Third line in blue for visual variety</Text>
              </>
            ) : (
              <Text>Short plain text</Text>
            )}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(app.text).toContain("Long colored line")

    // Switch to shorter content — styled text should be fully cleared
    const buf0 = app.lastBuffer()
    await app.press("j")
    verifyReplay(buf0, app.lastBuffer(), "styled long → short")
    verifyIncremental(app, "styled long → short")
    expect(app.text).toContain("Short plain text")
    expect(app.text).not.toContain("Long colored line")
    expect(app.text).not.toContain("green text")
    expect(app.text).not.toContain("blue for visual")

    // Switch back to longer content
    const buf1 = app.lastBuffer()
    await app.press("k")
    verifyReplay(buf1, app.lastBuffer(), "short → styled long")
    verifyIncremental(app, "short → styled long")
    expect(app.text).toContain("Long colored line")
  })
})
