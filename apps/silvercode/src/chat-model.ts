import type { MessageEntry, MessageOp, ToolResultEntry } from "@km/agent-harness"

export type ChatActivityItem = {
  op: MessageOp
  index: number
}

export type ChatActivitySegment = {
  id: string
  items: ChatActivityItem[]
}

export type ChatTurnSegment = {
  id: string
  narration: MessageOp[]
  activities: ChatActivitySegment[]
}

export type ChatTurn = {
  /** UI projection key for an idle-delimited Silvercode turn. Not a provider id. */
  turnKey: string
  /** Back-compat alias for call sites that still key by `id`. */
  id: string
  /** Prompts submitted inside this idle-delimited turn, in stream order. */
  prompts: MessageEntry[]
  /** First prompt in the turn, retained for existing renderers. */
  prompt?: MessageEntry
  segments: ChatTurnSegment[]
  summary?: MessageOp[]
  stats: {
    toolCount: number
    thinkingCount: number
  }
}

export type AssistantDisplaySlice =
  | { kind: "narration"; id: string; ops: MessageOp[] }
  | { kind: "activity"; id: string; ops: MessageOp[] }

export type ChatTranscriptSlice =
  | { kind: "message"; id: string; message: MessageEntry }
  | { kind: "activity"; id: string; message: MessageEntry; ops: MessageOp[] }

export type ChatActivityKind = "reasoning" | "tool"

export type ChatActivityStatus = "running" | "completed" | "failed"

export type ChatActivitySpan = {
  id: string
  kind: ChatActivityKind
  status: ChatActivityStatus
  op: MessageOp
  index: number
}

function isActivityOp(op: MessageOp): boolean {
  return op.kind === "tool" || op.kind === "thinking"
}

function toolCount(ops: readonly MessageOp[]): number {
  return ops.reduce((count, op) => count + (op.kind === "tool" ? 1 : 0), 0)
}

function toolName(op: MessageOp): string | null {
  return op.kind === "tool" ? op.toolCall.name : null
}

function isWriteStdinOp(op: MessageOp): boolean {
  return toolName(op) === "write_stdin"
}

function isExecCommandOp(op: MessageOp): boolean {
  return toolName(op) === "exec_command"
}

function toolInputObject(op: MessageOp): Record<string, unknown> | null {
  if (op.kind !== "tool" || !op.toolCall.input || typeof op.toolCall.input !== "object") return null
  return op.toolCall.input as Record<string, unknown>
}

function normalizedVisibleText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function agentPromptForOp(op: MessageOp): string | null {
  if (op.kind !== "tool") return null
  if (op.toolCall.name !== "Agent" && op.toolCall.name !== "Task") return null
  const prompt = toolInputObject(op)?.prompt
  return typeof prompt === "string" && prompt.trim().length > 0 ? normalizedVisibleText(prompt) : null
}

function removeAgentPromptEchoes(ops: readonly MessageOp[]): MessageOp[] {
  const prompts = new Set<string>()
  for (const op of ops) {
    const prompt = agentPromptForOp(op)
    if (prompt) prompts.add(prompt)
  }
  if (prompts.size === 0) return ops as MessageOp[]

  let changed = false
  const out: MessageOp[] = []
  for (const op of ops) {
    if (op.kind === "text" && prompts.has(normalizedVisibleText(op.text))) {
      changed = true
      continue
    }
    out.push(op)
  }
  return changed ? out : (ops as MessageOp[])
}

function writeStdinSessionId(op: MessageOp): string | null {
  const input = toolInputObject(op)
  const value = input?.session_id
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

function writeStdinChars(op: MessageOp): string {
  const input = toolInputObject(op)
  return typeof input?.chars === "string" ? input.chars : ""
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>
    const stdout = typeof o.stdout === "string" ? o.stdout : ""
    const stderr = typeof o.stderr === "string" ? o.stderr : ""
    return [stdout, stderr].filter((part) => part.length > 0).join("\n")
  }
  return output == null ? "" : String(output)
}

function outputWithText(output: unknown, text: string): unknown {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>
    if (typeof o.stdout === "string" || typeof o.stderr === "string") {
      return { ...o, stdout: [o.stdout, text].filter((part) => typeof part === "string" && part.length > 0).join("\n") }
    }
  }
  const base = outputText(output)
  return [base, text].filter((part) => part.length > 0).join("\n")
}

function execCommandSessionId(op: MessageOp): string | null {
  if (op.kind !== "tool") return null
  const fromInput = toolInputObject(op)?.session_id
  if (typeof fromInput === "string" || typeof fromInput === "number") return String(fromInput)
  const match = outputText(op.result?.output).match(/\bsession ID ([^\s]+)/i)
  return match?.[1] ?? null
}

