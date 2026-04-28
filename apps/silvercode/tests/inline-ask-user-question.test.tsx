/**
 * InlineAskUserQuestionPrompt — bead km-silvercode.askuserquestion-implement.
 *
 * Direct component test driven against a synthetic SessionHandle whose
 * store has `pendingQuestion` set. Mirrors the multi-option arm of
 * `inline-permission-prompt.test.tsx` — the surface is the same shape
 * (focused-session subscription, SelectList overlay, Esc cancels).
 */

import type { PendingQuestion, ToolUseId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { InlineAskUserQuestionPrompt } from "../src/components/InlineAskUserQuestionPrompt.tsx"
import { fakeSessionHandle } from "../storybook/support/fake-session-handle.ts"

const TOOL_ID = "tool-aq-1" as ToolUseId

describe("InlineAskUserQuestionPrompt", () => {
  test("renders the question + options + dispatches the picked label", async () => {
    const pending: PendingQuestion = {
      toolUseId: TOOL_ID,
      questions: [
        {
          question: "Which library should we use for date formatting?",
          header: "Library",
          options: [
            { label: "date-fns", description: "Tree-shakeable, modular" },
            { label: "dayjs", description: "2KB, immutable" },
          ],
        },
      ],
    }
    const handle = fakeSessionHandle({
      id: "s-aq",
      name: "AQ Session",
      state: {
        status: "tool-running",
        pendingQuestion: pending,
      },
    })

    const answers: Array<{
      sid: string
      toolUseId: string
      answers: Array<{ question: string; label: string }>
    }> = []
    const cancels: Array<{ sid: string; toolUseId: string }> = []

    const renderer = createRenderer({ cols: 80, rows: 24 })
    const app = renderer(
      <InlineAskUserQuestionPrompt
        focused={handle}
        sessions={[handle]}
        onAnswer={(sid, toolUseId, ans) => answers.push({ sid, toolUseId, answers: [...ans] })}
        onCancel={(sid, toolUseId) => cancels.push({ sid, toolUseId })}
      />,
    )

    expect(app.text).toContain("Question")
    expect(app.text).toContain("Library")
    expect(app.text).toContain("Which library should we use for date formatting?")
    expect(app.text).toContain("date-fns")
    expect(app.text).toContain("dayjs")

    // Down + Enter selects the second option.
    await app.press("ArrowDown")
    await app.press("Enter")

    expect(answers).toHaveLength(1)
    expect(answers[0]).toEqual({
      sid: "s-aq",
      toolUseId: TOOL_ID,
      answers: [
        {
          question: "Which library should we use for date formatting?",
          label: "dayjs",
        },
      ],
    })
    expect(cancels).toHaveLength(0)
  })

  test("Esc cancels the prompt", async () => {
    const pending: PendingQuestion = {
      toolUseId: TOOL_ID,
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
    }
    const handle = fakeSessionHandle({
      id: "s-aq",
      name: "AQ Session",
      state: { status: "tool-running", pendingQuestion: pending },
    })

    const answers: unknown[] = []
    const cancels: Array<{ sid: string; toolUseId: string }> = []

    const renderer = createRenderer({ cols: 80, rows: 24 })
    const app = renderer(
      <InlineAskUserQuestionPrompt
        focused={handle}
        sessions={[handle]}
        onAnswer={(sid, tid, ans) => answers.push({ sid, tid, ans })}
        onCancel={(sid, toolUseId) => cancels.push({ sid, toolUseId })}
      />,
    )

    expect(app.text).toContain("Approach")

    await app.press("Escape")

    expect(cancels).toHaveLength(1)
    expect(cancels[0]).toEqual({ sid: "s-aq", toolUseId: TOOL_ID })
    expect(answers).toHaveLength(0)
  })

  test("walks through multiple questions before dispatching", async () => {
    const pending: PendingQuestion = {
      toolUseId: TOOL_ID,
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
    }
    const handle = fakeSessionHandle({
      id: "s-aq",
      name: "AQ Session",
      state: { status: "tool-running", pendingQuestion: pending },
    })

    const answers: Array<{
      sid: string
      toolUseId: string
      answers: Array<{ question: string; label: string }>
    }> = []

    const renderer = createRenderer({ cols: 80, rows: 24 })
    const app = renderer(
      <InlineAskUserQuestionPrompt
        focused={handle}
        sessions={[handle]}
        onAnswer={(sid, toolUseId, ans) => answers.push({ sid, toolUseId, answers: [...ans] })}
        onCancel={() => {}}
      />,
    )

    // First question: pick "API key" (Down + Enter).
    expect(app.text).toContain("Auth method?")
    expect(app.text).toContain("(1 of 2)")
    await app.press("ArrowDown")
    await app.press("Enter")

    // Second question shows up.
    expect(app.text).toContain("Storage?")
    expect(app.text).toContain("(2 of 2)")
    expect(answers).toHaveLength(0) // not dispatched yet

    // Pick "SQLite" (no arrow — first option).
    await app.press("Enter")

    expect(answers).toHaveLength(1)
    expect(answers[0]?.answers).toEqual([
      { question: "Auth method?", label: "API key" },
      { question: "Storage?", label: "SQLite" },
    ])
  })

  test("renders nothing when there is no pendingQuestion", () => {
    const handle = fakeSessionHandle({
      id: "s-aq",
      name: "AQ Session",
      state: { status: "idle", pendingQuestion: null },
    })

    const renderer = createRenderer({ cols: 80, rows: 24 })
    const app = renderer(
      <InlineAskUserQuestionPrompt focused={handle} sessions={[handle]} onAnswer={() => {}} onCancel={() => {}} />,
    )

    // No "Question" label — overlay is null.
    expect(app.text).not.toContain("Question")
  })
})
