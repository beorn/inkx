/**
 * Session reducer — pure `(state, action) → [state, Effect[]]` for the
 * silvercode agent session.
 *
 * **Why this exists**: the legacy `session-store.ts` mixed state mutation
 * with closure-captured runtime state (`pendingPromptForNextAssistantTurn`,
 * `turnStrip`). Two independent features sharing the same `user-message`
 * case statement (optimistic-echo dedup + prompt-echo strip arming) repeatedly
 * collided — the dedup branch's early `break` skipped the strip-arm. Each
 * fix was locally correct; together they regressed
 * (`km-silvercode.prompt-concat-into-reply` regression).
 *
 * This is the **No-Parallel-Derivation** smell from `docs/principles.md`:
 * when multiple branches must update the same downstream state, they ALL
 * have to remember to do it. Refactor to TEA so that:
 *
 * 1. Branching is purely on the data update.
 * 2. Effects (such as strip-arming) are computed unconditionally from the
 *    incoming action, then merged into the state in one place.
 * 3. The class of bug where one branch forgets to update some downstream
 *    state cannot recur — the state machine principle from
 *    `docs/design/tea.md` makes the contract explicit.
 *
 * **Public surface preservation**: the public `SessionState` shape and the
 * public `createSessionStore()` API are not affected by this refactor. The
 * strip runtime is private (a `_strip` field on `InternalSessionState`,
 * stripped before the state crosses the public boundary).
 *
 * Bead: km-silvercode.session-store-tea-refactor.
 */

import { createLogger } from "loggily"
import type { AgentEvent, ContentBlock, PlanUpdateEntry, ToolUseId, TurnId } from "./events.ts"
import type {
  AskUserQuestionItem,
  AskUserQuestionOption,
  AgentPlan,
  AgentPlanEntry,
  AgentPlanEntryStatus,
  ErrorEntry,
  MessageEntry,
  MessageOp,
  PendingQuestion,
  SessionState,
  SessionStatus,
  Todo,
  ToolCallEntry,
  ToolResultEntry,
  WritableEntry,
} from "./session-types.ts"
import { initialSessionState, makeEntry } from "./session-types.ts"

// ─────────────────────────────────────────────────────────────────────────
// Status transition tracing — Phase A of the L4 reframe
// (km-silvercode.session-store-trace, parent km-silvercode.queue-stuck-thinking-l4).
//
// Every `next.status = X` mutation in this file MUST go through `setStatus`
// instead of being assigned directly. The helper:
//   1. Emits `silvercode:status` debug log line ({from, to, reason, eventKind, turnId}).
//   2. Asserts a dev-mode invariant: flipping to a "busy" status without an
//      active turn (event turnId or tracked _activeTurnId) is a bug-class
//      we want to catch loudly. Throws in dev, warns in prod.
//   3. Optionally appends to a 30-entry ring buffer (`statusTrace`) for a
//      future TUI dev overlay / forensics dump.
//
// The L1 guard at the `case "status"` arm (rejects stray `requesting` when
// idle/ended) stays in place — Phase A only adds observability ON TOP of
// the gate, it does not replace it. Phase B introduces the Turn-owner
// module; Phase C deletes the stored writes; Phase D fuzz-tests the
// derived getter and removes this scaffolding.
// ─────────────────────────────────────────────────────────────────────────

const dStatus = createLogger("silvercode:status")

/** Status values where a turn must be in flight. */
const BUSY_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  "thinking",
  "tool-running",
  "awaiting-permission",
])

/** Maximum ring-buffer size for {@link InternalSessionState.statusTrace}. */
const STATUS_TRACE_MAX = 30
const DEFAULT_LIVENESS_STALE_MS = 30_000

/** One entry in the optional status-transition ring buffer. */
export type StatusTraceEntry = {
  from: SessionStatus
  to: SessionStatus
  reason: string
  eventKind: string
  turnId: TurnId | null
  ts: number
}

type LivenessObligation = {
  id: string
  kind: "permission" | "tool" | "turn"
  label: string
  openedAt: number
  ownerTurnId?: TurnId
}

type LivenessRuntime = {
  permissions: ReadonlyMap<string, LivenessObligation>
  tools: ReadonlyMap<string, LivenessObligation>
  turns: ReadonlyMap<string, LivenessObligation>
  reported: ReadonlySet<string>
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
}

/**
 * Centralised status-mutation helper. Wrap every `next.status = X` in this
 * function. `reason` names the source ("session-init", "turn-start-assistant",
 * "tool-use", …); `eventKind` mirrors the action.kind being processed.
 *
 * In dev (`NODE_ENV !== "production"`), if `to` is a busy status
 * (`thinking` / `tool-running` / `awaiting-permission`) and no turnId is in
 * scope (neither passed-in `turnId` nor tracked `_activeTurnId`), throws.
 * In prod, logs `log.warn` instead of throwing. Either way the transition
 * itself still applies — the invariant is observability, not correction
 * (correction is Phase B's job).
 */
function setStatus(
  next: InternalSessionState,
  to: SessionStatus,
  reason: string,
  eventKind: string,
  turnId?: TurnId | null,
): void {
  const from = next.status
  const effectiveTurnId = turnId ?? next._activeTurnId ?? null

  if (BUSY_STATUSES.has(to) && effectiveTurnId === null) {
    const message =
      `silvercode:status invariant violated — flip ${from} → ${to} without active turnId ` +
      `(reason="${reason}", eventKind="${eventKind}")`
    if (isProd()) {
      dStatus.warn?.("invariant", { from, to, reason, eventKind, turnId: null })
    } else {
      throw new Error(message)
    }
  }

  dStatus.debug?.("transition", {
    from,
    to,
    reason,
    eventKind,
    turnId: effectiveTurnId,
  })

  next.status = to

  // Ring buffer — append-only, capped at STATUS_TRACE_MAX. Dev/forensics
  // affordance; consumers should treat as best-effort.
  const entry: StatusTraceEntry = {
    from,
    to,
    reason,
    eventKind,
    turnId: effectiveTurnId,
    ts: Date.now(),
  }
  const prev = next.statusTrace ?? []
  next.statusTrace =
    prev.length >= STATUS_TRACE_MAX ? [...prev.slice(prev.length - STATUS_TRACE_MAX + 1), entry] : [...prev, entry]
}

/**
 * Window in ms within which consecutive identical error messages fold
 * into a single `lastError` entry with an incremented `count` rather
 * than appearing as separate errors. Re-armed on each fold, so a
 * slow-but-steady drip (an error every 4s) stays folded as long as
 * gaps stay under the window.
 *
 * 5s matches the toast dismissal window in `Notifications.tsx`, so the
 * dedup horizon is the same one the user already perceives as "this is
 * the same incident."
 *
 * Bead: km-silvercode.error-dedup.
 */
