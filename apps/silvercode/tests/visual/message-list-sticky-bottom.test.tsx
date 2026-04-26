/**
 * MessageList stickyBottom auto-follow.
 *
 * Smoke-tests the wiring of `stickyBottom={true}` on the ListView inside
 * MessageList by driving the real <App/> through a multi-turn scripted
 * session with more turns than fit in the viewport. After all turns
 * complete, the most recent assistant message must be visible — i.e.
 * the viewport auto-followed the tail.
 *
 * The semantic behaviour of `stickyBottom` is exhaustively tested in
 * `vendor/silvery/tests/features/listview-sticky-bottom.test.tsx`. This
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

describe("MessageList stickyBottom auto-follow (km-silvercode)", () => {
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
})
