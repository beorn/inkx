/**
 * Permission round-trip: init → user → permission-request → (consumer approves)
 * → permission-decision → assistant text → turn-end.
 *
 * The consumer is expected to drive the approval via the controller's
 * `respondPermission()` — that write is what makes the session emit the
 * permission-decision event. This script contains only the LLM side; the
 * approval happens in the test.
 *
 * Used for permission-inbox flow tests and to assert that status correctly
 * moves through idle → thinking → awaiting-permission → thinking → idle.
 */

import type { AgentEvent, PermissionRequestId, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-permission" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId
export const FAKE_PERMISSION_ID = "perm_1" as PermissionRequestId

/** Events the LLM side emits BEFORE the consumer approves. */
export const permissionRequestBefore: ReadonlyArray<AgentEvent> = [
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
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "run dangerous", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  {
    kind: "permission-request",
    sessionId: SESSION,
    requestId: FAKE_PERMISSION_ID,
    tool: "Bash",
    args: { command: "rm -rf /" },
    ts: 1030,
  },
]

/** Events the LLM side emits AFTER the consumer approves. */
export const permissionRequestAfter: ReadonlyArray<AgentEvent> = [
  {
    kind: "permission-decision",
    sessionId: SESSION,
    requestId: FAKE_PERMISSION_ID,
    approved: true,
    ts: 1100,
  },
  {
    kind: "text-delta",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    blockIndex: 0,
    text: "Done.",
    ts: 1110,
  },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1120 },
]

/** Convenience: all events concatenated, for when the test drives approval inline via emit(). */
export const permissionRequest: ReadonlyArray<AgentEvent> = [
  ...permissionRequestBefore,
  ...permissionRequestAfter,
]
