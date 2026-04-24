/**
 * Queued-three scenario: three messages typed while Claude is mid-turn
 * end up in the per-session queue buffer. Verifies the side panel's
 * "Queued" indicator shows "3" and the queue editor (when focused)
 * displays the three paragraphs stacked.
 *
 * The queue batching itself is already covered by queue-batching.test.tsx
 * (Layer 3, logic). This script is for VISUAL tests — side-panel row
 * visibility, queue-editor layout, cursor position.
 *
 * Driven differently from other scripts — the LLM side only emits the
 * init + turn-start (enough for controller to register non-idle state).
 * The consumer-side `controller.send()` calls happen in the test, not
 * here, because the queue-filling is controller-driven, not event-driven.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-queued-three" as SessionId
const ASSISTANT_TURN = "a1" as TurnId

/** LLM events. Leaves status as "thinking" so controller.send queues. */
export const queuedThreeLlmSide: ReadonlyArray<AgentEvent> = [
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
  { kind: "user-message", sessionId: SESSION, turnId: "u0" as TurnId, text: "first request", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
]

/** The three messages the user types into the queue (to be sent via controller.send). */
export const queuedThreeUserMessages: readonly [string, string, string] = [
  "please also check README",
  "and update CHANGELOG",
  "run tests when done",
]
