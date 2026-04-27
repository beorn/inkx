/**
 * Session-end variants — graceful exit and error exit.
 *
 * The agent CLI can leave a session for two reasons:
 *
 *   - graceful — the LLM finished a turn, the user disconnected, or the
 *     session was disposed cleanly. The wire emits a `session-end` event with
 *     a benign `stopReason` (often `"end_turn"` or absent).
 *   - error — the subprocess crashed, the API returned an error, or the
 *     stream closed mid-turn. The wire emits an `error` event followed by a
 *     `session-end` event whose `stopReason` carries the failure tag (e.g.
 *     `"SIGTERM"`, `"exit-1"`, `"api-error"`).
 *
 * Used by Layer 3 tests that assert the controller's status transitions
 * across normal teardown vs. unexpected failure. The graceful path should
 * leave the controller in a clean state with `closed = true`; the error
 * path must surface the message via the controller's error stream and still
 * flip `closed`.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-end-session" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

const initEvent: AgentEvent = {
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
}

/** Clean exit after a single completed turn. */
export const sessionEndGraceful: ReadonlyArray<AgentEvent> = [
  initEvent,
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "bye", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  { kind: "text-delta", sessionId: SESSION, turnId: ASSISTANT_TURN, blockIndex: 0, text: "ok", ts: 1030 },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1040 },
  { kind: "session-lifecycle", sessionId: SESSION, state: "ended", ts: 1050 },
  { kind: "session-end", sessionId: SESSION, stopReason: "end_turn", ts: 1060 },
]

/** Subprocess error mid-turn followed by terminal session-end. */
export const sessionEndError: ReadonlyArray<AgentEvent> = [
  initEvent,
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "boom", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  {
    kind: "error",
    sessionId: SESSION,
    message: "stream closed unexpectedly: EPIPE",
    ts: 1030,
  },
  { kind: "session-lifecycle", sessionId: SESSION, state: "ended", ts: 1040 },
  { kind: "session-end", sessionId: SESSION, stopReason: "exit-1", ts: 1050 },
]

/** Default export — the graceful variant for callers that don't need both. */
export const sessionEnd: ReadonlyArray<AgentEvent> = sessionEndGraceful
