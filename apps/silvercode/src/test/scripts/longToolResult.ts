/**
 * Overflow stress: a tool result containing a 1KB unwrappable blob (no
 * whitespace). Used to catch the "wide descendant pushes side panel
 * off-screen" regression — see side-panel-stays-visible.test.tsx for the
 * layout-level assertion; this script drives the same shape via a real
 * tool-result event through the session store.
 */

import type { AgentEvent, SessionId, ToolUseId, TurnId } from "@km/agent-harness"

const SESSION = "fake-long-result" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId
const TOOL_ID = "toolu_long_1" as ToolUseId

const BLOB_1K = "x".repeat(1024)

export const longToolResult: ReadonlyArray<AgentEvent> = [
  {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: ["Bash"],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  },
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "dump", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  {
    kind: "tool-use",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    id: TOOL_ID,
    name: "Bash",
    input: { command: "dump-huge-blob" },
    ts: 1030,
  },
  {
    kind: "tool-result",
    sessionId: SESSION,
    id: TOOL_ID,
    output: BLOB_1K,
    is_error: false,
    ts: 1100,
  },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1120 },
]
