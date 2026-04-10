/**
 * Ghost Character Diagnostic Test (km-silvery.1)
 *
 * Key insight: a real terminal accumulates ALL ANSI diffs from startup.
 * Pairwise replay (prev→next) might pass while cumulative replay diverges.
 *
 * This test maintains a RUNNING VirtualTerminal across all navigations,
 * applying each diff sequentially — exactly like a real terminal would.
 * After each step, it compares the terminal state to the buffer.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { VirtualTerminal, Box, Text, useInput } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { outputPhase } from "@silvery/ag-term/toolbelt"
import { item } from "./helpers/board-test.ts"
import type { TerminalBuffer } from "@silvery/ag-term"

// =============================================================================
// Running Terminal — simulates what a real terminal accumulates
// =============================================================================

/**
 * A running terminal that accumulates ANSI diffs, exactly like a real terminal.
 * After each step, compare its state to the expected buffer.
 */
function createRunningTerminal(width: number, height: number) {
  const vterm = new VirtualTerminal(width, height)
  let prevBuffer: TerminalBuffer | null = null
  let stepCount = 0

  return {
    /**
     * Feed the current buffer. Computes diff from previous buffer,
     * applies it to the running VirtualTerminal, then compares.
     */
    update(buffer: TerminalBuffer, label: string) {
      const ansiDiff = outputPhase(prevBuffer, buffer)
      vterm.applyAnsi(ansiDiff)
      prevBuffer = buffer
      stepCount++

      // Compare running terminal state to expected buffer
      const mismatches = vterm.compareToBuffer(buffer)
      if (mismatches.length > 0) {
        const details = mismatches
          .slice(0, 15)
          .map((m) => `  (${m.x},${m.y}): buffer="${m.expected}" terminal="${m.actual}"`)
          .join("\n")
        expect.fail(
          `GHOST CHARS after step ${stepCount} (${label}):\n` +
            `  ${mismatches.length} cells differ between buffer and terminal:\n` +
            details +
            (mismatches.length > 15 ? `\n  ... and ${mismatches.length - 15} more` : ""),
        )
      }
    },
    get steps() {
      return stepCount
    },
  }
}

// =============================================================================
// Storybook pattern: sidebar + content sections of different sizes
// =============================================================================

const sections = [
  {
    title: "Rich Text",
    lines: [
      "Rich Text Rendering Demo - Very long line of content here!",
      "  Bold, italic, underline, strikethrough styling applied",
      "  Colors: red, green, blue, cyan, magenta, yellow",
      "  Background colors and dim text for contrast",
      "  Nested styling with multiple attributes combined",
    ],
  },
  {
    title: "Tags",
    lines: ["Tag Pills", "  Simple two-line section"],
  },
  {
    title: "Fold Markers",
    lines: [
      "Fold Markers (Cards Style)",
      "  Fold State Indicators",
      "  Marker Constants Applied",
      "  Colored Fold Markers for Visual Variety",
    ],
  },
  {
    title: "Layout",
    lines: [
      "Layout Helpers",
      "  wrapText with long lines for testing truncation behavior",
      "  padText and constrainText utilities",
    ],
  },
  {
    title: "Views",
    lines: ["Board Views", "  Cards, Columns, List, Tabs"],
  },
]

function StorybookApp() {
  const [idx, setIdx] = useState(0)
  useInput((input) => {
    if (input === "j") {
      setIdx((prev) => Math.min(prev + 1, sections.length - 1))
    }
    if (input === "k") setIdx((prev) => Math.max(prev - 1, 0))
  })

  const section = sections[idx]!
  return (
    <Box flexDirection="row" width={70} height={20}>
      <Box flexDirection="column" width={20} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="yellow">
          Sections
        </Text>
        {sections.map((s, i) => (
          <Text key={s.title} backgroundColor={i === idx ? "cyan" : undefined} color={i === idx ? "black" : "white"}>
            {i === idx ? "▸" : " "} {s.title}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {section.lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  )
}

describe("Ghost characters — cumulative terminal replay", () => {
  test("storybook: navigate all sections down then back up", async () => {
    const render = createRenderer({ incremental: true, cols: 80, rows: 24 })
    const app = render(<StorybookApp />)
    const term = createRunningTerminal(80, 24)

    // Initial render
    term.update(app.lastBuffer()!, "initial")

    // Capture screen text at each section on first visit
    const firstVisit: string[] = [app.text]

    // Navigate down through all sections
    for (let i = 1; i < sections.length; i++) {
      app.press("j")
      term.update(app.lastBuffer()!, `j → ${sections[i]!.title}`)
      firstVisit.push(app.text)
    }

    // Navigate all the way back up
    for (let i = sections.length - 2; i >= 0; i--) {
      app.press("k")
      term.update(app.lastBuffer()!, `k → ${sections[i]!.title}`)

      // Screen should be identical to first visit of this section
      expect(app.text).toBe(firstVisit[i])
    }
  })

  test("storybook: bounce between long and short sections", async () => {
    const render = createRenderer({ incremental: true, cols: 80, rows: 24 })
    const app = render(<StorybookApp />)
    const term = createRunningTerminal(80, 24)

    term.update(app.lastBuffer()!, "initial (Rich Text)")

    // Rich Text (5 lines) → Tags (2 lines) — big shrink
    app.press("j")
    term.update(app.lastBuffer()!, "j → Tags")

    // Tags → Rich Text — back to long
    app.press("k")
    term.update(app.lastBuffer()!, "k → Rich Text")

    // Again: Rich Text → Tags → Fold Markers → Tags → Rich Text
    app.press("j")
    term.update(app.lastBuffer()!, "j → Tags (2nd)")
    app.press("j")
    term.update(app.lastBuffer()!, "j → Fold Markers")
    app.press("k")
    term.update(app.lastBuffer()!, "k → Tags (3rd)")
    app.press("k")
    term.update(app.lastBuffer()!, "k → Rich Text (3rd)")

    // Rapid bounce: j j k k j j k k
    for (const key of ["j", "j", "k", "k", "j", "j", "k", "k"]) {
      app.press(key)
      term.update(app.lastBuffer()!, `rapid ${key}`)
    }
  })

  test("board driver: navigate and switch views", async () => {
    const nodes = item.root(
      "board",
      item(
        "Inbox",
        item("Short task"),
        item("A much longer task name that fills more horizontal space"),
        item("Medium task"),
      ),
      item("In Progress", item("Working on feature X with a long description text"), item("Bug fix")),
      item("Done", item("Completed task alpha"), item("Beta release"), item("Gamma")),
    )

    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      incremental: true,
      columns: 80,
      rows: 24,
    })

    const term = createRunningTerminal(80, 24)
    term.update(driver.lastBuffer()!, "initial")

    // Navigate: j j l j j h k v j v k k
    const sequence = ["j", "j", "l", "j", "j", "h", "k", "v", "j", "v", "k", "k"]
    for (const key of sequence) {
      driver.press(key)
      term.update(driver.lastBuffer()!, `press("${key}")`)
    }
  })
})
