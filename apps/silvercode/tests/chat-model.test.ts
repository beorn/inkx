import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  createSessionStore,
  createStreamJsonParser,
  type AgentEvent,
  type MessageEntry,
  type MessageOp,
  type SessionState,
  type ToolResultEntry,
  type ToolUseId,
  type TurnId,
} from "@km/agent-harness"
import { claudeProjectsRoot, codexSessionsRoot } from "@km/config/paths"
import {
  activityRunsFromOps,
  buildChatTurns,
  latestRunningActivityRun,
  splitAssistantMessageForTranscript,
  splitAssistantOpsIntoDisplaySlices,
} from "../src/chat-model.ts"
import { replayCodexTranscriptFile } from "../src/codex-resume.ts"

function tool(
  id: string,
  command: string,
  result: ToolResultEntry | undefined = { id: id as ToolUseId, output: "ok" },
): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name: "Bash", input: { command } },
    result,
  }
}

function runningTool(id: string, command: string): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name: "Bash", input: { command } },
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

type HistoricalReplayResult = "checked" | "skipped-empty"

function historicalRoot(envName: string, fallback: () => string): string {
  return process.env[envName] ?? fallback()
}

function collectTranscriptFiles(root: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const visit = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      try {
        if (statSync(path).isDirectory()) {
          visit(path)
          continue
        }
      } catch {
        continue
      }
      if (accept(path)) out.push(path)
    }
  }
  visit(root)
  return out.sort()
}

function replayClaudeTranscriptFile(path: string): SessionState {
  const store = createSessionStore()
  const parser = createStreamJsonParser((event: AgentEvent) => store.apply(event))
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.length > 0) parser.push(line)
  }
  const state = store.state.get()
  const last = state.messages.at(-1)
  if (last && state.status !== "idle" && state.status !== "ended") {
    store.apply({
      kind: "turn-end",
      sessionId: state.sessionId ?? ("historical-claude" as never),
      turnId: last.id as TurnId,
      stopReason: "end_turn",
      ts: Date.now(),
    })
  }
  return store.state.get()
}

function replayCodexHistoricalTranscript(path: string): SessionState {
  const store = createSessionStore()
  replayCodexTranscriptFile(store, basename(path, ".jsonl"), path)
  return store.state.get()
}

function expectHistoricalTranscriptProjects(label: string, state: SessionState): HistoricalReplayResult {
  const conversationalMessages = state.messages.filter((m) => m.role === "user" || m.role === "assistant")
  if (conversationalMessages.length === 0) return "skipped-empty"

  expect(state.lastError, `${label}: replay should not surface parser errors`).toBeNull()
  expect(
    conversationalMessages.some((m) => m.role === "user" && m.text.trimStart().startsWith("<turn_aborted>")),
    `${label}: codex control records should not render as user prompts`,
  ).toBe(false)

  const turns = buildChatTurns(state.messages)
  expect(turns.length, `${label}: chat projection should produce at least one turn`).toBeGreaterThan(0)
  expect(
    turns.every((turn) => turn.turnKey.length > 0),
    `${label}: every projected chat turn needs a stable key`,
  ).toBe(true)

  if (state.plan) {
    expect(
      state.plan.entries.every((entry) => entry.content.trim().length > 0),
      `${label}: plan entries should have renderable content`,
    ).toBe(true)
    expect(
      state.todos.map((todo) => todo.content),
      `${label}: compatibility todos should mirror canonical plan entry text`,
    ).toEqual(state.plan.entries.map((entry) => entry.content))
  }

  return "checked"
}

