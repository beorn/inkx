/**
 * TurnActivitySummary — dense assistant tool work collapses to one turn row.
 *
 * Bead: km-silvercode.turn-activity-summary.
 */

import React from "react"
import { describe, expect, test, beforeAll } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box } from "silvery"
import { run } from "silvery/runtime"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import type { MessageEntry, MessageOp, ToolCallEntry, ToolResultEntry, ToolUseId } from "@km/agent-harness"
import { SessionUpdateList } from "../src/components/SessionUpdateList.tsx"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))

function makeEntry(opts: { id?: string; ops: MessageOp[]; ts?: number }): MessageEntry {
  const out: Record<string, unknown> = {
    id: opts.id ?? "assistant-turn",
    role: "assistant",
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

function renderList(messages: MessageEntry[], rows = 20) {
  const renderer = createRenderer({ cols: 100, rows })
  return renderer(
    <Box width={100} height={rows} flexDirection="column">
      <SessionUpdateList
        messages={messages}
        onApprove={() => {}}
        onDeny={() => {}}
        sessionId="turn-summary-test"
        status="idle"
        turnStartedAt={null}
        inputTokens={0}
        outputTokens={0}
        pendingPermissions={0}
        inFlightTool={null}
        follow={false}
      />
    </Box>,
  )
}

function tool(
  id: string,
  name: string,
  input: unknown,
  output?: unknown,
  is_error = false,
  mcp_server?: string,
): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name, input, mcp_server },
    result: output === undefined ? undefined : { id: id as ToolUseId, output, is_error },
  }
}

describe("TurnActivitySummary", () => {
  test("keeps a single low-content tool call inline as a sentence summary", () => {
    const entry = makeEntry({
      ops: [tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" })],
    })

    const app = renderList([entry])

    expect(app.text).toContain("Read apps/silvercode/src/App.tsx")
    expect(app.text).not.toContain("Turn activity")
  })

  test("groups high-content tool work under one friendly turn row", () => {
    const entry = makeEntry({
      ops: [
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "APP CONTENT"),
        tool(
          "cmd-1",
          "exec_command",
          { cmd: "bun vitest run apps/silvercode/tests/turn-activity-summary.test.tsx" },
          "ok",
        ),
        tool(
          "edit-1",
          "Edit",
          {
            file_path: "apps/silvercode/src/components/SessionUpdateList.tsx",
            old_string: "old",
            new_string: "new",
          },
          "Patch applied",
        ),
      ],
    })

    const app = renderList([entry])

    expect(app.text).toContain("Turn activity")
    expect(app.text).toContain("Read 1 file")
    expect(app.text).toContain("Edited 1 file")
    expect(app.text).toContain("Ran 1 command")
    expect(app.text).not.toContain("APP CONTENT")
    expect(app.text).not.toContain("exec_command")
  })

  test("clicking anywhere on the summary row expands recoverable raw details", async () => {
    using term = createTermless({ cols: 110, rows: 22 })
    const entry = makeEntry({
      ops: [
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "RAW-READ-CONTENT"),
        tool("cmd-1", "Bash", { command: "printf summary" }, "RAW-COMMAND-OUTPUT"),
        tool("fail-1", "Bash", { command: "exit 9" }, "RAW-FAILED-OUTPUT", true, "claude-code"),
      ],
    })
    const handle = await run(
      <Box width={110} height={22} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-click-test"
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          follow={false}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      const lines = term.screen.getLines()
      const row = lines.findIndex((line) => line.includes("Turn activity"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(term.screen.getText()).not.toContain("RAW-READ-CONTENT")

      await term.mouse.click(105, row)
      await settle(80)

      const expanded = term.screen.getText()
      expect(expanded).toContain("RAW-READ-CONTENT")
      expect(expanded).toContain("RAW-COMMAND-OUTPUT")
      expect(expanded).toContain("RAW-FAILED-OUTPUT")
      expect(expanded).not.toContain("claude-code:Bash")
    } finally {
      handle.unmount()
    }
  })
})