function mergeToolResult(
  base: ToolResultEntry | undefined,
  extra: ToolResultEntry | undefined,
  inputNote = "",
): ToolResultEntry | undefined {
  if (!base && !extra && inputNote.length === 0) return undefined
  const id = base?.id ?? extra?.id
  if (!id) return undefined
  const extraText = [inputNote, outputText(extra?.output)].filter((part) => part.length > 0).join("\n")
  return {
    id,
    output: outputWithText(base?.output ?? "", extraText),
    is_error: base?.is_error || extra?.is_error || undefined,
  }
}

export function normalizeCommandSessionOps(ops: readonly MessageOp[]): MessageOp[] {
  const out: MessageOp[] = []
  const execBySession = new Map<string, number>()
  let changed = false
  for (const op of ops) {
    if (op.kind !== "tool") {
      out.push(op)
      continue
    }

    if (isWriteStdinOp(op)) {
      const sessionId = writeStdinSessionId(op)
      const targetIndex = sessionId ? execBySession.get(sessionId) : undefined
      if (targetIndex !== undefined) {
        const target = out[targetIndex]
        if (target?.kind === "tool") {
          const chars = writeStdinChars(op)
          const inputNote = chars.length > 0 ? `Input sent:\n${chars}` : ""
          out[targetIndex] = {
            ...target,
            result: mergeToolResult(target.result, op.result, inputNote),
          }
          changed = true
          continue
        }
      }
    }

    out.push(op)
    if (isExecCommandOp(op)) {
      const sessionId = execCommandSessionId(op)
      if (sessionId) execBySession.set(sessionId, out.length - 1)
    }
  }
  return removeAgentPromptEchoes(changed ? out : ops)
}

export function splitAssistantOpsIntoDisplaySlices(ops: readonly MessageOp[]): AssistantDisplaySlice[] {
  const out: AssistantDisplaySlice[] = []
  let narration: MessageOp[] = []
  let activity: MessageOp[] = []
  let pendingThinking: MessageOp[] = []
  let seq = 0

  const flushNarration = (): void => {
    if (narration.length === 0) return
    out.push({ kind: "narration", id: `narration-${seq++}`, ops: narration })
    narration = []
  }
  const flushActivity = (): void => {
    if (activity.length === 0) return
    out.push({ kind: "activity", id: `activity-${seq++}`, ops: activity })
    activity = []
  }
  const flushPendingThinkingAsNarration = (): void => {
    if (pendingThinking.length === 0) return
    narration.push(...pendingThinking)
    pendingThinking = []
  }

  for (const op of ops) {
    if (op.kind === "tool") {
      flushNarration()
      if (activity.length === 0 && pendingThinking.length > 0) {
        activity.push(...pendingThinking)
        pendingThinking = []
      }
      activity.push(op)
      continue
    }
    if (op.kind === "thinking") {
      if (activity.length > 0) activity.push(op)
      else pendingThinking.push(op)
      continue
    }
    flushActivity()
    flushPendingThinkingAsNarration()
    narration.push(op)
  }

  flushActivity()
  flushPendingThinkingAsNarration()
  flushNarration()
  return out
}

function activityStatusForOp(op: MessageOp): ChatActivityStatus {
  if (op.kind !== "tool") return "completed"
  if (!op.result) return "running"
  return op.result.is_error ? "failed" : "completed"
}

export function activitySpansFromOps(ops: readonly MessageOp[]): ChatActivitySpan[] {
  const out: ChatActivitySpan[] = []
  ops.forEach((op, index) => {
    if (op.kind === "tool") {
      out.push({
        id: op.toolCall.id,
        kind: "tool",
        status: activityStatusForOp(op),
        op,
        index,
      })
      return
    }
    if (op.kind === "thinking" && op.text.trim().length > 0) {
      out.push({
        id: `reasoning-${index}`,
        kind: "reasoning",
        status: "completed",
        op,
        index,
      })
    }
  })
  return out
}

export function latestRunningActivitySpan(spans: readonly ChatActivitySpan[]): ChatActivitySpan | null {
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]
    if (span?.status === "running") return span
  }
  return null
}