describe("chat model", () => {
  test("normalizes activity runs and lifecycle status for rendering", () => {
    const activities = activityRunsFromOps([
      { kind: "thinking", text: "Inspecting context" },
      runningTool("running", "bun test"),
      tool("failed", "bun lint", { id: "failed" as ToolUseId, output: "bad", is_error: true }),
      tool("completed", "npx tsc --noEmit"),
    ])

    expect(activities.map((activity) => [activity.kind, activity.status, activity.id])).toEqual([
      ["reasoning", "completed", "reasoning-0"],
      ["tool", "running", "running"],
      ["tool", "failed", "failed"],
      ["tool", "completed", "completed"],
    ])
    expect(latestRunningActivityRun(activities)?.id).toBe("running")
  })

  test("latest running activity run follows the last unresolved operation", () => {
    const activities = activityRunsFromOps([
      runningTool("first", "bun test"),
      tool("done", "rg todo"),
      runningTool("second", "npx tsc --noEmit"),
    ])

    expect(latestRunningActivityRun(activities)?.id).toBe("second")
  })

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

  test("groups multiple prompts into the active idle-delimited chat turn", () => {
    const turns = buildChatTurns([
      message("u1", "user", [{ kind: "text", text: "Start fixing it" }]),
      message("a1", "assistant", [{ kind: "text", text: "I am investigating." }]),
      message("u2", "user", [{ kind: "text", text: "Also check the docs" }]),
      message("a2", "assistant", [tool("a", "rg docs")]),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]!.turnKey).toBe("u1")
    expect(turns[0]!.prompts.map((prompt) => prompt.text)).toEqual(["Start fixing it", "Also check the docs"])
    expect(turns[0]!.segments).toHaveLength(2)
    expect(turns[0]!.stats.toolCount).toBe(1)
  })

  test("starts a new chat turn after assistant idleness", () => {
    const turns = buildChatTurns([
      message("u1", "user", [{ kind: "text", text: "First" }]),
      { ...message("a1", "assistant", [{ kind: "text", text: "Done." }]), stopReason: "end_turn" },
      message("u2", "user", [{ kind: "text", text: "Second" }]),
    ])

    expect(turns.map((turn) => turn.turnKey)).toEqual(["u1", "u2"])
    expect(turns.map((turn) => turn.prompts.map((prompt) => prompt.text))).toEqual([["First"], ["Second"]])
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
        codexTool(
          "stdin-1",
          "write_stdin",
          { session_id: 40173, chars: "" },
          "Process exited with code 0\nOutput:\nPASS\n",
        ),
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
    const assistant = message("a1", "assistant", [
      { kind: "text", text: "First narration." },
      ...Array.from({ length: 9 }, (_, i) => tool(`t${i}`, `cmd ${i}`)),
      { kind: "text", text: "Final narration." },
    ])

    const slices = splitAssistantMessageForTranscript(assistant)

    expect(slices.map((slice) => slice.kind)).toEqual(["message"])
    expect(slices[0]!.id).toBe("a1")
  })

  const historicalTest = process.env.SILVERCODE_HISTORICAL_TRANSCRIPTS === "1" ? test : test.skip

  historicalTest(
    "local historical Claude and Codex transcripts replay into the chat projection",
    () => {
      const claudeRoot = historicalRoot("SILVERCODE_HISTORICAL_CLAUDE_ROOT", claudeProjectsRoot)
      const codexRoot = historicalRoot("SILVERCODE_HISTORICAL_CODEX_ROOT", codexSessionsRoot)
      const claudeFiles = collectTranscriptFiles(claudeRoot, (path) => path.endsWith(".jsonl"))
      const codexFiles = collectTranscriptFiles(
        codexRoot,
        (path) => basename(path).startsWith("rollout-") && path.endsWith(".jsonl"),
      )
      const failures: string[] = []
      let checked = 0
      let skipped = 0

      for (const path of claudeFiles) {
        try {
          const result = expectHistoricalTranscriptProjects(`claude ${path}`, replayClaudeTranscriptFile(path))
          if (result === "checked") checked++
          else skipped++
        } catch (err) {
          failures.push(`claude ${path}: ${(err as Error).message}`)
        }
      }

      for (const path of codexFiles) {
        try {
          const result = expectHistoricalTranscriptProjects(`codex ${path}`, replayCodexHistoricalTranscript(path))
          if (result === "checked") checked++
          else skipped++
        } catch (err) {
          failures.push(`codex ${path}: ${(err as Error).message}`)
        }
      }

      expect(failures, failures.join("\n")).toEqual([])
      expect(
        checked,
        `No local historical transcripts with chat messages found under ${claudeRoot} or ${codexRoot}; skipped ${skipped} empty transcripts.`,
      ).toBeGreaterThan(0)
    },
    180_000,
  )
})
