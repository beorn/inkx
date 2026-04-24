/**
 * Three-turn conversation: init → (user → assistant) × 3.
 *
 * Used for tests that assert behaviour across multiple back-and-forth turns
 * — e.g. token accumulation, status transitions between idle and thinking,
 * or that per-turn state doesn't leak across turn boundaries.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-multi-turn" as SessionId

function turn(n: number, user: string, assistant: string, baseTs: number): AgentEvent[] {
  const userTurn = `u${n}` as TurnId
  const assistantTurn = `a${n}` as TurnId
  return [
    { kind: "user-message", sessionId: SESSION, turnId: userTurn, text: user, ts: baseTs },
    { kind: "turn-start", sessionId: SESSION, turnId: assistantTurn, role: "assistant", ts: baseTs + 10 },
    { kind: "text-delta", sessionId: SESSION, turnId: assistantTurn, blockIndex: 0, text: assistant, ts: baseTs + 20 },
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

export const multiTurn: ReadonlyArray<AgentEvent> = [
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
  ...turn(1, "one", "first.", 1010),
  ...turn(2, "two", "second.", 1100),
  ...turn(3, "three", "third.", 1200),
]
