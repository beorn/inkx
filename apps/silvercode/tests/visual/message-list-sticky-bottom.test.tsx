/**
 * ChatBlockList stickyBottom auto-follow.
 *
 * Smoke-tests the wiring of `follow="end"` on the ListView inside
 * ChatBlockList by driving the real <App/> through a multi-turn scripted
 * session with more turns than fit in the viewport. After all turns
 * complete, the most recent assistant message must be visible — i.e.
 * the viewport auto-followed the tail.
 *
 * The semantic behaviour of `follow="end"` is exhaustively tested in
 * `vendor/silvery/tests/features/listview-followpolicy-split.test.tsx`. This
 * test is the silvercode-side wiring smoke: the prop is in place, the
 * real chat stream stays pinned to the latest assistant turn.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-sticky-session" as SessionId

function turn(n: number, user: string, assistant: string, baseTs: number): AgentEvent[] {
  const userTurn = `u${n}` as TurnId
  const assistantTurn = `a${n}` as TurnId
  return [
    { kind: "user-message", sessionId: SESSION, turnId: userTurn, text: user, ts: baseTs },
    { kind: "turn-start", sessionId: SESSION, turnId: assistantTurn, role: "assistant", ts: baseTs + 10 },
    {
      kind: "text-delta",
      sessionId: SESSION,
      turnId: assistantTurn,
      blockIndex: 0,
      text: assistant,
      ts: baseTs + 20,
    },
    {
      kind: "turn-end",
      sessionId: SESSION,
      turnId: assistantTurn,
      stopReason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
      ts: baseTs + 30,
    },
  ]
}

const manyTurns: ReadonlyArray<AgentEvent> = [
  {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  },
  // Generate enough turns that they exceed the viewport — each turn produces
  // two messages (user + assistant) so 8 turns = 16 messages.
  ...turn(1, "ping 1", "pong 1", 1010),
  ...turn(2, "ping 2", "pong 2", 1100),
  ...turn(3, "ping 3", "pong 3", 1200),
  ...turn(4, "ping 4", "pong 4", 1300),
  ...turn(5, "ping 5", "pong 5", 1400),
  ...turn(6, "ping 6", "pong 6", 1500),
  ...turn(7, "ping 7", "pong 7", 1600),
  ...turn(8, "FINAL ping", "FINAL pong", 1700),
]

const streamingTail: ReadonlyArray<AgentEvent> = [
  {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  },
  ...turn(1, "ping 1", "pong 1", 1010),
  ...turn(2, "ping 2", "pong 2", 1100),
  ...turn(3, "ping 3", "pong 3", 1200),
  ...turn(4, "ping 4", "pong 4", 1300),
  ...turn(5, "ping 5", "pong 5", 1400),
  ...turn(6, "ping 6", "pong 6", 1500),
  ...turn(7, "ping 7", "pong 7", 1600),
  { kind: "user-message", sessionId: SESSION, turnId: "u8" as TurnId, text: "FINAL ping", ts: 1700 },
  { kind: "turn-start", sessionId: SESSION, turnId: "a8" as TurnId, role: "assistant", ts: 1710 },
  {
    kind: "text-delta",
    sessionId: SESSION,
    turnId: "a8" as TurnId,
    blockIndex: 0,
    text: "FINAL start",
    ts: 1720,
  },
]

const streamingTailWithPlan: ReadonlyArray<AgentEvent> = [
  ...streamingTail,
  {
    kind: "plan-update",
    sessionId: SESSION,
    source: "codex-plan",
    entries: [
      { content: "Inspect current state", status: "completed" },
      { content: "Keep sticky scroll pinned while the tail grows", status: "in_progress" },
    ],
    ts: 1725,
  },
]

describe("ChatBlockList follow-end auto-follow (km-silvercode)", () => {
  test("when conversation fits in viewport, latest assistant message is visible", async () => {
    // With a generous 60-row viewport, all 16 messages fit easily — the
    // latest must be present. This is the baseline "no scroll required"
    // case: regression-protection that adding stickyBottom didn't break
    // the simple case where every message fits.
    const s = await renderScenario({ script: manyTurns, cols: 120, rows: 60 })
    try {
      expect(s.text, "FINAL pong must be visible in the rendered frame").toContain("FINAL pong")
      expect(s.text, "FINAL ping must be visible in the rendered frame").toContain("FINAL ping")
    } finally {
      s.dispose()
    }
  })

  test("when conversation overflows viewport, latest assistant message is visible", async () => {
    const s = await renderScenario({ script: manyTurns, cols: 120, rows: 18 })
    try {
      expect(s.text, "FINAL pong must remain visible at the rendered tail").toContain("FINAL pong")
      expect(s.text, "oldest turn should have scrolled out of the visible viewport").not.toContain("pong 1")
    } finally {
      s.dispose()
    }
  })

  test("when the visible tail assistant item grows, auto-follow keeps the newest rows visible", async () => {
    const s = await renderScenario({ script: streamingTail, cols: 120, rows: 18 })
    try {
      expect(s.text, "initial streaming tail should be visible").toContain("FINAL start")
      s.emit({
        kind: "text-delta",
        sessionId: SESSION,
        turnId: "a8" as TurnId,
        blockIndex: 0,
        text: "\nmore tail 1\nmore tail 2\nFINAL grown tail",
        ts: 1730,
      })
      const frame = s.resample()
      expect(frame.text, "grown streaming tail should remain visible").toContain("FINAL grown tail")
    } finally {
      s.dispose()
    }
  })

  test("when bottom plan chrome is visible, growing assistant text stays above the composer", async () => {
    const s = await renderScenario({ script: streamingTailWithPlan, cols: 120, rows: 22 })
    try {
      expect(s.text, "plan drawer should be visible in the bottom chrome").toContain("Keep sticky scroll pinned")
      s.emit({
        kind: "text-delta",
        sessionId: SESSION,
        turnId: "a8" as TurnId,
        blockIndex: 0,
        text: "\nmore tail 1\nmore tail 2\nFINAL grown tail above composer",
        ts: 1730,
      })
      const frame = s.resample()
      const tailRow = frame.lines.findIndex((line) => line.includes("FINAL grown tail above composer"))
      const planRow = frame.lines.findIndex((line) => line.includes("Keep sticky scroll pinned"))
      const composerRow = frame.lines.findIndex((line) => line.includes(">"))
      expect(tailRow, frame.text).toBeGreaterThanOrEqual(0)
      expect(planRow, frame.text).toBeGreaterThan(tailRow)
      expect(composerRow, frame.text).toBeGreaterThan(planRow)
    } finally {
      s.dispose()
    }
  })
})