const ERROR_DEDUP_WINDOW_MS = 5000

/**
 * Fold the incoming error event into the most-recent error if the two
 * are "the same incident" — same message and within the dedup window
 * of the previous fold. Otherwise produce a fresh entry with
 * `count = 1`.
 *
 * Pure: returns a new {@link ErrorEntry}; never mutates `prev`.
 *
 * Bead: km-silvercode.error-dedup.
 */
function mergeError(prev: ErrorEntry | null, message: string, ts: number): ErrorEntry {
  if (prev !== null && prev.message === message && ts - prev.ts <= ERROR_DEDUP_WINDOW_MS) {
    return { message, count: prev.count + 1, ts }
  }
  return { message, count: 1, ts }
}

function livenessKey(kind: LivenessObligation["kind"], id: string): string {
  return `${kind}:${id}`
}

function openLiveness(
  next: InternalSessionState,
  bucket: keyof Pick<LivenessRuntime, "permissions" | "tools" | "turns">,
  obligation: LivenessObligation,
): void {
  const map = new Map(next._liveness[bucket])
  map.set(obligation.id, obligation)
  const reported = new Set(next._liveness.reported)
  reported.delete(livenessKey(obligation.kind, obligation.id))
  next._liveness = { ...next._liveness, [bucket]: map, reported }
}

function closeLiveness(
  next: InternalSessionState,
  bucket: keyof Pick<LivenessRuntime, "permissions" | "tools" | "turns">,
  kind: LivenessObligation["kind"],
  id: string,
): void {
  const map = new Map(next._liveness[bucket])
  map.delete(id)
  const reported = new Set(next._liveness.reported)
  reported.delete(livenessKey(kind, id))
  next._liveness = { ...next._liveness, [bucket]: map, reported }
}

function clearLiveness(next: InternalSessionState): void {
  next._liveness = { permissions: new Map(), tools: new Map(), turns: new Map(), reported: new Set() }
}

function closeToolLivenessForTurn(next: InternalSessionState, turnId: TurnId): void {
  const tools = new Map(next._liveness.tools)
  const reported = new Set(next._liveness.reported)
  for (const [id, obligation] of tools) {
    if (obligation.ownerTurnId !== turnId) continue
    tools.delete(id)
    reported.delete(livenessKey("tool", id))
  }
  next._liveness = { ...next._liveness, tools, reported }
}

function reportLiveness(next: InternalSessionState, message: string, ts: number): void {
  next.lastError = mergeError(next.lastError, message, ts)
  dStatus.debug?.("liveness", { message })
}

function applyLivenessCheck(next: InternalSessionState, action: Extract<AgentEvent, { kind: "liveness-check" }>): void {
  const staleAfterMs = action.staleAfterMs ?? DEFAULT_LIVENESS_STALE_MS
  const reported = new Set(next._liveness.reported)

  function reportOnce(obligation: LivenessObligation, missing: string): void {
    const ageMs = Math.max(0, action.ts - obligation.openedAt)
    if (ageMs < staleAfterMs) return
    const key = livenessKey(obligation.kind, obligation.id)
    if (reported.has(key)) return
    reported.add(key)
    reportLiveness(
      next,
      `silvercode:liveness stalled — ${obligation.kind} "${obligation.id}" ` +
        `(${obligation.label}) pending ${ageMs}ms; missing=${missing}`,
      action.ts,
    )
  }

  for (const obligation of next._liveness.permissions.values()) {
    reportOnce(obligation, `permission-decision(${obligation.id})`)
  }
  for (const obligation of next._liveness.tools.values()) {
    reportOnce(obligation, `tool-result(${obligation.id})`)
  }
  for (const obligation of next._liveness.turns.values()) {
    reportOnce(obligation, `turn-end(${obligation.id})`)
  }

  if (next.status === "awaiting-permission" && next.permissions.length === 0) {
    reportLiveness(
      next,
      "silvercode:liveness invariant violated — status=awaiting-permission but no permissions pending",
      action.ts,
    )
  }
  if (next.status === "tool-running" && next._liveness.tools.size === 0) {
    reportLiveness(next, "silvercode:liveness invariant violated — status=tool-running but no tools pending", action.ts)
  }
  if ((next.status === "thinking" || next.status === "tool-running") && next._activeTurnId === null) {
    reportLiveness(next, `silvercode:liveness invariant violated — status=${next.status} but no active turn`, action.ts)
  }

  next._liveness = { ...next._liveness, reported }
}

// ─────────────────────────────────────────────────────────────────────────
// State

/**
 * Per-turn echoed-prompt strip state. See {@link consumeStrip} for the
 * matching semantics.
 */
export type StripState = {
  fullPrompt: string
  consumed: number
  abandoned: boolean
}

/**
 * Transport-only bookkeeping for the prompt-echo strip. Lives inside the
 * reduced state (kept pure) but is projected away before the state is
 * exposed publicly via `store.state.get()`.
 */
export type StripRuntime = {
  /** Per-assistant-turn strip state. Empty after the prompt is fully matched (or abandoned). */
  byTurn: ReadonlyMap<TurnId, StripState>
  /**
   * Captured on the most-recent `user-message`; consumed on the next
   * assistant turn-start (or assistant-message when streaming is skipped).
   * Empty string means "no pending prompt" — equivalent to "no echo strip
   * needs arming for the next assistant turn".
   */
  pending: string
}

/**
 * Internal state carried by the reducer. {@link SessionState} is a
 * projection over this shape with the `_strip` runtime field stripped.
 */
export type InternalSessionState = SessionState & {
  /** Private — never exposed across the `createSessionStore()` boundary. */
  _strip: StripRuntime
  /**
   * Currently-active assistant turn id, or `null` when no turn is in flight.
   * Set on `turn-start` (assistant role), cleared on `turn-end` /
   * `session-end` / `session-lifecycle:ended`. Used by {@link setStatus} to
   * decide whether a busy-status transition has a legitimate owner.
   *
   * This is observability scaffolding for Phase A of the L4 reframe —
   * Phase B promotes it into a proper Turn-owner module. Private (`_`)
   * because it's not part of the public store contract.
   */
  _activeTurnId: TurnId | null
  /**
   * Optional ring buffer of the last {@link STATUS_TRACE_MAX} status
   * transitions, append-only and capped. Dev-only forensics surface for a
   * future TUI overlay; ignore in prod paths. Public on the projected
   * state but undefined when no transition has fired yet.
   */
  statusTrace?: ReadonlyArray<StatusTraceEntry>
  _liveness: LivenessRuntime
}

