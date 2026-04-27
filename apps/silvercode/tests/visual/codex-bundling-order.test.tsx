/**
 * Regression: when codex emits many tool calls within one ACP turn, all
 * tool calls rendered stacked under no/empty assistant text — the
 * interleaving order between text and tool calls was lost.
 *
 * Root cause was the legacy `MessageEntry.text` (concatenated) +
 * `MessageEntry.toolCalls[]` (separate array) representation. The renderer
 * placed all text first and all tool calls after, regardless of arrival
 * order. With Claude this rarely showed (Claude usually emits one prose
 * paragraph followed by tool calls); codex emits many small text chunks
 * interleaved with many tool calls, making the bug obvious.
 *
 * Fix: replace `text` + `toolCalls[]` with order-preserving `ops:
 * MessageOp[]` and render `m.ops` in arrival order. Legacy fields remain
 * as derived getters for backward compat (existing tests still pass).
 *
 * This test pins the rendered order: a codex-shape MessageEntry with
 * interleaved text/tool/text/tool ops must render with text and tool
 * cards in that exact arrival order in the rendered frame.
 *
 * Bead: km-silvercode.codex-bundling-order.
 */
import React from "react"
import { describe, expect, test, beforeAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import type { MessageEntry, MessageOp, ToolCallEntry, ToolResultEntry, ToolUseId } from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

/**
 * Build a MessageEntry from ops. Mirrors the store's
 * `installEntryProjections` so the legacy getters resolve to the right
 * values when the renderer reads them.
 */
function makeEntry(opts: {
  id: string
  role: "assistant" | "user"
  ops: MessageOp[]
  ts?: number
}): MessageEntry {
  const out: Record<string, unknown> = {
    id: opts.id,
    role: opts.role,
    ops: opts.ops,
    ts: opts.ts ?? 0,
  }
  Object.defineProperty(out, "text", {
    get() {
      let s = ""
      for (const op of opts.ops) if (op.kind === "text") s += op.text
      return s
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      const arr: ToolCallEntry[] = []
      for (const op of opts.ops) if (op.kind === "tool") arr.push(op.toolCall)
      return arr
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      const arr: ToolResultEntry[] = []
      for (const op of opts.ops) if (op.kind === "tool" && op.result) arr.push(op.result)
      return arr
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

describe("SessionUpdateList — codex tool-call interleaving (km-silvercode.codex-bundling-order)", () => {
  test("renders text and tool cards in arrival order (text → tool → text → tool)", () => {
    // Codex-shape: 4 ops alternating text and tool. Each text op contains
    // a unique anchor string so we can locate it in the rendered frame.
    const entry = makeEntry({
      id: "m1",
      role: "assistant",
      ops: [
        { kind: "text", text: "ANCHOR_ALPHA reading config" },
        {
          kind: "tool",
          toolCall: { id: "tu_1" as ToolUseId, name: "Read", input: { file_path: "alpha.ts" } },
          result: { id: "tu_1" as ToolUseId, output: "alpha contents", is_error: false },
        },
        { kind: "text", text: "ANCHOR_BETA now grepping" },
        {
          kind: "tool",
          toolCall: { id: "tu_2" as ToolUseId, name: "Grep", input: { pattern: "beta" } },
          result: { id: "tu_2" as ToolUseId, output: "beta hits", is_error: false },
        },
      ],
    })

    const COLS = 80
    const ROWS = 30
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <SessionUpdateList
            messages={[entry]}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="s1"
            status="idle"
            turnStartedAt={0}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
          />
        </Box>
      </Box>,
    )
    const frame = app.text

    // Both text anchors must appear in the rendered frame (collapsed
    // tool cards in narrow widths render without titles, but the text
    // ops carry our unique anchors so the ordering check is robust).
    expect(frame).toContain("ANCHOR_ALPHA")
    expect(frame).toContain("ANCHOR_BETA")

    // The crucial assertion: text ops render in arrival order.
    // Pre-fix, both anchors would be concatenated together at the top
    // ("ANCHOR_ALPHA ANCHOR_BETA"), then both tool cards would follow.
    // Post-fix, ANCHOR_ALPHA appears, then a tool card, then
    // ANCHOR_BETA, then another tool card — so there must be characters
    // *between* the two anchors that are NOT just whitespace/newlines.
    const idxAlpha = frame.indexOf("ANCHOR_ALPHA")
    const idxBeta = frame.indexOf("ANCHOR_BETA")
    expect(idxAlpha).toBeGreaterThanOrEqual(0)
    expect(idxBeta).toBeGreaterThan(idxAlpha)

    // Between the two anchors, the rendered frame must contain a tool
    // card glyph (gear ⚙️ or vertical bar │ from the tool card frame).
    // This is what makes the arrival order observable — without the
    // intervening tool card, the two anchors would be adjacent in the
    // frame (separated only by gap whitespace).
    const between = frame.slice(idxAlpha + "ANCHOR_ALPHA".length, idxBeta)
    expect(between).toMatch(/⚙|│/)
  })

  test("legacy projections (text/toolCalls/toolResults) reflect ops correctly", () => {
    // Backward-compat sanity: with a codex-shape entry, the derived
    // .text concatenates all text ops, .toolCalls returns each tool op's
    // toolCall in order, .toolResults returns the results in order.
    const entry = makeEntry({
      id: "m1",
      role: "assistant",
      ops: [
        { kind: "text", text: "first chunk " },
        {
          kind: "tool",
          toolCall: { id: "tu_1" as ToolUseId, name: "Read", input: {} },
          result: { id: "tu_1" as ToolUseId, output: "ok" },
        },
        { kind: "text", text: "middle chunk " },
        {
          kind: "tool",
          toolCall: { id: "tu_2" as ToolUseId, name: "Grep", input: {} },
        },
        { kind: "text", text: "tail chunk" },
      ],
    })

    expect(entry.text).toBe("first chunk middle chunk tail chunk")
    expect(entry.toolCalls.map((c) => c.name)).toEqual(["Read", "Grep"])
    expect(entry.toolResults).toHaveLength(1)
    expect(entry.toolResults[0]?.id).toBe("tu_1")
  })
})
