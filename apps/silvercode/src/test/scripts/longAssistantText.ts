/**
 * Overflow stress: an assistant text-delta containing a 1KB unwrappable
 * blob (no whitespace).
 *
 * `longToolResult` exercises the same shape via a tool-result, but tool
 * results land inside `<ToolCall>` which collapses long content into an
 * accordion summary — the bleed never actually reaches the screen for
 * tool-result content. Assistant text-deltas, on the other hand, flow
 * through `<MarkdownView>` / `<Prose>` directly with `wrap="wrap"`, so
 * a missing `overflow="hidden"` ancestor or a missing `flexShrink/minWidth`
 * pair on the wrap chain produces a visible bleed past the side-panel
 * boundary.
 *
 * Use this script in any Layer 4 test that needs to verify the overflow
 * boundary at the App-tsx level (PaneGrid container's `overflow="hidden"`).
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-long-text" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

const BLOB_1K = "x".repeat(1024)

export const longAssistantText: ReadonlyArray<AgentEvent> = [
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
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "echo blob", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  { kind: "text-delta", sessionId: SESSION, turnId: ASSISTANT_TURN, blockIndex: 0, text: BLOB_1K, ts: 1030 },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1040 },
]