export function initialInternalState(): InternalSessionState {
  return {
    ...initialSessionState(),
    _strip: { byTurn: new Map<TurnId, StripState>(), pending: "" },
    _activeTurnId: null,
    _liveness: { permissions: new Map(), tools: new Map(), turns: new Map(), reported: new Set() },
  }
}

/**
 * Derive the public status from the reducer-owned lifecycle facts.
 *
 * `state.status` is retained inside `InternalSessionState` as a transition
 * trace baseline while the L4 migration lands, but it is no longer the
 * authority exposed to callers. The controller queue gate reads
 * `store.state.get().status`, which flows through {@link publicView}; that
 * public value comes from active turns, tools, permissions, and terminal
 * session state instead of whichever reducer arm last wrote a string.
 */
export function deriveStatus(state: InternalSessionState): SessionStatus {
  if (state.status === "ended") return "ended"
  if (state.permissions.length > 0 || state._liveness.permissions.size > 0) return "awaiting-permission"
  if (state._liveness.tools.size > 0) return "tool-running"
  if (state._activeTurnId !== null || state._liveness.turns.size > 0) return "thinking"
  return "idle"
}

/**
 * Project the public-facing slice of the internal state. The store's
 * `state.get()` and `subscribe()` notifications return this shape — the
 * `_strip` runtime is never observable to UI consumers.
 */
export function publicView(state: InternalSessionState): SessionState {
  // Cheap object copy with private fields omitted. Avoids leaking the
  // `_strip` map and `_activeTurnId` to subscribers (and avoids
  // accidentally being mutated by a downstream consumer). The
  // `statusTrace` ring buffer is intentionally retained — it's part of
  // the public dev-overlay surface.
  const { _strip, _activeTurnId, _liveness, ...rest } = state
  void _strip
  void _activeTurnId
  void _liveness
  return { ...rest, status: deriveStatus(state) } as SessionState
}

// ─────────────────────────────────────────────────────────────────────────
// Effects

/**
 * Reducer effects — kept as an open discriminated union so future cases
 * (notify-bell, persist-to-event-log, dispatch-to-acp-session) can be
 * added without changing the reducer's signature. Currently the reducer
 * computes everything as pure data, so `Effect` is empty in practice.
 *
 * Adding a variant: define the data shape here, emit it from the relevant
 * pure-fn pair, and handle it in {@link runEffect}.
 */
export type Effect = never

// ─────────────────────────────────────────────────────────────────────────
// Strip helpers — pure functions over StripRuntime + string

/**
 * Arm the strip for `turnId` from the currently-pending prompt. Returns a
 * new {@link StripRuntime} with `pending` cleared and `byTurn` extended if
 * the prompt was non-empty. A no-op if there's no pending prompt or the
 * turn is already armed (re-arming would lose the consumed counter).
 */
function armStrip(strip: StripRuntime, turnId: TurnId): StripRuntime {
  const prompt = strip.pending
  if (prompt.length === 0) return { ...strip, pending: "" }
  if (strip.byTurn.has(turnId)) return { ...strip, pending: "" }
  const byTurn = new Map(strip.byTurn)
  byTurn.set(turnId, { fullPrompt: prompt, consumed: 0, abandoned: false })
  return { byTurn, pending: "" }
}

/**
 * Consume a chunk of incoming assistant text against the strip state for
 * `turnId`. Returns the visible bytes and the updated runtime.
 *
 * Matching rules (byte-equal pass-through guarantee when the agent does
 * NOT echo the prompt):
 *   1. Whole delta is a prefix-fragment of the remaining prompt → swallow
 *      it (return ""), advance `consumed`.
 *   2. Delta crosses the prompt boundary → emit the post-prompt suffix,
 *      mark fully-consumed.
 *   3. Mismatch → abandon strip, replay any previously-suppressed bytes
 *      so on-screen text matches the agent's actual byte stream.
 *
 * No-op when there's no strip state, the strip is already abandoned, or
 * the prompt has been fully consumed — the input bytes pass through.
 */
function consumeStrip(strip: StripRuntime, turnId: TurnId, text: string): [StripRuntime, string] {
  if (text.length === 0) return [strip, text]
  const st = strip.byTurn.get(turnId)
  if (!st || st.abandoned || st.consumed >= st.fullPrompt.length) return [strip, text]
  const remaining = st.fullPrompt.slice(st.consumed)
  if (remaining.startsWith(text)) {
    const updated: StripState = { ...st, consumed: st.consumed + text.length }
    const byTurn = new Map(strip.byTurn)
    byTurn.set(turnId, updated)
    return [{ ...strip, byTurn }, ""]
  }
  if (text.startsWith(remaining)) {
    const updated: StripState = { ...st, consumed: st.fullPrompt.length }
    const byTurn = new Map(strip.byTurn)
    byTurn.set(turnId, updated)
    return [{ ...strip, byTurn }, text.slice(remaining.length)]
  }
  // Mismatch — abandon and replay any swallowed bytes.
  const replay = st.fullPrompt.slice(0, st.consumed)
  const updated: StripState = { ...st, abandoned: true }
  const byTurn = new Map(strip.byTurn)
  byTurn.set(turnId, updated)
  return [{ ...strip, byTurn }, replay + text]
}

// ─────────────────────────────────────────────────────────────────────────
// Message helpers — pure functions over messages array

function orderMessagesByTimestamp(messages: readonly MessageEntry[]): MessageEntry[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const byTimestamp = a.message.ts - b.message.ts
      return byTimestamp !== 0 ? byTimestamp : a.index - b.index
    })
    .map(({ message }) => message)
}

/**
 * Build an updated messages array. The mutator is given a fresh
 * `WritableEntry` (the input is destructured so callers can return
 * `{ ...m, ... }` style patches without worrying about getter-clobbering);
 * the result is re-wrapped via `makeEntry` to install projections.
 *
 * Returns the new messages array. Pure: never mutates `messages` in place.
 */
function upsertMessage(
  messages: readonly MessageEntry[],
  id: TurnId,
  init: (m: WritableEntry) => WritableEntry,
): MessageEntry[] {
  const idx = messages.findIndex((m) => m.id === id)
  const prevEntry = idx >= 0 ? messages[idx] : undefined
  if (prevEntry) {
    const writable: WritableEntry = {
      id: prevEntry.id,
      role: prevEntry.role,
      ops: prevEntry.ops,
      blocks: prevEntry.blocks,
      todos: prevEntry.todos,
      stopReason: prevEntry.stopReason,
      additionalContext: prevEntry.additionalContext,
      ts: prevEntry.ts,
    }
    const updated = makeEntry(init(writable))
    return orderMessagesByTimestamp([...messages.slice(0, idx), updated, ...messages.slice(idx + 1)])
  }
  const fresh = makeEntry(init({ id, role: "assistant", ops: [], ts: Date.now() }))
  return orderMessagesByTimestamp([...messages, fresh])
}

