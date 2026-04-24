/**
 * Smallest round-trip: session-init → user "hi" → assistant text-delta "Hi!"
 * → turn-end.
 *
 * Used by Layer 3 tests that just need a well-formed event stream (not the
 * details of tool calls / permissions). Tests that assert on the rendered
 * assistant text should prefer this script.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-hello-session" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

export const helloWorld: ReadonlyArray<AgentEvent> = [
  {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: ["Bash", "Read"],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  },
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "hi", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  { kind: "text-delta", sessionId: SESSION, turnId: ASSISTANT_TURN, blockIndex: 0, text: "Hi", ts: 1030 },
  { kind: "text-delta", sessionId: SESSION, turnId: ASSISTANT_TURN, blockIndex: 0, text: "!", ts: 1040 },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1050 },
]
