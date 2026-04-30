/**
 * InlineAskUserQuestionPrompt — renders the focused session's pending
 * AskUserQuestion call as an interactive picker above the
 * SessionPromptComposer.
 *
 * Mirrors the InlinePermissionPrompt pattern: the overlay sits in the
 * bottom chrome, claims keyboard focus while active, and is dismissed by
 * either picking an option (Enter on the focused item) or pressing Escape
 * (cancelled). Composer is disabled while the overlay is up so in-flight
 * keystrokes can't accidentally answer the prompt.
 *
 * Multi-question UX (v1): questions are answered one at a time, oldest
 * first. After each pick, the cursor advances to the next unanswered
 * question. When all are answered, the overlay dispatches the full answer
 * map and clears.
 *
 * The agent doesn't actually receive the answer through a synthetic
 * tool_result — the Claude Code stream-json CLI manages the tool-call
 * loop server-side and we can't inject results into in-flight turns.
 * Instead the controller routes the user's answers as a follow-up user
 * message describing the choices, and clears `pendingQuestion` via a
 * synthetic tool-result event so the UI proceeds. The agent reads the
 * follow-up and continues its turn naturally.
 *
 * Bead: km-silvercode.askuserquestion-implement.
 */
import React, { useEffect, useMemo, useState } from "react"
import { Box, Muted, SelectList, Text } from "silvery"
import { useInput } from "silvery/runtime"
import type { AskUserQuestionItem, PendingQuestion } from "@km/agent-harness"
import type { SessionHandle } from "../controller.ts"

export type AskUserQuestionAnswer = {
  /** The question text — used as the key in the answers map. */
  question: string
  /** The option label the user picked. */
  label: string
}

export function InlineAskUserQuestionPrompt({
  focused,
  sessions,
  onAnswer,
  onCancel,
}: {
  /** Focused session — only this session's pending question surfaces. */
  focused?: SessionHandle
  /** All sessions — passed for parity with InlinePermissionPrompt; only `focused` is read. */
  sessions: SessionHandle[]
  /**
   * Called when the user has answered every question in the call.
   * Answers carry the question text + chosen label so callers can build
   * the upstream `{ answers: { [question]: label } }` shape.
   */
  onAnswer: (sessionId: string, toolUseId: string, answers: AskUserQuestionAnswer[]) => void
  /** Called when the user presses Escape — answers are abandoned. */
  onCancel: (sessionId: string, toolUseId: string) => void
}): React.ReactElement | null {
  // Subscribe to the focused session's store; re-render on every state
  // tick so a fresh tool_result event clears the overlay immediately.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!focused) return
    return focused.store.state.subscribe(() => setTick((t) => t + 1))
  }, [focused])

  const current: { sessionId: string; question: PendingQuestion } | undefined = useMemo(() => {
    if (!focused) return undefined
    const state = focused.store.state.get()
    if (!state.pendingQuestion) return undefined
    return { sessionId: focused.id, question: state.pendingQuestion }
    // `sessions` + `tick` together force recompute on store + focus changes.
  }, [focused, sessions, tick])

  // Per-overlay-instance accumulated answers + cursor through questions.
  // Reset whenever a new toolUseId surfaces so a stale half-answered
  // session can't bleed into the next prompt.
  const [collected, setCollected] = useState<AskUserQuestionAnswer[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [optionCursor, setOptionCursor] = useState(0)

  const currentToolId = current?.question.toolUseId
  // Reset state when the toolUseId changes (new pending question).
  useEffect(() => {
    setCollected([])
    setQuestionIndex(0)
    setOptionCursor(0)
  }, [currentToolId])

  const activeQuestion: AskUserQuestionItem | undefined = current?.question.questions[questionIndex]

  const optionItems = useMemo(() => {
    if (!activeQuestion) return []
    return activeQuestion.options.map((o, i) => ({
      label: o.label,
      value: String(i),
    }))
  }, [activeQuestion])

  // Esc cancels the whole prompt. SelectList owns Enter (fires onSelect on
  // the focused row) — we deliberately avoid double-handling Enter here.
  useInput(
    (_input, key) => {
      if (!current) return
      if (key.escape) {
        onCancel(current.sessionId, current.question.toolUseId as unknown as string)
      }
    },
    { isActive: !!current },
  )

  if (!current || !activeQuestion) return null

  const totalQuestions = current.question.questions.length
  const isLast = questionIndex === totalQuestions - 1
  const progress = totalQuestions > 1 ? ` (${questionIndex + 1} of ${totalQuestions})` : ""

  const handleSelect = (opt: { value: string }): void => {
    const idx = Number(opt.value)
    const o = activeQuestion.options[idx]
    if (!o) return
    const nextAnswers: AskUserQuestionAnswer[] = [...collected, { question: activeQuestion.question, label: o.label }]
    if (isLast) {
      onAnswer(current.sessionId, current.question.toolUseId as unknown as string, nextAnswers)
      // Local reset — the parent will clear `pendingQuestion` via the
      // controller's synthetic tool-result, which unmounts this overlay.
      setCollected([])
      setQuestionIndex(0)
      setOptionCursor(0)
      return
    }
    setCollected(nextAnswers)
    setQuestionIndex(questionIndex + 1)
    setOptionCursor(0)
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$primary">
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">
          Question
        </Text>
        <Muted>·</Muted>
        <Text bold>{activeQuestion.header}</Text>
        {progress.length > 0 && <Muted>{progress}</Muted>}
      </Box>
      <Text>{activeQuestion.question}</Text>
      <Box flexDirection="column">
        <SelectList
          items={optionItems}
          isActive
          highlightedIndex={optionCursor}
          onHighlight={setOptionCursor}
          onSelect={handleSelect}
        />
        <Muted>Enter to select · Esc to cancel</Muted>
      </Box>
    </Box>
  )
}
