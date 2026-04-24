/**
 * Bash tool round-trip: session-init → user → assistant tool_use(Bash, git
 * status) → tool_result → assistant text → turn-end.
 *
 * Exercises the tool-use / tool-result pairing in the session store. Useful
 * for testing ToolCallBlock rendering and turn status transitions (thinking
 * → tool-running → thinking → idle).
 */

import type { AgentEvent, SessionId, ToolUseId, TurnId } from "@km/agent-harness"

const SESSION = "fake-bash-session" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId
const TOOL_ID = "toolu_bash_1" as ToolUseId

export const bashTool: ReadonlyArray<AgentEvent> = [
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
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "run git status", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  {
    kind: "tool-use",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    id: TOOL_ID,
    name: "Bash",
    input: { command: "git status" },
    ts: 1030,
  },
  {
    kind: "tool-result",
    sessionId: SESSION,
    id: TOOL_ID,
    output: "On branch main\nnothing to commit, working tree clean",
    is_error: false,
    ts: 1100,
  },
  {
    kind: "text-delta",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    blockIndex: 1,
    text: "Clean tree.",
    ts: 1110,
  },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1120 },
]
