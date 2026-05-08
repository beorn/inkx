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
 * blocks in that exact arrival order in the rendered frame.
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
import {
  messageTextFromOps,
  type MessageEntry,
  type MessageOp,
  type ToolCallEntry,
  type ToolResultEntry,
  type ToolUseId,
} from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

/**
 * Build a MessageEntry from ops. Mirrors the store's
 * `installEntryProjections` so the legacy getters resolve to the right
 * values when the renderer reads them.
 */
function makeEntry(opts: { id: string; role: "assistant" | "user"; ops: MessageOp[]; ts?: number }): MessageEntry {
  const out: Record<string, unknown> = {
    id: opts.id,
    role: opts.role,
    ops: opts.ops,
    ts: opts.ts ?? 0,
  }
  Object.defineProperty(out, "text", {
    get() {
      return messageTextFromOps(opts.ops)
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
  test("summarizes low-content tool calls in arrival order", () => {
    const entry = makeEntry({
      id: "m1",
      role: "assistant",
      ops: [
        {
          kind: "tool",
          toolCall: { id: "tu_read" as ToolUseId, name: "Read", input: { file_path: "alpha.ts" } },
        },
        {
          kind: "tool",
          toolCall: { id: "tu_write" as ToolUseId, name: "Write", input: { file_path: "beta.ts" } },
        },
        {
          kind: "tool",
          toolCall: { id: "tu_delete" as ToolUseId, name: "Delete", input: { file_path: "old.ts" } },
        },
        {
          kind: "tool",
          toolCall: { id: "tu_fetch" as ToolUseId, name: "WebFetch", input: { url: "https://example.com" } },
        },
        {
          kind: "tool",
          toolCall: {
            id: "tu_todo" as ToolUseId,
            name: "TodoWrite",
            input: { todos: [{ content: "Review auth refactor PR", status: "pending" }] },
          },
        },
        {
          kind: "tool",
          toolCall: { id: "tu_exec" as ToolUseId, name: "exec_command", input: { cmd: "ls src" } },
        },
        {
          kind: "tool",
          toolCall: {
            id: "tu_patch" as ToolUseId,
            name: "apply_patch",
            input:
              "*** Begin Patch\n" +
              "*** Update File: apps/silvercode/src/foo.ts\n" +
              "@@\n" +
              "-old\n" +
              "+new\n" +
              "*** End Patch\n",
          },
          result: {
            id: "tu_patch" as ToolUseId,
            output: "Success. Updated the following files:\nM apps/silvercode/src/foo.ts\n",
          },
        },
      ],
    })

    const COLS = 160
    const app = createRenderer({ cols: COLS, rows: 20 })(
      <Box width={COLS} height={20} flexDirection="column">
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
          follow={false}
        />
      </Box>,
    )
    app.press("")

    expect(app.text).toContain("Reading 1 file")
    expect(app.text).toContain("Editing 2 files +1 -1")
    expect(app.text).toContain("Deleting 1 file")
    expect(app.text).toMatch(/\$.*ls src/)
  })

  test("renders text and tool blocks in arrival order (text → tool → text → tool)", () => {
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
            follow={false}
          />
        </Box>
      </Box>,
    )
    app.press("")
    const frame = app.text

    // Both text anchors must appear in the rendered frame (collapsed
    // tool blocks in narrow widths render without titles, but the text
    // ops carry our unique anchors so the ordering check is robust).
    expect(frame).toContain("ANCHOR_ALPHA")
    expect(frame).toContain("ANCHOR_BETA")

    // The crucial assertion: text ops render in arrival order.
    // Pre-fix, both anchors would be concatenated together at the top
    // ("ANCHOR_ALPHA ANCHOR_BETA"), then both tool blocks would follow.
    // Post-fix, ANCHOR_ALPHA appears, then a tool block, then
    // ANCHOR_BETA, then another tool block — so there must be characters
    // *between* the two anchors that are NOT just whitespace/newlines.
    const idxAlpha = frame.indexOf("ANCHOR_ALPHA")
    const idxBeta = frame.indexOf("ANCHOR_BETA")
    expect(idxAlpha).toBeGreaterThanOrEqual(0)
    expect(idxBeta).toBeGreaterThan(idxAlpha)

    // Between the two anchors, the rendered frame must contain a tool
    // call marker. v2 contract (km-silvercode.tool-call-rendering-v2):
    // tool calls render as flat rows prefixed with a neutral marker (no
    // border, no bg, no ⚙ status glyph). The presence of `•` between anchors
    // is what makes the arrival order observable — without the intervening
    // tool call, the two anchors would be adjacent (whitespace only).
    const between = frame.slice(idxAlpha + "ANCHOR_ALPHA".length, idxBeta)
    expect(between).toMatch(/•/)
  })

  test("does not collapse an entire high-volume turn when narration is interspersed", () => {
    const ops: MessageOp[] = [{ kind: "text", text: "ANCHOR_START before tools" }]
    for (let i = 0; i < 10; i++) {
      ops.push({
        kind: "tool",
        toolCall: { id: `tu_${i}` as ToolUseId, name: "Read", input: { file_path: `file-${i}.ts` } },
        result: { id: `tu_${i}` as ToolUseId, output: `file ${i}`, is_error: false },
      })
    }
    ops.push({ kind: "text", text: "ANCHOR_END after tools" })

    const entry = makeEntry({ id: "m1", role: "assistant", ops })

    const COLS = 120
    const ROWS = 36
    const app = createRenderer({ cols: COLS, rows: ROWS })(
      <Box width={COLS} height={ROWS} flexDirection="column">
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
          follow={false}
        />
      </Box>,
    )
    app.press("")

    expect(app.text).toContain("ANCHOR_START")
    expect(app.text).toContain("ANCHOR_END")
    expect(app.text).toContain("Read 10 files")
    expect(app.text).not.toContain("Using 10 tools")
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
        { kind: "thinking", text: "thinking chunk " },
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

  test("renders thinking ops inline without adding them to assistant prose projection", () => {
    const entry = makeEntry({
      id: "m1",
      role: "assistant",
      ops: [
        { kind: "thinking", text: 'Right — "reference" just means "thing that resolves".' },
        { kind: "text", text: "Visible answer." },
      ],
    })

    const app = createRenderer({ cols: 80, rows: 10 })(
      <Box width={80} height={10} flexDirection="column">
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
          follow={false}
        />
      </Box>,
    )
    app.press("")

    expect(entry.text).toBe("Visible answer.")
    expect(app.text).toContain('"reference" just means')
    expect(app.text).toContain("Visible answer.")
    expect(app.text.indexOf('"reference" just means')).toBeLessThan(app.text.indexOf("Visible answer."))
  })
})