/**
 * Parse the `input` of an AskUserQuestion tool-use event into the
 * harness's typed {@link PendingQuestion} shape. Mirrors Anthropic's
 * `AskUserQuestionInput` schema (1-4 questions, each with header + 2-4
 * options). Returns `null` if the input is malformed — the reducer must
 * never throw, and a malformed AskUserQuestion call shouldn't poison the
 * pending state.
 *
 * Bead: km-silvercode.askuserquestion-implement.
 */
function parseAskUserQuestionInput(toolUseId: ToolUseId, input: unknown): PendingQuestion | null {
  if (!input || typeof input !== "object") return null
  const root = input as Record<string, unknown>
  const rawQuestions = root.questions
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return null
  const questions: AskUserQuestionItem[] = []
  for (const q of rawQuestions) {
    if (!q || typeof q !== "object") return null
    const qo = q as Record<string, unknown>
    const question = typeof qo.question === "string" ? qo.question : null
    const header = typeof qo.header === "string" ? qo.header : null
    const rawOptions = qo.options
    if (question === null || header === null || !Array.isArray(rawOptions)) return null
    const options: AskUserQuestionOption[] = []
    for (const o of rawOptions) {
      if (!o || typeof o !== "object") return null
      const oo = o as Record<string, unknown>
      const label = typeof oo.label === "string" ? oo.label : null
      if (label === null) return null
      options.push({
        label,
        description: typeof oo.description === "string" ? (oo.description as string) : undefined,
        preview: typeof oo.preview === "string" ? (oo.preview as string) : undefined,
      })
    }
    questions.push({
      question,
      header,
      multiSelect: typeof qo.multiSelect === "boolean" ? (qo.multiSelect as boolean) : undefined,
      options,
    })
  }
  return { toolUseId, questions }
}

function extractTodos(input: unknown): Todo[] | undefined {
  if (!input || typeof input !== "object") return undefined
  const maybe = (input as Record<string, unknown>).todos
  if (!Array.isArray(maybe)) return undefined
  return maybe
    .map((t): Todo | null => {
      if (!t || typeof t !== "object") return null
      const o = t as Record<string, unknown>
      const content = typeof o.content === "string" ? (o.content as string) : null
      if (!content) return null
      const rawStatus = typeof o.status === "string" ? (o.status as string) : "pending"
      const status: Todo["status"] =
        rawStatus === "in_progress" || rawStatus === "completed" ? (rawStatus as Todo["status"]) : "pending"
      return {
        content,
        status,
        activeForm: typeof o.activeForm === "string" ? (o.activeForm as string) : undefined,
      }
    })
    .filter((t): t is Todo => t != null)
}

function planEntryStatusFromTodo(rawStatus: string): AgentPlanEntryStatus {
  switch (rawStatus) {
    case "in_progress":
    case "completed":
    case "cancelled":
      return rawStatus
    default:
      return "pending"
  }
}

function todoStatusFromPlan(status: AgentPlanEntryStatus): Todo["status"] {
  switch (status) {
    case "in_progress":
    case "completed":
      return status
    case "pending":
    case "cancelled":
      return "pending"
  }
}

function extractPlanFromTodoWrite(
  input: unknown,
  context: { sessionId: InternalSessionState["sessionId"]; messageId: string; toolCallId: string; updatedAt: number },
  previous: AgentPlan | null,
): AgentPlan | null {
  if (!input || typeof input !== "object") return null
  const maybe = (input as Record<string, unknown>).todos
  if (!Array.isArray(maybe)) return null
  const entries: AgentPlanEntry[] = []
  maybe.forEach((t, order) => {
    if (!t || typeof t !== "object") return
    const o = t as Record<string, unknown>
    const content = typeof o.content === "string" ? o.content : null
    if (!content) return
    const rawStatus = typeof o.status === "string" ? o.status : "pending"
    entries.push({
      id: typeof o.id === "string" ? o.id : `claude-todowrite:${order}:${content}`,
      content,
      status: planEntryStatusFromTodo(rawStatus),
      activeForm: typeof o.activeForm === "string" ? o.activeForm : undefined,
      order,
      sourceRef: {
        toolCallId: context.toolCallId,
        messageId: context.messageId,
        providerEntryId: typeof o.id === "string" ? o.id : undefined,
      },
    })
  })
  if (entries.length === 0) return null
  return {
    id: previous?.id ?? `${context.sessionId ?? "session"}:plan`,
    sessionId: context.sessionId,
    scope: {
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: context.toolCallId,
    },
    source: "claude-todowrite",
    version: (previous?.version ?? 0) + 1,
    status: entries.every((entry) => entry.status === "completed") ? "completed" : "active",
    entries,
    updatedAt: context.updatedAt,
  }
}

function planEntryStatusFromProvider(rawStatus: unknown): AgentPlanEntryStatus {
  switch (typeof rawStatus === "string" ? rawStatus.toLowerCase() : "") {
    case "active":
    case "started":
    case "in_progress":
      return "in_progress"
    case "done":
    case "completed":
      return "completed"
    case "cancelled":
    case "canceled":
    case "skipped":
      return "cancelled"
    default:
      return "pending"
  }
}

function extractPlanFromProviderTool(
  input: unknown,
  context: { sessionId: InternalSessionState["sessionId"]; messageId: string; toolCallId: string; updatedAt: number },
  previous: AgentPlan | null,
): AgentPlan | null {
  if (!input || typeof input !== "object") return null
  const root = input as Record<string, unknown>
  const raw = Array.isArray(root.plan)
    ? root.plan
    : Array.isArray(root.steps)
      ? root.steps
      : Array.isArray(root.items)
        ? root.items
        : []
  const entries: AgentPlanEntry[] = []
  raw.forEach((item, order) => {
    if (typeof item === "string") {
      entries.push({
        id: `codex-plan:${order}:${item}`,
        content: item,
        status: "pending",
        order,
        sourceRef: { toolCallId: context.toolCallId, messageId: context.messageId },
      })
      return
    }
    if (!item || typeof item !== "object") return
    const o = item as Record<string, unknown>
    const content =
      typeof o.content === "string"
        ? o.content
        : typeof o.text === "string"
          ? o.text
          : typeof o.step === "string"
            ? o.step
            : null
    if (!content) return
    const providerEntryId = typeof o.id === "string" ? o.id : undefined
    entries.push({
      id: providerEntryId ?? `codex-plan:${order}:${content}`,
      content,
      status: planEntryStatusFromProvider(o.status ?? o.state),
      activeForm: typeof o.activeForm === "string" ? o.activeForm : undefined,
      priority: o.priority === "high" || o.priority === "medium" || o.priority === "low" ? o.priority : undefined,
      parentId: typeof o.parentId === "string" ? o.parentId : undefined,
      order,
      sourceRef: { toolCallId: context.toolCallId, messageId: context.messageId, providerEntryId },
    })
  })
  if (entries.length === 0) return null
  return {
    id: previous?.id ?? `${context.sessionId ?? "session"}:plan`,
    sessionId: context.sessionId,
    scope: {
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: context.toolCallId,
    },
    source: "codex-plan",
    version: (previous?.version ?? 0) + 1,
    status: entries.every((entry) => entry.status === "completed") ? "completed" : "active",
    entries,
    updatedAt: context.updatedAt,
  }
}

