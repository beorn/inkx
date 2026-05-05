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
import { createSessionStore } from "@km/agent-harness"
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

function makeUserEntry(id: string, text: string, ts = 0): MessageEntry {
  const ops: MessageOp[] = [{ kind: "text", text }]
  const out: Record<string, unknown> = {
    id,
    role: "user",
    ops,
    ts,
  }
  Object.defineProperty(out, "text", {
    get() {
      return text
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return []
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return []
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

function renderList(messages: MessageEntry[], rows = 20, cols = 100) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
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

  test("renders a single shell command inline instead of hiding it behind an activity summary", () => {
    const entry = makeEntry({
      ops: [tool("cmd-1", "Bash", { command: "cd apps/silvercode" }, "")],
    })

    const app = renderList([entry])

    expect(app.text).toContain("$ cd apps/silvercode")
    expect(app.text).not.toContain("Ran 1 command")
  })

  test("renders one interleaved command inline between narration entries", async () => {
    const command = "bun run typecheck"
    const entry = makeEntry({
      ops: [
        { kind: "text", text: "I will rerun the verification." },
        tool("cmd-1", "exec_command", { cmd: command }, "blocked"),
        { kind: "text", text: "Typecheck is blocked by existing repo-wide errors." },
      ],
    })

    using term = createTermless({ cols: 120, rows: 30 })
    const handle = await run(
      <Box width={120} height={30} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-single-interleaved-command-test"
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
      const text = term.screen.getText()
      expect(text).toContain("I will rerun the verification.")
      expect(text).toContain(`$ ${command}`)
      expect(text).toContain("Typecheck is blocked by existing repo-wide errors.")
      expect(text).not.toContain("Ran 1 command")
    } finally {
      handle.unmount()
    }
  })

  test("renders one exec_command with write_stdin polling inline after normalization", async () => {
    const command = "npx tsc --noEmit"
    const entry = makeEntry({
      ops: [
        { kind: "text", text: "I am rerunning typecheck." },
        tool(
          "cmd-1",
          "exec_command",
          { cmd: command },
          "Chunk ID: 46ac3f\nWall time: 1.0021 seconds\nProcess running with session ID 40173\nOutput:\n",
        ),
        tool(
          "stdin-1",
          "write_stdin",
          { session_id: 40173, chars: "", yield_time_ms: 1000 },
          "Chunk ID: 69e229\nWall time: 5.0013 seconds\nProcess running with session ID 40173\nOutput:\n",
        ),
        tool(
          "stdin-2",
          "write_stdin",
          { session_id: 40173, chars: "", yield_time_ms: 1000 },
          "Chunk ID: 417bcc\nWall time: 1.8744 seconds\nProcess exited with code 2\nOutput:\nerror TS5033\n",
          true,
        ),
        { kind: "text", text: "Typecheck is blocked by repo-wide errors." },
      ],
    })

    using term = createTermless({ cols: 120, rows: 30 })
    const handle = await run(
      <Box width={120} height={30} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-single-normalized-command-test"
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
      const text = term.screen.getText()
      expect(text).toContain("I am rerunning typecheck.")
      expect(text).toContain(`$ ${command}`)
      expect(text).toContain("Typecheck is blocked by repo-wide errors.")
      expect(text).not.toContain("Ran 1 command")
      expect(text).not.toContain("write_stdin")
    } finally {
      handle.unmount()
    }
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

    expect(app.text).toContain("Read 1 file")
    expect(app.text).toContain("Edited 1 file")
    expect(app.text).toContain("Ran 1 command")
    expect(app.text).not.toContain("Turn activity")
    expect(app.text).not.toContain("APP CONTENT")
    expect(app.text).not.toContain("exec_command")
  })

  test("loaded Claude split tool-use aggregates still collapse to one activity summary", () => {
    const store = createSessionStore()
    const sessionId = "loaded-claude" as never
    const turnId = "msg-same-id" as never
    store.apply({
      kind: "assistant-message",
      sessionId,
      turnId,
      content: [{ type: "tool_use", id: "tool-1" as ToolUseId, name: "Bash", input: { command: "rg foo" } }],
      ts: 1,
    })
    store.apply({
      kind: "assistant-message",
      sessionId,
      turnId,
      content: [
        { type: "tool_use", id: "tool-2" as ToolUseId, name: "Bash", input: { command: "sed -n '1,80p' file.ts" } },
      ],
      ts: 2,
    })
    store.apply({ kind: "tool-result", sessionId, id: "tool-1" as ToolUseId, output: "hits", ts: 3 })
    store.apply({ kind: "tool-result", sessionId, id: "tool-2" as ToolUseId, output: "snippet", ts: 4 })

    const app = renderList(store.state.get().messages)

    expect(app.text).toContain("Ran 2 commands")
    expect(app.text).not.toContain("rg foo")
    expect(app.text).not.toContain("sed -n")
  })

  test("loaded Claude sessions collapse adjacent pure tool assistant messages", () => {
    const messages = [
      makeEntry({
        id: "assistant-tool-1",
        ops: [tool("cmd-1", "Bash", { command: "bd list --json" }, "[]")],
      }),
      makeEntry({
        id: "assistant-tool-2",
        ops: [tool("cmd-2", "Bash", { command: "bd show @km/foo" }, "body")],
      }),
      makeEntry({
        id: "assistant-answer",
        ops: [{ kind: "text", text: "Done." }],
      }),
    ]

    const app = renderList(messages)

    expect(app.text).toContain("Ran 2 commands")
    expect(app.text).toContain("Done.")
    expect(app.text).not.toContain("bd list --json")
    expect(app.text).not.toContain("bd show @km/foo")
  })

  test("high-volume Codex turns collapse to one activity row and expand back to interleaved narration", async () => {
    const ops: MessageOp[] = [{ kind: "text", text: "I am checking several files." }]
    for (let i = 0; i < 4; i++) ops.push(tool(`cmd-a-${i}`, "exec_command", { cmd: `rg query-${i}` }, "ok"))
    ops.push({ kind: "text", text: "Now I am checking related tests." })
    for (let i = 0; i < 5; i++) {
      ops.push(tool(`cmd-b-${i}`, "exec_command", { cmd: `sed -n '${i},${i + 1}p' file.ts` }, "ok"))
    }
    const entry = makeEntry({ ops })

    using term = createTermless({ cols: 120, rows: 24 })
    const handle = await run(
      <Box width={120} height={24} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-large-turn-test"
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
      const collapsed = term.screen.getText()
      expect(collapsed).toContain("Ran 9 commands")
      expect(collapsed).toContain("I am checking several files.")
      expect(collapsed).toContain("Now I am checking related tests.")
      expect(collapsed).not.toContain("rg query-0")
      expect(collapsed).not.toContain("sed -n")

      const row = term.screen.getLines().findIndex((line) => line.includes("Ran 9 commands"))
      expect(row).toBeGreaterThanOrEqual(0)
      const collapsedLines = term.screen.getLines()
      const firstNarrationRow = collapsedLines.findIndex((line) => line.includes("I am checking several files."))
      expect(firstNarrationRow).toBeGreaterThan(row)
      await term.mouse.click(term.screen.getLines()[row]!.indexOf("Ran 9 commands"), row)
      await settle(80)

      const expanded = term.screen.getText()
      expect(expanded).toContain("I am checking several files.")
      expect(expanded).toContain("Now I am checking related tests.")
      expect(expanded).toContain("rg query-0")
      expect(expanded).toContain("sed -n")
      expect(expanded.match(/I am checking several files\./g)?.length).toBe(1)
      expect(expanded.match(/Now I am checking related tests\./g)?.length).toBe(1)

      const expandedLines = term.screen.getLines()
      const narrationRow = expandedLines.findIndex((line) => line.includes("Now I am checking related tests."))
      expect(narrationRow, expanded).toBeGreaterThan(0)
      expect(expandedLines[narrationRow - 1]?.trim()).toBe("")
      expect(expandedLines[narrationRow + 1]?.trim()).toBe("")
    } finally {
      handle.unmount()
    }
  })

  test("collapses adjacent tool-bearing assistant messages even when they include thinking", async () => {
    const messages = [
      makeEntry({
        id: "assistant-thinking-tool",
        ops: [
          { kind: "thinking", text: "Checking the bead database." },
          tool("cmd-1", "Bash", { command: "bd list" }, "[]"),
        ],
      }),
      makeEntry({
        id: "assistant-tool",
        ops: [tool("cmd-2", "Bash", { command: "bd show @km/foo" }, "body")],
      }),
    ]

    using term = createTermless({ cols: 110, rows: 22 })
    const handle = await run(
      <Box width={110} height={22} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-thinking-tools-test"
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
      const collapsed = term.screen.getText()
      expect(collapsed).toContain("Ran 2 commands")
      expect(collapsed).not.toContain("Checking the bead database.")
      expect(collapsed).not.toContain("bd list")
      expect(collapsed).not.toContain("bd show @km/foo")

      const row = term.screen.getLines().findIndex((line) => line.includes("Ran 2 commands"))
      expect(row).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[row]!.indexOf("Ran 2 commands"), row)
      await settle(80)

      const expanded = term.screen.getText()
      expect(expanded).toContain("Checking the bead database.")
      expect(expanded).toContain("bd list")
      expect(expanded).toContain("bd show @km/foo")
    } finally {
      handle.unmount()
    }
  })

  test("groups a two-command run instead of showing raw commands inline", () => {
    const entry = makeEntry({
      ops: [
        tool("cmd-1", "Bash", { command: "find @km -name '*.md' | head" }, "a.md\nb.md"),
        tool("cmd-2", "Bash", { command: "wc -l @km/beads.md" }, "1734 @km/beads.md"),
      ],
    })

    const app = renderList([entry])

    expect(app.text).toContain("Ran 2 commands")
    expect(app.text).not.toContain("Turn activity")
    expect(app.text).not.toContain("find @km")
    expect(app.text).not.toContain("wc -l")
  })

  test("renders unresolved shell activity as running work", () => {
    const entry = makeEntry({
      ops: [
        { kind: "thinking", text: "Checking the bead database." },
        tool("cmd-1", "Bash", { command: "bd list --json" }, "[]"),
        tool("cmd-2", "Bash", { command: "bd show @km/foo" }),
      ],
    })

    const app = renderList([entry])

    expect(app.text).toContain("Running 2 commands")
    expect(app.text).not.toContain("Ran 2 commands")
    expect(app.text).not.toContain("bd list")
    expect(app.text).toContain("bd show @km/foo")
    expect(app.text).toContain("Checking the bead database.")
  })

  test("hides shell-runner cwd reset metadata from successful command output", async () => {
    const entry = makeEntry({
      ops: [
        tool(
          "cmd-1",
          "Bash",
          { command: "pwd" },
          {
            stdout: "/Users/beorn/Code/pim/km",
            stderr: "\nShell cwd was reset to /Users/beorn/Code/pim/km",
            exitCode: 0,
          },
        ),
        tool(
          "cmd-2",
          "Bash",
          { command: "ls" },
          {
            stdout: "apps\npackages",
            stderr: "",
            exitCode: 0,
          },
        ),
      ],
    })
    using term = createTermless({ cols: 110, rows: 22 })
    const handle = await run(
      <Box width={110} height={22} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-cwd-reset-test"
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
      const row = lines.findIndex((line) => line.includes("Ran 2 commands"))
      expect(row).toBeGreaterThanOrEqual(0)

      await term.mouse.click(lines[row]!.indexOf("Ran 2 commands"), row)
      await settle(80)

      const outline = term.screen.getText()
      expect(outline).toContain("$ pwd")
      expect(outline).toContain("$ ls")
      expect(outline).not.toContain("/Users/beorn/Code/pim/km")

      const pwdRow = term.screen.getLines().findIndex((line) => line.includes("$ pwd"))
      expect(pwdRow).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[pwdRow]!.indexOf("$ pwd"), pwdRow)
      await settle(80)

      const lsRow = term.screen.getLines().findIndex((line) => line.includes("$ ls"))
      expect(lsRow).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[lsRow]!.indexOf("$ ls"), lsRow)
      await settle(80)

      const revealed = term.screen.getText()
      expect(revealed).toContain("/Users/beorn/Code/pim/km")
      expect(revealed).toContain("apps")
      expect(revealed).not.toContain("Shell cwd was reset")
    } finally {
      handle.unmount()
    }
  })

  test("expanded Codex command output does not repeat the echoed command line", async () => {
    const command = "bun vitest run apps/silvercode/tests/turn-activity-summary.test.tsx"
    const entry = makeEntry({
      ops: [
        tool(
          "cmd-1",
          "exec_command",
          { cmd: command },
          `$ ${command}\n\n RUN  v4.1.4 /Users/beorn/Code/pim/km\n\nPASS\n`,
        ),
      ],
    })
    using term = createTermless({ cols: 120, rows: 18 })
    const handle = await run(
      <Box width={120} height={18} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-codex-echo-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes(command))
      expect(row).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[row]!.indexOf(command), row)
      await settle(80)

      const expanded = term.screen.getLines()
      expect(expanded.filter((line) => line.includes(command)).length).toBe(1)
      expect(term.screen.getText()).toContain("RUN  v4.1.4")
      expect(term.screen.getText()).toContain("PASS")
      expect(term.screen.getText()).not.toContain("Ran 1 command")
    } finally {
      handle.unmount()
    }
  })

  test("expanded failed command strips bare command echo from stderr", async () => {
    const command = "bun vitest run apps/silvercode/tests/tool-call-rendering-v2.test.tsx"
    const entry = makeEntry({
      ops: [
        tool(
          "cmd-1",
          "exec_command",
          { cmd: command },
          { stdout: "", stderr: `${command}\nAssertionError`, exitCode: 1 },
          true,
        ),
      ],
    })
    using term = createTermless({ cols: 120, rows: 18 })
    const handle = await run(
      <Box width={120} height={18} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-codex-stderr-echo-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes(command))
      expect(row).toBeGreaterThanOrEqual(0)
      const col = term.screen.getLines()[row]!.indexOf(command)
      await term.mouse.click(col, row)
      await settle(80)

      expect(term.screen.getLines().filter((line) => line.includes(command)).length).toBe(1)
      expect(term.screen.getText()).toContain("AssertionError")
    } finally {
      handle.unmount()
    }
  })

  test("Codex write_stdin polling is folded into the owning command session", async () => {
    const command = "bun vitest run apps/silvercode/tests/slow.test.tsx"
    const entry = makeEntry({
      ops: [
        tool(
          "cmd-1",
          "exec_command",
          { cmd: command },
          "Chunk ID: 742bc3\nWall time: 1.0000 seconds\nProcess running with session ID 76609\nOutput:\nstarting\n",
        ),
        tool(
          "stdin-1",
          "write_stdin",
          { session_id: 76609, chars: "", yield_time_ms: 15000 },
          "Chunk ID: 742bc3\nWall time: 15.0024 seconds\nProcess exited with code 0\nOutput:\nPASS\n",
        ),
      ],
    })
    using term = createTermless({ cols: 110, rows: 14 })
    const handle = await run(
      <Box width={110} height={14} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-write-stdin-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes(command))
      expect(row).toBeGreaterThanOrEqual(0)
      const col = term.screen.getLines()[row]!.indexOf(command)
      await term.mouse.click(col, row)
      await settle(80)

      const expanded = term.screen.getText()
      expect(expanded).toContain(command)
      expect(expanded).not.toContain("Waited for command output")
      expect(term.screen.getText()).not.toContain("write_stdin")
      expect(term.screen.getText()).not.toContain("Ran 1 command")
      expect(term.screen.getText()).not.toContain("Ran 2 commands")

      expect(term.screen.getText()).toContain("starting")
      expect(term.screen.getText()).toContain("PASS")
    } finally {
      handle.unmount()
    }
  })

  test("Codex apply_patch renders as a structured diff instead of raw patch text", async () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: apps/silvercode/src/foo.ts",
      "@@",
      "-const shade = 'old'",
      "+const shade = 'new'",
      "*** End Patch",
    ].join("\n")
    const entry = makeEntry({
      ops: [
        tool("patch-1", "apply_patch", patch, "Success. Updated the following files:\nM apps/silvercode/src/foo.ts\n"),
      ],
    })

    using term = createTermless({ cols: 120, rows: 16 })
    const handle = await run(
      <Box width={120} height={16} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-apply-patch-diff-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes("Edited apps/silvercode/src/foo.ts"))
      expect(row).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[row]!.indexOf("Edited apps/silvercode/src/foo.ts"), row)
      await settle(80)

      const expandedTool = term.screen.getText()
      expect(expandedTool).toContain("apps/silvercode/src/foo.ts")
      expect(expandedTool).toContain("const shade = 'old'")
      expect(expandedTool).toContain("const shade = 'new'")
      expect(expandedTool).not.toContain("*** Begin Patch")
      expect(expandedTool).not.toContain("*** End Patch")
    } finally {
      handle.unmount()
    }
  })

  test("expanded short edit activity uses the prose lane before widening", async () => {
    const entry = makeEntry({
      ops: [
        tool(
          "edit-1",
          "Edit",
          {
            file_path: "src/components/SidePanel.tsx",
            old_string: "const oldValue = true",
            new_string: "const newValue = true",
          },
          "Edited src/components/SidePanel.tsx (+1 -1)",
        ),
        tool("cmd-1", "exec_command", { cmd: "nl -ba src/components/SidePanel.tsx | sed -n '380,405p'" }, "ok"),
        tool("cmd-2", "exec_command", { cmd: "npx tsc --noEmit --incremental false --pretty false" }, "ok"),
      ],
    })

    using term = createTermless({ cols: 132, rows: 18 })
    const handle = await run(
      <Box width={132} height={18} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-short-edit-prose-lane-test"
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
      const summaryRow = term.screen.getLines().findIndex((line) => line.includes("Edited 1 file"))
      expect(summaryRow).toBeGreaterThanOrEqual(0)
      await term.mouse.click(term.screen.getLines()[summaryRow]!.indexOf("Edited 1 file"), summaryRow)
      await settle(80)

      const commandRow = term.screen
        .getLines()
        .findIndex((line) => line.includes("$ nl -ba src/components/SidePanel.tsx"))
      expect(commandRow, term.screen.getText()).toBeGreaterThanOrEqual(0)
      expect(term.screen.getLines()[commandRow]!.indexOf("$ nl -ba")).toBeGreaterThan(10)
    } finally {
      handle.unmount()
    }
  })

  test("view_image tool calls render as a compact image-view row", async () => {
    const path = "/tmp/silvercode-shot.png"
    const entry = makeEntry({
      ops: [tool("image-1", "view_image", { path }, "")],
    })

    using term = createTermless({ cols: 100, rows: 12 })
    const handle = await run(
      <Box width={100} height={12} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-view-image-test"
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
      const rendered = term.screen.getText()
      expect(rendered).toContain(`View ${path}`)
      expect(rendered).not.toContain("Ran 1 command")
      expect(rendered).not.toContain("view_image")
      expect(rendered).not.toContain(JSON.stringify({ path }, null, 2))
    } finally {
      handle.unmount()
    }
  })

  test("includes edit line deltas in the collapsed summary", () => {
    const entry = makeEntry({
      ops: [
        tool(
          "edit-1",
          "apply_patch",
          "*** Begin Patch\n*** Update File: apps/silvercode/src/App.tsx\n+one\n+two\n-old\n*** End Patch",
          "ok",
        ),
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "APP CONTENT"),
      ],
    })

    const app = renderList([entry])

    expect(app.text).toContain("Edited 1 file +2 -1")
    expect(app.text).toContain("Read 1 file")
  })

  test("renders the collapsed summary row as muted text without a leading bullet", () => {
    const entry = makeEntry({
      ops: [
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "APP CONTENT"),
        tool("cmd-1", "Bash", { command: "bun test" }, "ok"),
        tool(
          "edit-1",
          "Edit",
          { file_path: "apps/silvercode/src/App.tsx", old_string: "old", new_string: "new" },
          "ok",
        ),
      ],
    })

    const app = renderList([entry])
    const row = app.lines.findIndex((line) => line.includes("Read 1 file"))
    expect(row).toBeGreaterThanOrEqual(0)

    expect(app.lines[row]).not.toContain("Turn activity")
    expect(app.lines[row]).toContain(" · ")
    expect(app.lines[row]?.trimStart().startsWith("●")).toBe(false)
    expect(app.lines[row]?.trimStart().startsWith("•")).toBe(false)
    expect(app.lines[row]).not.toContain("▸")
    expect(app.lines[row]).not.toContain("▾")
    const aggregateCol = app.lines[row]!.indexOf("Read 1 file")
    const separatorCol = app.lines[row]!.indexOf("·")
    expect(aggregateCol).toBeGreaterThanOrEqual(0)
    expect(separatorCol).toBeGreaterThan(aggregateCol)
    expect(aggregateCol).toBeGreaterThan(2)
    expect(aggregateCol).toBeLessThanOrEqual(12)

    expect(app.cell(aggregateCol, row).fg).toBeDefined()
    expect(app.cell(separatorCol, row).fg).toBeDefined()
    expect(app.cell(separatorCol, row).fg).not.toStrictEqual(app.cell(aggregateCol, row).fg)
  })

  test("keeps collapsed summaries in the prose lane on wide panes", () => {
    const entry = makeEntry({
      ops: [
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "APP CONTENT"),
        tool("cmd-1", "Bash", { command: "bun test" }, "ok"),
      ],
    })

    const app = renderList([entry], 20, 160)
    const row = app.lines.findIndex((line) => line.includes("Read 1 file"))
    expect(row).toBeGreaterThanOrEqual(0)

    const aggregateCol = app.lines[row]!.indexOf("Read 1 file")
    expect(aggregateCol).toBeGreaterThanOrEqual(0)
    expect(aggregateCol).toBeGreaterThan(20)
    expect(aggregateCol).toBeLessThanOrEqual(45)
  })

  test("summary marker is a hover-only folding triangle and stays visible when expanded", async () => {
    using term = createTermless({ cols: 110, rows: 16 })
    const entry = makeEntry({
      ops: [
        tool("cmd-1", "Bash", { command: "printf summary" }, "RAW-COMMAND-OUTPUT"),
        tool("cmd-2", "Bash", { command: "printf again" }, "RAW-COMMAND-OUTPUT"),
      ],
    })
    const handle = await run(
      <Box width={110} height={16} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-fold-marker-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes("Ran 2 commands"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(term.screen.getText()).not.toContain("▸")
      expect(term.screen.getText()).not.toContain("▾")

      const col = term.screen.getLines()[row]!.indexOf("Ran 2 commands")
      await term.mouse.move(col, row)
      await settle(80)
      expect(term.screen.getLines()[row]).toContain("▸")
      expect(term.cell(row, col).bg).not.toBe(null)

      await term.mouse.click(col, row)
      await settle(80)
      expect(term.screen.getLines()[row]).toContain("▾")
      expect((term.cell(row, col) as { bold?: boolean }).bold).toBe(true)

      await term.mouse.move(0, 0)
      await settle(80)
      expect(term.screen.getLines()[row]).toContain("▾")
    } finally {
      handle.unmount()
    }
  })

  test("expanded activity markers share the folded marker background as a column", async () => {
    using term = createTermless({ cols: 110, rows: 18 })
    const entry = makeEntry({
      ops: [
        tool("read-1", "Read", { file_path: "apps/silvercode/src/App.tsx" }, "APP CONTENT"),
        tool("cmd-1", "Bash", { command: "printf marker-bg" }, "RAW-COMMAND-OUTPUT"),
      ],
    })
    const handle = await run(
      <Box width={110} height={18} flexDirection="column">
        <SessionUpdateList
          messages={[entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-marker-bg-test"
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
      const row = term.screen.getLines().findIndex((line) => line.includes("Read 1 file"))
      expect(row).toBeGreaterThanOrEqual(0)

      await term.mouse.click(term.screen.getLines()[row]!.indexOf("Read 1 file"), row)
      await settle(80)

      const lines = term.screen.getLines()
      const summaryRow = lines.findIndex((line) => line.includes("▾"))
      const readRow = lines.findIndex((line) => line.includes("Read apps/silvercode/src/App.tsx"))
      const commandRow = lines.findIndex((line) => line.includes("$ printf marker-bg"))
      expect(summaryRow).toBeGreaterThanOrEqual(0)
      expect(readRow).toBeGreaterThanOrEqual(0)
      expect(commandRow).toBeGreaterThanOrEqual(0)

      const summaryCol = lines[summaryRow]!.indexOf("▾")
      const readCol = lines[readRow]!.indexOf("•")
      const commandCol = lines[commandRow]!.indexOf("$")
      const markerBg = term.cell(summaryRow, summaryCol).bg
      expect(markerBg).not.toBe(null)
      expect(readCol).toBe(summaryCol)
      expect(commandCol).toBe(summaryCol)
      expect(term.cell(readRow, readCol).bg).toStrictEqual(markerBg)
      expect(term.cell(commandRow, commandCol).bg).toStrictEqual(markerBg)
    } finally {
      handle.unmount()
    }
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
      const row = lines.findIndex((line) => line.includes("Read 1 file"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(term.screen.getText()).not.toContain("RAW-READ-CONTENT")

      await term.mouse.click(lines[row]!.indexOf("Read 1 file"), row)
      await settle(80)

      const outline = term.screen.getText()
      expect(outline).toContain("Read 1 file")
      expect(outline).toContain("Read apps/silvercode/src/App.tsx")
      expect(outline).toContain("$ printf summary")
      expect(outline).toContain("RAW-FAILED-OUTPUT")
      expect(outline).not.toContain("RAW-READ-CONTENT")
      expect(outline).not.toContain("RAW-COMMAND-OUTPUT")

      const expandedLines = term.screen.getLines()
      const expandedRow = expandedLines.findIndex((line) => line.includes("Read apps/silvercode/src/App.tsx"))
      expect(expandedRow).toBe(row + 1)
      const expandedCol = expandedLines[expandedRow]!.indexOf("Read")
      expect(expandedCol).toBeGreaterThanOrEqual(1)
      await term.mouse.move(expandedCol, expandedRow)
      await settle(80)
      expect(term.cell(expandedRow, expandedCol).bg).not.toBe(null)

      await term.mouse.click(expandedCol, expandedRow)
      await settle(80)
      const commandRow = term.screen.getLines().findIndex((line) => line.includes("$ printf summary"))
      expect(commandRow).toBeGreaterThanOrEqual(0)
      await term.mouse.click(10, commandRow)
      await settle(80)

      const revealed = term.screen.getText()
      expect(revealed).toContain("RAW-READ-CONTENT")
      expect(revealed).toContain("RAW-COMMAND-OUTPUT")
      expect(revealed).toContain("RAW-FAILED-OUTPUT")
      expect(revealed).not.toContain("claude-code:Bash")
    } finally {
      handle.unmount()
    }
  })

  test("expanding a command inside an activity outline preserves the clicked command row", async () => {
    using term = createTermless({ cols: 110, rows: 14 })
    const filler = Array.from({ length: 1 }, (_, i) => makeUserEntry(`u-${i}`, `filler prompt ${i}`, 1000 + i))
    const command = "printf long-output"
    const entry = makeEntry({
      id: "assistant-command-anchor",
      ts: 2000,
      ops: [tool("cmd-1", "Bash", { command }, Array.from({ length: 20 }, (_, i) => `output ${i}`).join("\n"))],
    })
    const handle = await run(
      <Box width={110} height={14} flexDirection="column">
        <SessionUpdateList
          messages={[...filler, entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-anchor-test"
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      const beforeLines = term.screen.getLines()
      const commandRow = beforeLines.findIndex((line) => line.includes(`$ ${command}`))
      expect(commandRow, beforeLines.join("\n")).toBeGreaterThanOrEqual(0)
      const commandCol = beforeLines[commandRow]!.indexOf(`$ ${command}`)

      await term.mouse.click(commandCol, commandRow)
      await settle(80)

      const afterRow = term.screen.getLines().findIndex((line) => line.includes(`$ ${command}`))
      expect(afterRow).toBe(commandRow)
      expect(term.screen.getText()).toContain("output 0")
      expect(term.screen.getText()).not.toContain("Ran 1 command")
    } finally {
      handle.unmount()
    }
  })

  test("expanding an activity summary near the viewport bottom preserves the clicked summary row", async () => {
    using term = createTermless({ cols: 110, rows: 14 })
    const filler = Array.from({ length: 7 }, (_, i) => makeUserEntry(`u-${i}`, `filler prompt ${i}`, 1000 + i))
    const entry = makeEntry({
      id: "assistant-summary-header-anchor",
      ts: 2000,
      ops: [
        tool("cmd-1", "Bash", { command: "printf one" }, "one"),
        tool("cmd-2", "Bash", { command: "printf two" }, "two"),
      ],
    })
    const handle = await run(
      <Box width={110} height={14} flexDirection="column">
        <SessionUpdateList
          messages={[...filler, entry]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="turn-summary-header-anchor-test"
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle(80)
      const beforeLines = term.screen.getLines()
      const summaryRow = beforeLines.findIndex((line) => line.includes("Ran 2 commands"))
      expect(summaryRow, beforeLines.join("\n")).toBeGreaterThanOrEqual(0)
      const summaryCol = beforeLines[summaryRow]!.indexOf("Ran 2 commands")

      await term.mouse.click(summaryCol, summaryRow)
      await settle(80)

      const afterRow = term.screen.getLines().findIndex((line) => line.includes("Ran 2 commands"))
      expect(afterRow).toBe(summaryRow)
      expect(term.screen.getLines()[afterRow]).toContain("▾")
    } finally {
      handle.unmount()
    }
  })
})
