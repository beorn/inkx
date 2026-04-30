/**
 * Tool-call rendering v2 — opencode-style.
 *
 * Verifies the new visual contract:
 *   1. No border, no bg color on the always-visible row
 *   2. Body is hidden by default; previewed in a popover on hover and
 *      toggled inline on click
 *   3. Consecutive tool calls render contiguously (no blank line gap)
 *   4. Failed call keeps the neutral shell row and shows error inline
 *   5. Neutral marker prefixes the title (`•`, or `$` for shell)
 *
 * Bead: km-silvercode.tool-call-rendering-v2.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../src/components/ToolCall.tsx"

const id = (s: string) => s as ToolCallId

function freshRender() {
  return createRenderer({ cols: 100, rows: 30 })
}

function tc(overrides: Partial<ToolCallType>): ToolCallType {
  return {
    toolCallId: id("tc-1"),
    title: "default title",
    ...overrides,
  }
}

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))

// =============================================================================
// 1. No border / bg color on always-visible row
// =============================================================================

describe("ToolCall v2 — no border / no bg", () => {
  // Use status="pending" for static-frame assertions because completed/in-progress
  // wrap the title in TextReveal/TextShimmer which animate from 0 chars.
  test("pending Read: row container has no border", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "read",
          status: "pending",
          title: "src/foo.ts",
          content: [{ type: "content", content: { type: "text", text: "hello" } }],
        })}
      />,
    )
    // No border-drawing chars on any row that contains the title.
    const lines = app.text.split("\n")
    const titleLine = lines.find((l) => l.includes("src/foo.ts"))
    expect(titleLine).toBeDefined()
    // Common border characters used by silvery's "single" border style.
    expect(titleLine!).not.toMatch(/[│┃┆┇┊┋╎╏┌┐└┘├┤┬┴┼─━]/)
  })

  test("pending Read: row cells have no background paint", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "read",
          status: "pending",
          title: "src/foo.ts",
          content: [{ type: "content", content: { type: "text", text: "hello" } }],
        })}
      />,
    )
    // Find the row containing "src/foo.ts" and assert the cells under the
    // title have no background color set. The default chat bg is null/none.
    const lines = app.text.split("\n")
    const rowIdx = lines.findIndex((l) => l.includes("src/foo.ts"))
    expect(rowIdx).toBeGreaterThanOrEqual(0)
    const titleStart = lines[rowIdx]!.indexOf("src/foo.ts")
    const cell = app.cell(titleStart, rowIdx)
    // Cell bg should be null (no paint) — opencode-style flat row.
    expect(cell.bg).toBe(null)
  })
})

// =============================================================================
// 2. Body hidden by default; previewed on hover, toggled inline on click
// =============================================================================

describe("ToolCall v2 — body preview and toggle", () => {
  test("default state: body content not visible", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "read",
          status: "pending",
          title: "src/foo.ts",
          content: [{ type: "content", content: { type: "text", text: "BODY-MARKER" } }],
        })}
      />,
    )
    expect(app.text).toContain("src/foo.ts")
    expect(app.text).not.toContain("BODY-MARKER")
  })

  test("hovered: does not reveal body inline or move following rows", async () => {
    using term = createTermless({ cols: 100, rows: 20 })
    const handle = await run(
      <Box flexDirection="column">
        <ToolCall
          toolCall={tc({
            kind: "read",
            status: "pending",
            title: "src/foo.ts",
            content: [{ type: "content", content: { type: "text", text: "BODY-MARKER-HOVER" } }],
          })}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      // Initially the body is hidden.
      expect(term.screen.getText()).not.toContain("BODY-MARKER-HOVER")

      // Move mouse over the title row.
      const lines = term.screen.getLines()
      const rowIdx = lines.findIndex((l) => l.includes("src/foo.ts"))
      const nextBefore = lines.findIndex((l) => l.includes("NEXT-ROW"))
      expect(rowIdx).toBeGreaterThanOrEqual(0)
      expect(nextBefore).toBe(rowIdx + 1)
      const col = lines[rowIdx]!.indexOf("src/foo.ts")
      await term.mouse.move(col + 1, rowIdx)
      await settle(80)

      // Hover owns popover preview, not inline disclosure. Termless does not
      // expose the popover overlay in this assertion surface, so the stable
      // contract we pin here is: no inline body and no layout jump.
      expect(term.screen.getText()).not.toContain("BODY-MARKER-HOVER")
      const after = term.screen.getLines()
      const nextAfter = after.findIndex((l) => l.includes("NEXT-ROW"))
      expect(nextAfter).toBe(rowIdx + 1)
    } finally {
      handle.unmount()
    }
  })

  test("click toggles body content inline", async () => {
    using term = createTermless({ cols: 100, rows: 20 })
    const handle = await run(
      <Box flexDirection="column">
        <ToolCall
          toolCall={tc({
            kind: "read",
            status: "pending",
            title: "src/foo.ts",
            content: [{ type: "content", content: { type: "text", text: "BODY-MARKER-CLICK" } }],
          })}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      const lines = term.screen.getLines()
      const rowIdx = lines.findIndex((l) => l.includes("src/foo.ts"))
      expect(rowIdx).toBeGreaterThanOrEqual(0)
      expect(lines.findIndex((l) => l.includes("NEXT-ROW"))).toBe(rowIdx + 1)

      const col = lines[rowIdx]!.indexOf("src/foo.ts")
      await term.mouse.click(col + 1, rowIdx)
      await settle(80)

      const expanded = term.screen.getLines()
      expect(expanded.findIndex((l) => l.includes("BODY-MARKER-CLICK"))).toBe(rowIdx + 1)
      expect(expanded.findIndex((l) => l.includes("NEXT-ROW"))).toBe(rowIdx + 2)

      await term.mouse.click(col + 1, rowIdx)
      await settle(80)

      const collapsed = term.screen.getLines()
      expect(collapsed.findIndex((l) => l.includes("BODY-MARKER-CLICK"))).toBe(-1)
      expect(collapsed.findIndex((l) => l.includes("NEXT-ROW"))).toBe(rowIdx + 1)
    } finally {
      handle.unmount()
    }
  })

  test("hovered empty text content does not reserve a blank body row", async () => {
    using term = createTermless({ cols: 100, rows: 20 })
    const handle = await run(
      <Box flexDirection="column">
        <ToolCall
          toolCall={tc({
            kind: "think",
            status: "pending",
            title: "TodoWrite",
            content: [{ type: "content", content: { type: "text", text: "" } }],
          })}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      const before = term.screen.getLines()
      const titleRow = before.findIndex((l) => l.includes("TodoWrite"))
      const nextBefore = before.findIndex((l) => l.includes("NEXT-ROW"))
      expect(titleRow).toBeGreaterThanOrEqual(0)
      expect(nextBefore).toBe(titleRow + 1)

      const col = before[titleRow]!.indexOf("TodoWrite")
      await term.mouse.move(col + 1, titleRow)
      await settle(80)

      const after = term.screen.getLines()
      const nextAfter = after.findIndex((l) => l.includes("NEXT-ROW"))
      expect(nextAfter).toBe(titleRow + 1)
    } finally {
      handle.unmount()
    }
  })
})

// =============================================================================
// 3. Failed call: neutral shell row + inline error message
// =============================================================================

describe("ToolCall v2 — failed status stays neutral", () => {
  test("failed Bash: command stays bold and error is inline", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "execute",
          status: "failed",
          title: "rm -rf /tmp/x",
        })}
        errorMessage="permission denied"
      />,
    )
    expect(app.text).toContain("rm -rf /tmp/x")
    expect(app.text).toContain("permission denied")
    const lines = app.text.split("\n")
    const rowIdx = lines.findIndex((l) => l.includes("rm -rf"))
    expect(rowIdx).toBeGreaterThanOrEqual(0)
    expect(lines[rowIdx]).toMatch(/\$\s+rm -rf/)
    const col = lines[rowIdx]!.indexOf("rm")
    const cell = app.cell(col, rowIdx)
    expect(cell.fg).not.toBe(null)
    expect(cell.bold).toBe(true)
  })
})

// =============================================================================
// 4. Neutral marker glyph
// =============================================================================

describe("ToolCall v2 — neutral marker glyph", () => {
  test("Read renders with bullet prefix and bold action word", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "read", status: "pending", title: "Read src/foo.ts" })} />)
    expect(app.text).toMatch(/•\s+Read src\/foo\.ts/)
    const row = app.lines.findIndex((l) => l.includes("Read src/foo.ts"))
    expect(row).toBeGreaterThanOrEqual(0)
    const readCol = app.lines[row]!.indexOf("Read")
    const pathCol = app.lines[row]!.indexOf("src/foo.ts")
    expect(app.cell(readCol, row).bold).toBe(true)
    expect(app.cell(pathCol, row).bold).toBe(false)
  })

  test("Bash renders with `$ ` prefix", () => {
    const app = freshRender()(
      <ToolCall toolCall={tc({ kind: "execute", status: "failed", title: "bun fix" })} errorMessage="boom" />,
    )
    expect(app.text).toMatch(/\$\s+bun fix/)
  })
})

// =============================================================================
// 5. Consecutive zero-gap clustering
// =============================================================================
// This test isn't local to <ToolCall> — gap suppression is a SessionUpdateList
// concern. Stand-alone we render N <ToolCall>s in a column and verify that the
// rows are contiguous (no blank rows between titles). The actual production
// concern (gap={1} on ListView) is verified by inspecting that two adjacent
// ToolCalls in a Box flexDirection="column" with no gap render contiguously.

describe("ToolCall v2 — consecutive rendering is contiguous (zero internal padding)", () => {
  test("5 ToolCalls in a column with no gap render contiguously", () => {
    const titles = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]
    const app = freshRender()(
      <Box flexDirection="column">
        {titles.map((t) => (
          <ToolCall
            key={t}
            toolCall={tc({
              toolCallId: id(`tc-${t}`),
              kind: "read",
              status: "pending",
              title: t,
            })}
          />
        ))}
      </Box>,
    )
    const lines = app.text.split("\n")
    const indices = titles.map((t) => lines.findIndex((l) => l.includes(t)))
    // Every title must be visible.
    indices.forEach((i, k) => {
      expect(i, `title ${titles[k]} should be present`).toBeGreaterThanOrEqual(0)
    })
    // Each row should be exactly one row apart from the next — i.e. NO blank
    // line between consecutive ToolCall rows. This is the opencode-style
    // tight cluster.
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]! - indices[i - 1]!).toBe(1)
    }
  })
})
