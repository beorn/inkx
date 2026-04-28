/**
 * AskUserQuestion — bead km-silvercode.askuserquestion-implement.
 *
 * Pins the state-machine layer: when the agent invokes the `AskUserQuestion`
 * tool, the reducer must surface the question as a `pendingQuestion` on the
 * public {@link SessionState} so the UI can render an interactive picker
 * (mirroring InlinePermissionPrompt). When the matching `tool-result`
 * arrives later, the pending state must clear — the agent has already moved
 * on, and a stale picker would block the composer forever.
 *
 * The tool input schema mirrors Anthropic's `AskUserQuestionInput`:
 *
 *   {
 *     questions: [
 *       {
 *         question: "Which library should we use?",
 *         header: "Library",
 *         multiSelect?: false,
 *         options: [
 *           { label: "date-fns", description: "..." },
 *           { label: "dayjs",    description: "..." },
 *         ],
 *       },
 *       ...up to 4 questions
 *     ]
 *   }
 *
 * The reducer is the canonical place for this normalization — every
 * AgentSession backend (stream-json, SDK, ACP) emits `tool-use` events, so
 * pinning the surface here gives every UI consumer the same shape without
 * per-backend branching.
 */

import { describe, expect, test } from "vitest"
import { initialInternalState, publicView, reduce } from "../src/session-reducer.ts"
import type { AgentEvent, SessionId, ToolUseId, TurnId } from "../src/events.ts"

const sid = "s-test" as SessionId
const tid = (s: string) => s as TurnId
const toolUseId = (s: string) => s as ToolUseId

function askUserQuestionEvent(opts: {
  turnId: TurnId
  id: ToolUseId
  input: unknown
  ts?: number
}): Extract<AgentEvent, { kind: "tool-use" }> {
  return {
    kind: "tool-use",
    sessionId: sid,
    turnId: opts.turnId,
    id: opts.id,
    name: "AskUserQuestion",
    input: opts.input,
    ts: opts.ts ?? 1_000,
  }
}

describe("session-reducer — AskUserQuestion surfaces as pendingQuestion", () => {
  test("tool-use with name=AskUserQuestion populates state.pendingQuestion", () => {
    const s0 = initialInternalState()
    const event = askUserQuestionEvent({
      turnId: tid("a-1"),
      id: toolUseId("tool-1"),
      input: {
        questions: [
          {
            question: "Which library should we use for date formatting?",
            header: "Library",
            options: [
              { label: "date-fns", description: "Tree-shakeable, modular" },
              { label: "dayjs", description: "2KB, immutable, chainable" },
            ],
          },
        ],
      },
    })
    const [s1] = reduce(s0, event)
    const pub = publicView(s1)
    expect(pub.pendingQuestion).not.toBeNull()
    expect(pub.pendingQuestion?.toolUseId).toBe("tool-1")
    expect(pub.pendingQuestion?.questions).toHaveLength(1)
    expect(pub.pendingQuestion?.questions[0]?.question).toBe("Which library should we use for date formatting?")
    expect(pub.pendingQuestion?.questions[0]?.header).toBe("Library")
    expect(pub.pendingQuestion?.questions[0]?.options).toHaveLength(2)
    expect(pub.pendingQuestion?.questions[0]?.options[0]?.label).toBe("date-fns")
  })

  test("tool-result for the matching toolUseId clears pendingQuestion", () => {
    let s = initialInternalState()
    ;[s] = reduce(
      s,
      askUserQuestionEvent({
        turnId: tid("a-1"),
        id: toolUseId("tool-1"),
        input: {
          questions: [
            {
              question: "Approach?",
              header: "Approach",
              options: [
                { label: "A", description: "" },
                { label: "B", description: "" },
              ],
            },
          ],
        },
      }),
    )
    expect(publicView(s).pendingQuestion).not.toBeNull()
    ;[s] = reduce(s, {
      kind: "tool-result",
      sessionId: sid,
      id: toolUseId("tool-1"),
      output: { answers: { Approach: "A" } },
      ts: 2_000,
    })
    expect(publicView(s).pendingQuestion).toBeNull()
  })

  test("tool-result for a DIFFERENT toolUseId does not clear pendingQuestion", () => {
    let s = initialInternalState()
    ;[s] = reduce(
      s,
      askUserQuestionEvent({
        turnId: tid("a-1"),
        id: toolUseId("tool-1"),
        input: {
          questions: [
            {
              question: "Approach?",
              header: "Approach",
              options: [
                { label: "A", description: "" },
                { label: "B", description: "" },
              ],
            },
          ],
        },
      }),
    )
    ;[s] = reduce(s, {
      kind: "tool-result",
      sessionId: sid,
      id: toolUseId("other-tool"),
      output: { ok: true },
      ts: 2_000,
    })
    expect(publicView(s).pendingQuestion).not.toBeNull()
  })

  test("non-AskUserQuestion tool-use leaves pendingQuestion alone", () => {
    const s0 = initialInternalState()
    const [s1] = reduce(s0, {
      kind: "tool-use",
      sessionId: sid,
      turnId: tid("a-1"),
      id: toolUseId("tool-bash-1"),
      name: "Bash",
      input: { command: "ls" },
      ts: 1_000,
    })
    expect(publicView(s1).pendingQuestion).toBeNull()
  })

  test("pendingQuestion handles multiple questions in one tool call", () => {
    const s0 = initialInternalState()
    const [s1] = reduce(
      s0,
      askUserQuestionEvent({
        turnId: tid("a-1"),
        id: toolUseId("tool-1"),
        input: {
          questions: [
            {
              question: "Auth method?",
              header: "Auth",
              options: [
                { label: "OAuth", description: "" },
                { label: "API key", description: "" },
              ],
            },
            {
              question: "Storage?",
              header: "DB",
              options: [
                { label: "SQLite", description: "" },
                { label: "Postgres", description: "" },
              ],
            },
          ],
        },
      }),
    )
    expect(publicView(s1).pendingQuestion?.questions).toHaveLength(2)
  })

  test("malformed AskUserQuestion input does not crash; pendingQuestion stays null", () => {
    // Defensive parse: the agent could (in theory) emit a malformed input.
    // Reducer must be total — never throw, never set garbage state.
    const s0 = initialInternalState()
    const [s1] = reduce(s0, {
      kind: "tool-use",
      sessionId: sid,
      turnId: tid("a-1"),
      id: toolUseId("tool-1"),
      name: "AskUserQuestion",
      input: { questions: "not-an-array" },
      ts: 1_000,
    })
    expect(publicView(s1).pendingQuestion).toBeNull()
  })

  test("initial state has pendingQuestion === null", () => {
    expect(publicView(initialInternalState()).pendingQuestion).toBeNull()
  })
})
