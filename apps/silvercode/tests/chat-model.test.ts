import { describe, expect, test } from "vitest"
import type { MessageEntry, MessageOp, ToolUseId } from "@km/agent-harness"
import {
  buildChatTurns,
  splitAssistantMessageForTranscript,
  splitAssistantOpsIntoDisplaySlices,
} from "../src/chat-model.ts"

function tool(id: string, command: string): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name: "Bash", input: { command } },
    result: { id: id as ToolUseId, output: "ok" },
  }
}

function codexTool(id: string, name: string, input: unknown, output: string): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name, input },
    result: { id: id as ToolUseId, output },
  }
}

function message(id: string, role: MessageEntry["role"], ops: MessageOp[]): MessageEntry {
  const out: Record<string, unknown> = {
    id,
    role,
    ops,
    ts: 0,
  }
  Object.defineProperty(out, "text", {
    get() {
      return ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])).join("")
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : []))
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : []))
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

describe("chat model", () => {
  test("splits assistant ops into narration/activity/narration/activity order", () => {
    const slices = splitAssistantOpsIntoDisplaySlices([
      { kind: "text", text: "First narration." },
      tool("a", "rg first"),
      tool("b", "sed first"),
      { kind: "text", text: "Second narration." },
      tool("c", "rg second"),
    ])

    expect(slices.map((slice) => [slice.kind, slice.ops.length])).toEqual([
      ["narration", 1],
      ["activity", 2],
      ["narration", 1],
      ["activity", 1],
    ])
  })

  test("keeps final narration after activity as a turn summary", () => {
    const turns = buildChatTurns([
      message("u1", "user", [{ kind: "text", text: "Fix it" }]),
      message("a1", "assistant", [
        { kind: "text", text: "I will inspect." },
        tool("a", "rg bug"),
        { kind: "text", text: "Fixed and verified." },
      ]),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]!.prompt?.text).toBe("Fix it")
    expect(turns[0]!.segments).toHaveLength(1)
    expect(turns[0]!.segments[0]!.narration).toHaveLength(1)
    expect(turns[0]!.segments[0]!.activities[0]!.items).toHaveLength(1)
    expect(turns[0]!.summary?.flatMap((op) => (op.kind === "text" ? [op.text] : []))).toEqual(["Fixed and verified."])
    expect(turns[0]!.stats.toolCount).toBe(1)
  })

  test("normalizes exec_command polling before building turn stats and segments", () => {
    const turns = buildChatTurns([
      message("u1", "user", [{ kind: "text", text: "Check types" }]),
      message("a1", "assistant", [
        { kind: "text", text: "I will run typecheck." },
        codexTool(
          "cmd-1",
          "exec_command",
          { cmd: "npx tsc --noEmit" },
          "Process running with session ID 40173\nOutput:\nstart\n",
        ),
        codexTool("stdin-1", "write_stdin", { session_id: 40173, chars: "" }, "Process exited with code 0\nOutput:\nPASS\n"),
        { kind: "text", text: "Typecheck passed." },
      ]),
    ])

    expect(turns[0]!.stats.toolCount).toBe(1)
    expect(turns[0]!.segments[0]!.activities[0]!.items).toHaveLength(1)
    expect(turns[0]!.summary?.flatMap((op) => (op.kind === "text" ? [op.text] : []))).toEqual(["Typecheck passed."])
  })

  test("transcript slices small assistant turns into interleaved message and activity entries", () => {
    const assistant = message("a1", "assistant", [
      { kind: "text", text: "First narration." },
      tool("a", "rg first"),
      tool("b", "sed first"),
      { kind: "text", text: "Second narration." },
      tool("c", "rg second"),
    ])

    const slices = splitAssistantMessageForTranscript(assistant)

    expect(slices.map((slice) => slice.kind)).toEqual(["message", "activity", "message", "message"])
    expect(slices[0]!.id).toBe("a1:narration-0")
    expect(slices[1]!.id).toBe("a1:activity-1")
    expect(slices[3]!.id).toBe("a1:activity-3")
  })

  test("transcript keeps single-tool activity segments inline as message slices", () => {
    const assistant = message("a1", "assistant", [
      { kind: "text", text: "First narration." },
      tool("a", "rg first"),
      { kind: "text", text: "Second narration." },
      tool("b", "rg second"),
    ])

    const slices = splitAssistantMessageForTranscript(assistant)

    expect(slices.map((slice) => slice.kind)).toEqual(["message", "message", "message", "message"])
    expect(slices[1]!.id).toBe("a1:activity-1")
    expect(slices[3]!.id).toBe("a1:activity-3")
  })

  test("transcript leaves dense assistant turns intact for turn-level rendering", () => {
    const assistant = message(
      "a1",
      "assistant",
      [
        { kind: "text", text: "First narration." },
        ...Array.from({ length: 9 }, (_, i) => tool(`t${i}`, `cmd ${i}`)),
        { kind: "text", text: "Final narration." },
      ],
    )

    const slices = splitAssistantMessageForTranscript(assistant)

    expect(slices.map((slice) => slice.kind)).toEqual(["message"])
    expect(slices[0]!.id).toBe("a1")
  })
})