function planFromUpdate(
  action: Extract<AgentEvent, { kind: "plan-update" }>,
  previous: AgentPlan | null,
): AgentPlan | null {
  const entries: AgentPlanEntry[] = action.entries
    .filter((entry) => entry.content.trim().length > 0)
    .map((entry: PlanUpdateEntry, order) => ({
      id: entry.id ?? entry.providerEntryId ?? `${action.source}:${order}:${entry.content}`,
      content: entry.content,
      status: entry.status,
      activeForm: entry.activeForm,
      priority: entry.priority,
      parentId: entry.parentId,
      order,
      sourceRef: {
        toolCallId: action.toolCallId,
        messageId: action.messageId,
        providerEntryId: entry.providerEntryId,
      },
    }))
  if (entries.length === 0) return null
  return {
    id: previous?.id ?? `${action.sessionId}:plan`,
    sessionId: action.sessionId,
    scope: {
      sessionId: action.sessionId,
      messageId: action.messageId,
      activityId: action.activityId,
      toolCallId: action.toolCallId,
      providerEventId: action.providerEventId,
      providerTurnId: action.providerTurnId,
    },
    source: action.source,
    version: (previous?.version ?? 0) + 1,
    status: entries.every((entry) => entry.status === "completed") ? "completed" : "active",
    entries,
    updatedAt: action.ts,
  }
}

function todosFromPlan(plan: AgentPlan): Todo[] {
  if (plan.entries.every((entry) => entry.status === "completed" || entry.status === "cancelled")) return []
  return plan.entries.map((entry) => ({
    content: entry.content,
    status: todoStatusFromPlan(entry.status),
    activeForm: entry.activeForm,
  }))
}

function applyPlanUpdate(next: InternalSessionState, action: Extract<AgentEvent, { kind: "plan-update" }>): void {
  const plan = planFromUpdate(action, next.plan)
  if (!plan) return
  next.plan = plan
  next.todos = todosFromPlan(plan)
}

// ─────────────────────────────────────────────────────────────────────────
// Per-case handlers — each is a pure function of (next, action) that
// applies its mutations to `next` in place. Splitting the switch into
// these helpers keeps `reduce()` itself a flat dispatcher (well under
// the cyclomatic-complexity budget) and lines up with the TEA pattern
// where every action-kind has its own handler.

function applySessionInit(next: InternalSessionState, action: Extract<AgentEvent, { kind: "session-init" }>): void {
  next.sessionId = action.sessionId
  next.model = action.model
  next.mode = action.mode
  next.cwd = action.cwd
  next.tools = action.tools
  next.mcpServers = action.mcp_servers
  next.slashCommands = action.slashCommands
  next.skills = action.skills
  next.plugins = action.plugins
  next.claudeCodeVersion = action.claudeCodeVersion
  next.apiKeySource = action.apiKeySource
  setStatus(next, "idle", "session-init", "session-init")
}

function applyTurnStart(next: InternalSessionState, action: Extract<AgentEvent, { kind: "turn-start" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    role: action.role,
    ts: action.ts,
  }))
  if (action.role === "assistant") {
    next._activeTurnId = action.turnId
    openLiveness(next, "turns", {
      id: action.turnId,
      kind: "turn",
      label: "assistant turn",
      openedAt: action.ts,
    })
    setStatus(next, "thinking", "turn-start-assistant", "turn-start", action.turnId)
    next._strip = armStrip(next._strip, action.turnId)
  } else {
    setStatus(next, "idle", "turn-start-user", "turn-start", action.turnId)
  }
}

/**
 * Look for an optimistic entry that matches the canonical echo. The match
 * window is wide enough to cover normal echo latency (50-200ms typical)
 * while narrow enough that a repeated short prompt across turns ("ok")
 * doesn't collapse incorrectly.
 */
function findOptimisticEcho(messages: readonly MessageEntry[], text: string, ts: number): number {
  const ECHO_WINDOW_MS = 5_000
  return messages.findIndex((m) => {
    if (m.role !== "user") return false
    if (!(m.id as string).startsWith("u-")) return false
    if (m.ops.length !== 1) return false
    const op = m.ops[0]
    if (op?.kind !== "text") return false
    if (op.text !== text) return false
    return ts - m.ts < ECHO_WINDOW_MS
  })
}

function applyUserMessage(next: InternalSessionState, action: Extract<AgentEvent, { kind: "user-message" }>): void {
  // ──────────────────────────────────────────────────────────────────
  // STRIP-ARM (computed unconditionally from the action).
  //
  // This is the No-Parallel-Derivation fix: in the legacy imperative
  // shape, this assignment lived inside the `user-message` case, after
  // an early `break` from the dedup branch. The dedup re-key path
  // skipped the assignment entirely — the strip never armed for the
  // optimistic→canonical re-key surface, so the prompt leaked into
  // assistant replies (km-silvercode.prompt-concat-into-reply
  // regression). In TEA shape, the strip-arm is a function of the
  // action alone — the data-update branch below cannot accidentally
  // skip it because it's computed before the branching.
  const stripPending = action.text.length > 0 ? action.text : next._strip.pending
  next._strip = { ...next._strip, pending: stripPending }

  // ──────────────────────────────────────────────────────────────────
  // DATA UPDATE — optimistic-echo dedup OR canonical upsert.
  //
  // Silvercode's controller applies a user-message with a synthetic
  // `u-<ts>` turnId for instant feedback BEFORE shipping the prompt
  // to the agent. The agent then echoes the same prompt back via
  // stream-json with its own JSONL uuid as turnId — arriving 50-200ms
  // later. Without this guard the prompt renders TWICE (one optimistic
  // + one echo) because the two turnIds don't match and `upsertMessage`
  // appends a fresh entry for the second.
  const existing = next.messages.findIndex((m) => m.id === action.turnId)
  if (existing === -1 && action.text.length > 0) {
    const optimisticIdx = findOptimisticEcho(next.messages, action.text, action.ts)
    if (optimisticIdx >= 0) {
      const optimistic = next.messages[optimisticIdx]
      if (optimistic) {
        const updated = makeEntry({
          id: action.turnId,
          role: "user",
          ops: [...optimistic.ops],
          blocks: optimistic.blocks ? [...optimistic.blocks] : undefined,
          todos: optimistic.todos,
          stopReason: optimistic.stopReason,
          additionalContext: action.additionalContext ?? optimistic.additionalContext,
          ts: optimistic.ts,
        })
        next.messages = [...next.messages.slice(0, optimisticIdx), updated, ...next.messages.slice(optimisticIdx + 1)]
        return
      }
    }
  }
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    role: "user",
    // User messages have a single text op (whole prompt). Replace
    // any prior ops outright — this isn't a streaming surface.
    ops: action.text.length > 0 ? [{ kind: "text", text: action.text, ts: action.ts }] : [],
    additionalContext: action.additionalContext ?? m.additionalContext,
    ts: action.ts,
  }))
}

