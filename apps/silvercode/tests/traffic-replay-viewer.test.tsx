import React from "react"
import { createRenderer } from "@silvery/test"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { TrafficReplayViewer } from "../src/components/TrafficReplayViewer.tsx"
import { replayTrafficLog } from "../src/traffic-log.ts"

const sessionId = "viewer-session" as SessionId
const turnId = "viewer-turn" as TurnId

function events(): AgentEvent[] {
  return [
    {
      kind: "session-init",
      sessionId,
      cwd: "/repo",
      model: "claude-sonnet",
      mode: "auto",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "2.1.119",
      apiKeySource: "OAuth",
      ts: 1,
    },
    { kind: "turn-start", sessionId, turnId, role: "assistant", ts: 2 },
    { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "hello", ts: 3 },
    {
      kind: "plan-update",
      sessionId,
      source: "codex-plan",
      entries: [{ id: "viewer-step", content: "Inspect traffic", status: "in_progress" }],
      ts: 4,
    },
    { kind: "turn-end", sessionId, turnId, stopReason: "end_turn", ts: 5 },
  ]
}

describe("TrafficReplayViewer", () => {
  test("renders a scrubbed TUI view with raw, normalized, and projected provenance", () => {
    const replay = replayTrafficLog(events(), { sourcePath: "/tmp/events.jsonl" })
    const render = createRenderer({ cols: 120, rows: 24 })
    const app = render(<TrafficReplayViewer replay={replay} selector={{ track: "plan" }} />)
    const text = app.text

    expect(text).toContain("traffic viewer")
    expect(text).toContain("/tmp/events.jsonl")
    expect(text).toContain("plan-update")
    expect(text).toContain("plan.updated")
    expect(text).toContain("projected leaves")
  })
})