export function buildChatTurns(messages: readonly MessageEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let current: ChatTurn | null = null
  let currentHasOpenAssistant = false

  const ensureTurn = (id: string): ChatTurn => {
    if (!current) {
      current = { id, turnKey: id, prompts: [], segments: [], stats: { toolCount: 0, thinkingCount: 0 } }
      turns.push(current)
    }
    return current
  }
  const turnIdFor = (message: MessageEntry): string => {
    const value = (message as { turnId?: unknown }).turnId
    return String(typeof value === "string" || typeof value === "number" ? value : message.id)
  }

  for (const message of messages) {
    if (message.role === "user") {
      const messageKey = turnIdFor(message)
      if (!current || !currentHasOpenAssistant) {
        current = {
          id: messageKey,
          turnKey: messageKey,
          prompts: [],
          segments: [],
          stats: { toolCount: 0, thinkingCount: 0 },
        }
        turns.push(current)
      }
      current.prompts.push(message)
      current.prompt ??= message
      continue
    }
    if (message.role !== "assistant") continue
    const turn = ensureTurn(turnIdFor(message))
    currentHasOpenAssistant = message.stopReason == null
    const ops = normalizeCommandSessionOps(message.ops)
    const slices = splitAssistantOpsIntoDisplaySlices(ops)
    let pendingNarration: MessageOp[] = []
    for (const slice of slices) {
      if (slice.kind === "narration") {
        pendingNarration = [...pendingNarration, ...slice.ops]
        continue
      }
      const segment: ChatTurnSegment = {
        id: `${message.id}:${slice.id}`,
        narration: pendingNarration,
        activities: [{ id: `${message.id}:${slice.id}`, items: slice.ops.map((op, index) => ({ op, index })) }],
      }
      turn.segments.push(segment)
      pendingNarration = []
    }
    if (pendingNarration.length > 0) {
      if (turn.segments.length > 0) turn.summary = [...(turn.summary ?? []), ...pendingNarration]
      else turn.segments.push({ id: `${message.id}:narration`, narration: pendingNarration, activities: [] })
    }
    for (const op of ops) {
      if (op.kind === "tool") turn.stats.toolCount++
      else if (op.kind === "thinking") turn.stats.thinkingCount++
    }
    if (message.stopReason != null) currentHasOpenAssistant = false
  }

  return turns
}

function sourceMessageId(message: MessageEntry): string {
  const tagged = (message as unknown as { __sourceMessageId?: unknown }).__sourceMessageId
  return typeof tagged === "string" ? tagged : String(message.id)
}

function sliceMessage(message: MessageEntry, ops: MessageOp[], suffix: string): MessageEntry {
  const sourceId = sourceMessageId(message)
  const out = {
    ...message,
    id: `${message.id}:${suffix}` as MessageEntry["id"],
    ops,
  } as MessageEntry
  Object.defineProperty(out, "__sourceMessageId", {
    value: sourceId,
    enumerable: false,
    configurable: true,
  })
  Object.defineProperty(out, "text", {
    get() {
      return ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])).join("")
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : []))
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : []))
    },
    enumerable: true,
    configurable: true,
  })
  return out
}

export function splitAssistantMessageForTranscript(message: MessageEntry): ChatTranscriptSlice[] {
  if (message.role !== "assistant") return [{ kind: "message", id: String(message.id), message }]
  const ops = normalizeCommandSessionOps(message.ops)
  const normalizedMessage = ops === message.ops ? message : sliceMessage(message, ops, "normalized")
  const totalToolCount = toolCount(ops)
  if (totalToolCount === 0 || totalToolCount > 8) {
    return [{ kind: "message", id: String(normalizedMessage.id), message: normalizedMessage }]
  }
  const out: ChatTranscriptSlice[] = []
  for (const slice of splitAssistantOpsIntoDisplaySlices(ops)) {
    if (slice.kind === "activity") {
      if (toolCount(slice.ops) <= 1) {
        const sliced = sliceMessage(normalizedMessage, slice.ops, slice.id)
        out.push({ kind: "message", id: String(sliced.id), message: sliced })
      } else {
        out.push({
          kind: "activity",
          id: `${normalizedMessage.id}:${slice.id}`,
          message: normalizedMessage,
          ops: slice.ops,
        })
      }
    } else {
      const sliced = sliceMessage(normalizedMessage, slice.ops, slice.id)
      out.push({ kind: "message", id: String(sliced.id), message: sliced })
    }
  }
  return out.length > 0 ? out : [{ kind: "message", id: String(normalizedMessage.id), message: normalizedMessage }]
}

export function activityOps(slice: AssistantDisplaySlice): MessageOp[] {
  return slice.kind === "activity" ? slice.ops : []
}

export function sliceHasActivity(slice: AssistantDisplaySlice): boolean {
  return slice.ops.some(isActivityOp)
}