function applyTextDelta(next: InternalSessionState, action: Extract<AgentEvent, { kind: "text-delta" }>): void {
  // Strip echoed-prompt bytes before applying. When a delta is entirely
  // consumed by the strip, skip the apply entirely so we don't push an
  // empty text op or spuriously bump the entry copy.
  const [strip2, stripped] = consumeStrip(next._strip, action.turnId, action.text)
  next._strip = strip2
  if (stripped.length === 0) return
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    // Keep each text delta as a timestamped op. The renderer can merge
    // adjacent text ops that have no notification events between them, but it
    // needs per-op timestamps to place notifications at their arrival point.
    const ops = [...m.ops]
    ops.push({ kind: "text", text: stripped, ts: action.ts })
    return { ...m, ops }
  })
}

function applyThinkingDelta(next: InternalSessionState, action: Extract<AgentEvent, { kind: "thinking-delta" }>): void {
  if (action.text.length === 0) {
    next.messages = upsertMessage(next.messages, action.turnId, (m) => m)
    return
  }
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    const ops = [...m.ops]
    const last = ops[ops.length - 1]
    if (last?.kind === "thinking") {
      ops[ops.length - 1] = { kind: "thinking", text: last.text + action.text, ts: last.ts ?? action.ts }
    } else {
      ops.push({ kind: "thinking", text: action.text, ts: action.ts })
    }
    return { ...m, ops }
  })
}

function applyToolUse(next: InternalSessionState, action: Extract<AgentEvent, { kind: "tool-use" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    const ops = [...m.ops]
    const existingIdx = ops.findIndex((op) => op.kind === "tool" && op.toolCall.id === action.id)
    const call: ToolCallEntry = {
      id: action.id,
      name: action.name,
      input: action.input,
      mcp_server: action.mcp_server,
    }
    if (existingIdx >= 0) {
      const prev = ops[existingIdx]
      ops[existingIdx] = {
        kind: "tool",
        toolCall: call,
        result: prev?.kind === "tool" ? prev.result : undefined,
        ts: prev?.kind === "tool" ? prev.ts : action.ts,
      }
    } else {
      ops.push({ kind: "tool", toolCall: call, ts: action.ts })
    }
    return { ...m, ops }
  })
  if (action.name === "TodoWrite") {
    const plan = extractPlanFromTodoWrite(
      action.input,
      {
        sessionId: next.sessionId,
        messageId: String(action.turnId),
        toolCallId: String(action.id),
        updatedAt: action.ts,
      },
      next.plan,
    )
    if (plan) {
      next.plan = plan
      next.todos = todosFromPlan(plan)
    } else {
      const t = extractTodos(action.input)
      if (t) next.todos = t
    }
  }
  if (action.name.toLowerCase() === "update_plan") {
    const plan = extractPlanFromProviderTool(
      action.input,
      {
        sessionId: next.sessionId,
        messageId: String(action.turnId),
        toolCallId: String(action.id),
        updatedAt: action.ts,
      },
      next.plan,
    )
    if (plan) {
      next.plan = plan
      next.todos = todosFromPlan(plan)
    }
  }
  // AskUserQuestion — surface the question(s) on the public state so the
  // UI can render an interactive picker. Cleared by `applyToolResult` when
  // the matching `tool-result` arrives, or by an explicit user response
  // routed through the controller (which emits a synthetic tool-result).
  // Bead: km-silvercode.askuserquestion-implement.
  if (action.name === "AskUserQuestion") {
    const parsed = parseAskUserQuestionInput(action.id, action.input)
    if (parsed) next.pendingQuestion = parsed
  }
  // tool-use implies a turn is in flight. In replay paths or harnesses
  // that synthesize tool-use without a preceding turn-start (e.g., tests
  // and some MCP-injection paths), upgrade `_activeTurnId` here so the
  // matching tool-result's `tool-running → thinking` flip has a valid
  // owner. Phase B will collapse this into a single turn-state mutation.
  if (next._activeTurnId === null) next._activeTurnId = action.turnId
  openLiveness(next, "tools", {
    id: action.id,
    kind: "tool",
    label: action.name,
    openedAt: action.ts,
    ownerTurnId: action.turnId,
  })
  setStatus(next, "tool-running", "tool-use", "tool-use", action.turnId)
}

