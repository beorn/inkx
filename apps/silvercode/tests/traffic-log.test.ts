import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { AgentEvent, PermissionRequestId, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import {
  exportTrafficReplaySpanJsonl,
  renderTrafficReplayInspector,
  replayTrafficLog,
  replayTrafficLogFile,
  selectTrafficReplaySpan,
} from "../src/traffic-log.ts"

const sessionId = "traffic-session" as SessionId
const turnId = "turn-1" as TurnId
const permissionId = "perm-1" as PermissionRequestId

function events(): AgentEvent[] {
  return [
    {
      kind: "session-init",
      sessionId,
      cwd: "/repo",
      model: "claude-sonnet",
      mode: "auto",
      tools: ["Read"],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "2.1.119",
      apiKeySource: "OAuth",
      ts: 1,
    },
    { kind: "turn-start", sessionId, turnId, role: "assistant", ts: 2 },
    { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "See [parse.ts](/tmp/parse.ts:", ts: 3 },
    { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "572).", ts: 4 },
    { kind: "thinking-delta", sessionId, turnId, blockIndex: 1, text: "Check", ts: 5 },
    { kind: "thinking-delta", sessionId, turnId, blockIndex: 1, text: " docs", ts: 6 },
    {
      kind: "permission-request",
      sessionId,
      requestId: permissionId,
      tool: "Read",
      args: { file_path: "/tmp/parse.ts" },
      options: [{ optionId: "allow" as never, name: "Allow", kind: "allow_once" }],
      ts: 7,
    },
    { kind: "permission-decision", sessionId, requestId: permissionId, approved: true, ts: 8 },
    {
      kind: "plan-update",
      sessionId,
      source: "codex-plan",
      entries: [{ id: "step-1", content: "Inspect replay", status: "in_progress" }],
      ts: 9,
    },
    { kind: "turn-end", sessionId, turnId, stopReason: "end_turn", ts: 10 },
  ]
}

describe("traffic log replay", () => {
  test("replays raw JSONL into normalized events, projected leaves, and provenance frames", () => {
    const dir = mkdtempSync(join(tmpdir(), "silvercode-traffic-"))
    const path = join(dir, "traffic.jsonl")
    writeFileSync(
      path,
      `${events()
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`,
    )

    const replay = replayTrafficLogFile(path)

    expect(replay.sourcePath).toBe(path)
    expect(replay.rawEvents).toHaveLength(10)
    expect(replay.normalizedEvents.map((event) => event.type)).toContain("plan.updated")
    expect(replay.projectedLeaves.map((leaf) => leaf.type)).toEqual([
      "session-status",
      "unknown",
      "message",
      "thought",
      "permission",
      "plan-update",
      "usage",
    ])
    expect(replay.projectedLeaves.find((leaf) => leaf.type === "message")?.props).toEqual({
      role: "assistant",
      text: "See [parse.ts](/tmp/parse.ts:572).",
    })
    expect(replay.projectedLeaves.find((leaf) => leaf.type === "thought")?.props).toEqual({ text: "Check docs" })
    expect(replay.frames[2]?.normalizedEventIds).toEqual(replay.frames[3]?.normalizedEventIds)
    expect(replay.frames[2]?.projectedLeafIds).toEqual(replay.frames[3]?.projectedLeafIds)
  })

  test("is deterministic for the same event ledger", () => {
    const first = replayTrafficLog(events())
    const second = replayTrafficLog(events())

    expect(second).toEqual(first)
  })

  test("scrubs by track and exports the selected raw span as JSONL", () => {
    const replay = replayTrafficLog(events())

    const span = selectTrafficReplaySpan(replay, { track: "plan" })

    expect(span.rawEvents.map((event) => event.kind)).toEqual(["plan-update"])
    expect(span.normalizedEvents.map((event) => event.type)).toEqual(["plan.updated"])
    expect(span.projectedLeaves.map((leaf) => leaf.type)).toEqual(["plan-update"])
    expect(exportTrafficReplaySpanJsonl(span)).toBe(`${JSON.stringify(events()[8])}\n`)
  })

  test("scrubs by raw range, permission request, and plan step ids", () => {
    const replay = replayTrafficLog(events())

    expect(selectTrafficReplaySpan(replay, { rawFrom: 2, rawTo: 3 }).rawEvents.map((event) => event.kind)).toEqual([
      "text-delta",
      "text-delta",
    ])
    expect(selectTrafficReplaySpan(replay, { permissionId }).rawEvents.map((event) => event.kind)).toEqual([
      "permission-request",
      "permission-decision",
    ])
    expect(selectTrafficReplaySpan(replay, { planStepId: "step-1" }).rawEvents.map((event) => event.kind)).toEqual([
      "plan-update",
    ])
  })

  test("renders an inspectable replay view with raw, normalized, and projection provenance", () => {
    const replay = replayTrafficLog(events())
    const view = renderTrafficReplayInspector(replay, { rawFrom: 2, rawTo: 3 })

    expect(view).toContain("traffic viewer")
    expect(view).toContain("selector raw=2..3")
    expect(view).toContain("2 text-delta")
    expect(view).toContain("message.block.added")
    expect(view).toContain("leaf:text-delta:3:traffic-session:turn-1:0:text")
  })
})
