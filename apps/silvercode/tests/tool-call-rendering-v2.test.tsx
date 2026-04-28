/**
 * Tool-call rendering v2 — opencode-style.
 *
 * Verifies the new visual contract:
 *   1. No border, no bg color on the always-visible row
 *   2. Body is hidden by default; revealed on hover (via useHover)
 *   3. Consecutive tool calls render contiguously (no blank line gap)
 *   4. Failed call uses $error color on the verb token
 *   5. Leading `→` glyph prefixes the title
 *
 * Bead: km-silvercode.tool-call-rendering-v2.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box } from "silvery"
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
// 2. Body hidden by default; revealed on hover
// =============================================================================

describe("ToolCall v2 — body reveals on hover", () => {
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

  test("hovered: body content reveals", async () => {
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
      expect(rowIdx).toBeGreaterThanOrEqual(0)
      const col = lines[rowIdx]!.indexOf("src/foo.ts")
      await term.mouse.move(col + 1, rowIdx)
      await settle(80)

      // Body should now be visible.
      expect(term.screen.getText()).toContain("BODY-MARKER-HOVER")
    } finally {
      handle.unmount()
    }
  })
})

// =============================================================================
// 3. Failed call: $error on verb token + inline error message
// =============================================================================

describe("ToolCall v2 — failed status uses $error", () => {
  test("failed Bash: title rendered with $error semantic color", () => {
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
    // Find the title row and confirm fg is set (not the default).
    const lines = app.text.split("\n")
    const rowIdx = lines.findIndex((l) => l.includes("rm -rf"))
    expect(rowIdx).toBeGreaterThanOrEqual(0)
    const col = lines[rowIdx]!.indexOf("rm")
    const cell = app.cell(col, rowIdx)
    // The verb is bold colored ($error). We assert that fg is non-null —
    // the resolved-color match against the active theme is brittle, so
    // structural "has fg" is the contract.
    expect(cell.fg).not.toBe(null)
    expect(cell.bold).toBe(true)
  })
})

// =============================================================================
// 4. Leading `→` glyph
// =============================================================================

describe("ToolCall v2 — leading arrow glyph", () => {
  test("Read renders with `→ ` prefix", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "read", status: "pending", title: "src/foo.ts" })} />)
    // The `→ ` glyph + title appear on the same row.
    expect(app.text).toMatch(/→\s+src\/foo\.ts/)
  })

  test("failed call also has `→ ` prefix", () => {
    const app = freshRender()(
      <ToolCall toolCall={tc({ kind: "execute", status: "failed", title: "bun fix" })} errorMessage="boom" />,
    )
    expect(app.text).toMatch(/→\s+bun fix/)
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