function applyToolResult(next: InternalSessionState, action: Extract<AgentEvent, { kind: "tool-result" }>): void {
  const result: ToolResultEntry = { id: action.id, output: action.output, is_error: action.is_error }
  // Attach to whichever message has a matching tool op. Tool results
  // often arrive on a *later* turn (the model uses the tool, the harness
  // emits the result, the next assistant turn begins), so we search
  // every message — not just the most recent one.
  const idx = next.messages.findIndex((m) => m.ops.some((op) => op.kind === "tool" && op.toolCall.id === action.id))
  if (idx >= 0) {
    const msg = next.messages[idx]
    if (msg) {
      const ops: MessageOp[] = msg.ops.map((op) => {
        if (op.kind === "tool" && op.toolCall.id === action.id) {
          return { kind: "tool" as const, toolCall: op.toolCall, result, ts: op.ts }
        }
        return op
      })
      const updated = makeEntry({
        id: msg.id,
        role: msg.role,
        ops,
        blocks: msg.blocks,
        todos: msg.todos,
        stopReason: msg.stopReason,
        additionalContext: msg.additionalContext,
        ts: msg.ts,
      })
      next.messages = [...next.messages.slice(0, idx), updated, ...next.messages.slice(idx + 1)]
    }
  }
  // Clear pendingQuestion when its tool-result arrives (either a real
  // result from the agent, or a synthetic one emitted by the controller
  // when the user picks an option). Bead: km-silvercode.askuserquestion-
  // implement.
  if (next.pendingQuestion && next.pendingQuestion.toolUseId === action.id) {
    next.pendingQuestion = null
  }
  closeLiveness(next, "tools", "tool", action.id)
  // Status guard: only transition `tool-running → thinking`. A late
  // tool-result that arrives AFTER turn-end must NOT re-arm the spinner
  // — the ACP wire emits sessionUpdate notifications fire-and-forget
  // and races with the prompt response on the JSON-RPC stream, so a
  // tool_call_update can land on the consumer side after the synthetic
  // turn-end fired by withTurnLifecycle. Bead
  // km-silvercode.acp-status-as-derived tracks the architectural fix;
  // this guard is the symptomatic patch.
  if (next.status === "tool-running") setStatus(next, "thinking", "tool-result", "tool-result", next._activeTurnId)
}

function applyPermissionDecision(
  next: InternalSessionState,
  action: Extract<AgentEvent, { kind: "permission-decision" }>,
): void {
  next.permissions = next.permissions.filter((p) => p.requestId !== action.requestId)
  closeLiveness(next, "permissions", "permission", action.requestId)
  if (next.permissions.length > 0) {
    setStatus(
      next,
      "awaiting-permission",
      "permission-decision-pending",
      "permission-decision",
      action.requestId as unknown as TurnId,
    )
    return
  }

  const openToolTurnId = [...next._liveness.tools.values()].find((tool) => tool.ownerTurnId)?.ownerTurnId
  if (openToolTurnId) {
    setStatus(next, "tool-running", "permission-decision-resolved-tool", "permission-decision", openToolTurnId)
    return
  }
  if (next._activeTurnId !== null) {
    setStatus(next, "thinking", "permission-decision-resolved-turn", "permission-decision", next._activeTurnId)
    return
  }
  setStatus(next, "idle", "permission-decision-resolved-idle", "permission-decision")
}

/**
 * Derive ops from a finalized assistant-message's content blocks. Pure
 * — folds {@link consumeStrip} across the text blocks and threads the
 * updated strip out for the caller to merge.
 *
 * Returns `[derivedOps, finalStrip]`. The caller decides whether to use
 * `derivedOps` (when there were no prior streaming ops) or to discard
 * them (when the live stream already populated the entry's ops).
 */
function deriveOpsFromBlocks(
  strip: StripRuntime,
  turnId: TurnId,
  content: ReadonlyArray<ContentBlock>,
  ts: number,
): [MessageOp[], StripRuntime] {
  const ops: MessageOp[] = []
  let s = strip
  for (const b of content) {
    if (b.type === "text" && b.text.length > 0) {
      const [s2, stripped] = consumeStrip(s, turnId, b.text)
      s = s2
      if (stripped.length === 0) continue
      const last = ops[ops.length - 1]
      if (last?.kind === "text") {
        ops[ops.length - 1] = { kind: "text", text: last.text + stripped, ts: last.ts ?? ts }
      } else {
        ops.push({ kind: "text", text: stripped, ts })
      }
    } else if (b.type === "tool_use") {
      ops.push({
        kind: "tool",
        toolCall: { id: b.id, name: b.name, input: b.input, mcp_server: b.mcp_server },
        ts,
      })
    } else if (b.type === "tool_result") {
      const idx = ops.findIndex((op) => op.kind === "tool" && op.toolCall.id === b.tool_use_id)
      if (idx >= 0) {
        const op = ops[idx]
        if (op?.kind === "tool") {
          ops[idx] = {
            kind: "tool",
            toolCall: op.toolCall,
            result: { id: b.tool_use_id, output: b.output, is_error: b.is_error },
            ts: op.ts,
          }
        }
      } else {
        ops.push({ kind: "raw", label: `Orphan tool result ${b.tool_use_id}`, raw: b, ts })
      }
    } else if (b.type === "thinking" && b.text.length > 0) {
      const last = ops[ops.length - 1]
      if (last?.kind === "thinking") {
        ops[ops.length - 1] = { kind: "thinking", text: last.text + b.text, ts: last.ts ?? ts }
      } else {
        ops.push({ kind: "thinking", text: b.text, ts })
      }
    } else if (b.type === "raw") {
      ops.push({ kind: "raw", label: b.label, raw: b.raw, ts })
    }
    // Image blocks are currently handled by backend-specific surfaces.
  }
  return [ops, s]
}

function applyAssistantMessage(
  next: InternalSessionState,
  action: Extract<AgentEvent, { kind: "assistant-message" }>,
): void {
  // Live streaming builds m.ops incrementally via text-delta + tool-use
  // events; this aggregate fires at turn-end with the FINAL content
  // blocks. Replay (--resume) skips streaming events entirely — only
  // this aggregate fires. So when ops is empty, derive ops from
  // `event.content` *in order*, preserving any text/tool interleaving
  // the resumed transcript records.
  //
  // Replay path also needs echoed-prompt strip — message_start never
  // fires, so arm it on first encounter for this turn.
  let strip = next._strip
  if (!strip.byTurn.has(action.turnId)) strip = armStrip(strip, action.turnId)

  // Pre-compute the per-block consume passes so the upsert callback is
  // pure data; strip mutation is collected in the local `strip`.
  const existingIdx = next.messages.findIndex((m) => m.id === action.turnId)
  const existing = existingIdx >= 0 ? next.messages[existingIdx] : undefined
  const existingHasOps = existing ? existing.ops.length > 0 : false
  const existingCameFromAggregate = existing?.blocks !== undefined
  let derivedOps: MessageOp[] | null = null
  if (!existingHasOps || existingCameFromAggregate) {
    const [ops, finalStrip] = deriveOpsFromBlocks(strip, action.turnId, action.content, action.ts)
    strip = finalStrip
    derivedOps = ops
  }
  next._strip = strip
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    if (derivedOps !== null) {
      const ops = existingHasOps && existingCameFromAggregate ? [...m.ops, ...derivedOps] : derivedOps
      const blocks = existingCameFromAggregate
        ? [...(m.blocks ?? []), ...(action.content as ContentBlock[])]
        : action.content
      return { ...m, blocks: blocks as ContentBlock[], ops }
    }
    return { ...m, blocks: action.content as ContentBlock[] }
  })
}

function applyTurnEnd(next: InternalSessionState, action: Extract<AgentEvent, { kind: "turn-end" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    stopReason: action.stopReason,
  }))
  setStatus(next, "idle", "turn-end", "turn-end", action.turnId)
  closeLiveness(next, "turns", "turn", action.turnId)
  closeToolLivenessForTurn(next, action.turnId)
  if (next._activeTurnId === action.turnId) next._activeTurnId = null
  if (action.usage) {
    next.cost = {
      usd: next.cost.usd,
      inputTokens: next.cost.inputTokens + (action.usage.input_tokens ?? 0),
      outputTokens: next.cost.outputTokens + (action.usage.output_tokens ?? 0),
    }
  }
}

function applySessionEnd(next: InternalSessionState, action: Extract<AgentEvent, { kind: "session-end" }>): void {
  setStatus(next, "ended", "session-end-applied", "session-end")
  next._activeTurnId = null
  clearLiveness(next)
  if (typeof action.costUsd === "number") next.cost = { ...next.cost, usd: action.costUsd }
  if (action.usage) {
    next.cost = {
      usd: next.cost.usd,
      inputTokens: next.cost.inputTokens + (action.usage.input_tokens ?? 0),
      outputTokens: next.cost.outputTokens + (action.usage.output_tokens ?? 0),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reducer

/**
 * Pure reducer. Given the current state and an agent event, returns the
 * next state plus any effects the runtime must perform.
 *
 * **TEA discipline**: each `case` delegates to a single per-action
 * handler. Branching is purely on the *data update* (e.g. "did we re-key
 * an optimistic entry or upsert a fresh one?"); side-effect-like
 * concerns (strip-arm on user-message, todo extraction on TodoWrite,
 * status transitions) are computed unconditionally relative to the
 * action, never gated behind a data branch.
 *
 * This makes the No-Parallel-Derivation regression structurally
 * impossible: in the previous imperative shape, the `user-message`
 * dedup branch could `break` early and skip the strip-arm. Here, the
 * strip-arm is the first statement of {@link applyUserMessage}, so the
 * data-branch below cannot accidentally skip it.
 */
export function reduce(state: InternalSessionState, action: AgentEvent): [InternalSessionState, Effect[]] {
  const next: InternalSessionState = { ...state }
  const effects: Effect[] = []

  switch (action.kind) {
    case "session-init":
      applySessionInit(next, action)
      break
    case "slash-commands-update":
      // Mid-session refresh — the agent advertised a fresh full list of
      // available commands. ACP semantics: each update REPLACES the
      // previous list (a plugin unload must drop names from the snapshot
      // SessionState exposes). Bead: km-silvercode.slash-command-vault-
      // discovery.
      next.slashCommands = action.slashCommands
      break
    case "turn-start":
      applyTurnStart(next, action)
      break
    case "user-message":
      applyUserMessage(next, action)
      break
    case "raw-transcript":
      next.messages = upsertMessage(next.messages, action.turnId, () => ({
        id: action.turnId,
        role: "system",
        ops: [{ kind: "text", text: action.label, ts: action.ts }],
        additionalContext: typeof action.raw === "string" ? action.raw : JSON.stringify(action.raw, null, 2),
        ts: action.ts,
      }))
      break
    case "text-delta":
      applyTextDelta(next, action)
      break
    case "thinking-delta":
      applyThinkingDelta(next, action)
      break
    case "tool-use":
      applyToolUse(next, action)
      break
    case "tool-result":
      applyToolResult(next, action)
      break
    case "plan-update":
      applyPlanUpdate(next, action)
      break
    case "assistant-message":
      applyAssistantMessage(next, action)
      break
    case "turn-end":
      applyTurnEnd(next, action)
      break
    case "permission-request":
      next.permissions = [
        ...next.permissions,
        { requestId: action.requestId, tool: action.tool, args: action.args, options: action.options },
      ]
      openLiveness(next, "permissions", {
        id: action.requestId,
        kind: "permission",
        label: action.tool,
        openedAt: action.ts,
      })
      // permission-request carries no turnId on the wire (it's a side-channel
      // event), but its `requestId` is itself a valid ownership id — a
      // turn-end / session-end can't legitimately retire a permission-request
      // without its requestId being known. Pass it as the synthetic turnId
      // so the busy-status invariant doesn't false-trip when no upstream
      // turn-start fired (replay / synthetic harness paths).
      setStatus(
        next,
        "awaiting-permission",
        "permission-request",
        "permission-request",
        action.requestId as unknown as TurnId,
      )
      break
    case "permission-decision":
      applyPermissionDecision(next, action)
      break
    case "liveness-check":
      applyLivenessCheck(next, action)
      break
    case "status":
      // Harness "status" events are low-level annotations on whatever the
      // turn lifecycle already established. Only honour `requesting` when
      // a turn is genuinely in flight (status already running). If we're
      // idle / ended / awaiting-permission / spawning, a stray `requesting`
      // would flip status to "thinking" with no active turn — and because
      // controller.send gates the queue on idle/ended, the queue wedges
      // forever. km-silvercode.queue-stuck-thinking.
      //
      // L1 GUARD — load-bearing until Phase C deletes the stored
      // `next.status` writes. Phase A (this code) sits on top of the
      // gate; the dStatus log line above gives us evidence the gate is
      // doing its job (and would have caught any future regression
      // earlier). Do not relax this condition.
      if (action.status === "requesting" && (next.status === "thinking" || next.status === "tool-running")) {
        setStatus(next, "thinking", "status-event", "status", next._activeTurnId)
      }
      break
    case "session-end":
      applySessionEnd(next, action)
      break
    case "session-lifecycle":
      if (action.state === "ended") {
        setStatus(next, "ended", "lifecycle-ended", "session-lifecycle")
        next._activeTurnId = null
        clearLiveness(next)
      }
      break

    case "error":
      // Fold consecutive identical errors within ERROR_DEDUP_WINDOW_MS
      // into a single entry with count > 1. See `mergeError` and
      // bead km-silvercode.error-dedup.
      next.lastError = mergeError(state.lastError, action.message, action.ts)
      break

    case "handoff":
    case "km-reference":
      // No-op for M0/M1; wired through in M10.
      break
  }

  return [next, effects]
}

/**
 * Effect runner. Currently a no-op — the reducer doesn't emit any side-
 * effecting variants yet. Kept as the documented seam where future
 * effect handlers (notify-bell, persist-event-log, etc.) plug in without
 * changing the reducer's signature.
 */
export function runEffect(_effect: Effect): void {
  // Exhaustiveness check on the (currently empty) Effect union.
  // When a variant is added, the compiler will require a case here.
  const _exhaustive: never = _effect
  void _exhaustive
}
