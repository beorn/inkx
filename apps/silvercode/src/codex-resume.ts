/**
 * --resume backfill for codex sessions.
 *
 * Codex CLI persists per-session transcripts at
 *
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<iso-timestamp>-<sessionId>.jsonl
 *
 * with a different schema than Claude Code's stream-json. Each line has a
 * top-level `type` discriminator:
 *
 *   - "session_meta"     — once at start; carries id, cwd, model_provider, etc.
 *   - "turn_context"     — per-turn metadata; not needed for replay
 *   - "event_msg"        — codex CLI events (user_message, agent_message,
 *                          task_started, task_complete, token_count, ...)
 *   - "response_item"    — OpenAI Responses API items: function_call,
 *                          function_call_output, message (role
 *                          assistant/user/developer), reasoning
 *
 * This module reads the JSONL, walks events in order, and emits silvercode
 * canonical `AgentEvent`s into the session store so prior turns appear in
 * the block. After replay, codex-acp's `loadSession` continues the live
 * session; new events stream in on top of the replayed history.
 *
 * Strict schema contract: known variants are replayed or explicitly ignored.
 * Malformed lines and unknown variants throw with line-number context so
 * Codex schema drift cannot silently drop transcript content. Missing files
 * still surface as store errors because that is an environmental resume
 * failure, not an unrecognized transcript shape.
 *
 * Mapping table:
 *
 *   session_meta                 → session-init
 *   event_msg.user_message       → user-message
 *   event_msg.task_started       → turn-start
 *   event_msg.task_complete      → turn-end
 *   event_msg.turn_aborted       → turn-end (interrupted)
 *   event_msg.agent_message      → ignored known duplicate
 *   event_msg.token_count        → ignored known usage metadata
 *   event_msg.web_search_end     → ignored known web-search metadata
 *   event_msg.collab_*          → ignored known sub-agent metadata
 *   response_item.message:user   → user-message, except bootstrap context
 *   response_item.message:dev    → ignored known instructions
 *   response_item.message:assist → text-delta
 *   response_item.function_call  → tool-use
 *   response_item.function_call_output → tool-result
 *   response_item.custom_tool_call → tool-use
 *   response_item.custom_tool_call_output → tool-result
 *   response_item.web_search_call → ignored known web-search metadata
 *   response_item.reasoning      → ignored known reasoning metadata
 *   turn_context                 → ignored known per-turn metadata
 *
 * Synthetic turn-end: if the transcript ends mid-turn (no final
 * task_complete after the last task_started), emit one so the store's
 * status returns to "idle" — same pattern as resume.ts. Without this,
 * `controller.send()` would buffer all input forever after a resume.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PlanUpdateEntryStatus, SessionId, SessionStore, ToolUseId, TurnId } from "@km/agent-harness"
import { codexSessionsRoot } from "@km/config/paths"
import {
  commandText,
  parseCodexRolloutLine,
  parseCustomToolOutput,
  type CodexEventMsgPayload,
  type CodexResponseItemPayload,
  type CodexResponseMessagePayload,
} from "./session-model/codex-rollout.ts"

/**
 * Locate the rollout JSONL for a codex session id by walking
 * ~/.codex/sessions/YYYY/MM/DD/. Returns null if not found.
 *
 * Codex names files `rollout-<iso>-<sessionId>.jsonl`, so we search by
 * suffix. We walk newest-day-first to short-circuit common cases.
 */
export function findCodexTranscript(sessionId: string): string | null {
  const root = codexSessionsRoot()
  if (!existsSync(root)) return null
  const suffix = `-${sessionId}.jsonl`
  let years: string[]
  try {
    years = readdirSync(root)
      .filter((y) => /^\d{4}$/.test(y))
      .sort()
      .reverse()
  } catch {
    return null
  }
  for (const year of years) {
    const yearDir = join(root, year)
    let months: string[]
    try {
      months = readdirSync(yearDir)
        .filter((m) => /^\d{2}$/.test(m))
        .sort()
        .reverse()
    } catch {
      continue
    }
    for (const month of months) {
      const monthDir = join(yearDir, month)
      let days: string[]
      try {
        days = readdirSync(monthDir)
          .filter((d) => /^\d{2}$/.test(d))
          .sort()
          .reverse()
      } catch {
        continue
      }
      for (const day of days) {
        const dayDir = join(monthDir, day)
        let files: string[]
        try {
          files = readdirSync(dayDir)
        } catch {
          continue
        }
        for (const f of files) {
          if (f.endsWith(suffix) && f.startsWith("rollout-")) {
            return join(dayDir, f)
          }
        }
      }
    }
  }
  return null
}

type ReplayRuntime = {
  readonly store: SessionStore
  readonly sessionId: SessionId
  readonly path: string
  currentTurnId: TurnId | null
  currentTurnStartedAt: number | null
  blockIndex: number
  initEmitted: boolean
  cwd: string
  model: string
  execCommandEndCallIds: Set<string>
  patchApplyEndCallIds: Set<string>
  openToolIds: Set<string>
  seenUserMessages: Set<string>
}

function assertNever(value: never): never {
  throw new Error(`unreachable Codex transcript variant: ${JSON.stringify(value)}`)
}

function parseTs(s: string | undefined): number {
  if (!s) return Date.now()
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : Date.now()
}

function unexpectedShape(context: string, detail: string): never {
  throw new Error(`unsupported Codex transcript shape for ${context}: ${detail}`)
}

function requiredString(value: unknown, context: string, field: string): string {
  if (typeof value === "string") return value
  unexpectedShape(context, `${field} must be a string`)
}

/**
 * Parse codex-style JSON arguments. Codex stores function-call args as a
 * JSON-string in `arguments`; we surface the parsed object so silvercode
 * tool-call rendering matches Claude's shape. Falls back to the raw string
 * when parse fails so the user still sees the args.
 */
function parseArgs(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {}
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractTextContent(content: unknown, context: string): string {
  if (!Array.isArray(content)) unexpectedShape(context, "content must be an array")
  let out = ""
  for (const [index, part] of content.entries()) {
    if (!part || typeof part !== "object") {
      unexpectedShape(context, `content[${index}] must be an object`)
    }
    const p = part as { type?: unknown; text?: unknown }
    if (p.type !== "output_text" && p.type !== "input_text") {
      unexpectedShape(context, `content[${index}].type must be input_text or output_text`)
    }
    if (typeof p.text !== "string") unexpectedShape(context, `content[${index}].text must be a string`)
    out += p.text
  }
  return out
}

function isBootstrapUserContext(text: string): boolean {
  return text.includes("<INSTRUCTIONS>") || text.includes("<environment_context>")
}

function isCodexMetaUserMessage(text: string): boolean {
  return text.trimStart().startsWith("<turn_aborted>")
}

function userMessageTs(rt: ReplayRuntime, ts: number): number {
  if (rt.currentTurnStartedAt === null) return ts
  return Math.min(ts, rt.currentTurnStartedAt - 1)
}

function applyUserMessage(rt: ReplayRuntime, text: string, ts: number): void {
  if (
    text.length === 0 ||
    isBootstrapUserContext(text) ||
    isCodexMetaUserMessage(text) ||
    rt.seenUserMessages.has(text)
  ) {
    return
  }
  rt.seenUserMessages.add(text)
  const adjustedTs = userMessageTs(rt, ts)
  const turnId = `u-${adjustedTs}` as TurnId
  rt.store.apply({ kind: "user-message", sessionId: rt.sessionId, turnId, text, ts: adjustedTs })
}

function ensureTurn(rt: ReplayRuntime, ts: number, role: "user" | "assistant" = "assistant"): TurnId {
  if (rt.currentTurnId !== null) return rt.currentTurnId
  const synth = `synthetic-${ts}` as TurnId
  rt.store.apply({ kind: "turn-start", sessionId: rt.sessionId, turnId: synth, role, ts })
  rt.currentTurnId = synth
  rt.currentTurnStartedAt = ts
  rt.blockIndex = 0
  return synth
}

function codexPlanStatus(value: unknown): PlanUpdateEntryStatus {
  switch (typeof value === "string" ? value.toLowerCase() : "") {
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

function codexPlanEntries(payload: Record<string, unknown>): Array<{
  id?: string
  content: string
  status: PlanUpdateEntryStatus
  providerEntryId?: string
}> {
  type CodexPlanEntry = {
    id?: string
    content: string
    status: PlanUpdateEntryStatus
    providerEntryId?: string
  }
  const raw = Array.isArray(payload.plan)
    ? payload.plan
    : Array.isArray(payload.steps)
      ? payload.steps
      : Array.isArray(payload.items)
        ? payload.items
        : []
  const entries: CodexPlanEntry[] = []
  raw.forEach((item, index) => {
    if (typeof item === "string") {
      entries.push({ id: `codex-plan:${index}:${item}`, content: item, status: "pending" })
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
      id: providerEntryId ?? `codex-plan:${index}:${content}`,
      content,
      status: codexPlanStatus(o.status ?? o.state),
      providerEntryId,
    })
  })
  return entries
}

function applySessionMeta(rt: ReplayRuntime, payload: Record<string, unknown>, ts: number): void {
  if (rt.initEmitted) return
  rt.cwd = typeof payload.cwd === "string" ? payload.cwd : ""
  const provider = typeof payload.model_provider === "string" ? payload.model_provider : ""
  rt.model = provider ? `codex (${provider})` : "codex"
  rt.store.apply({
    kind: "session-init",
    sessionId: rt.sessionId,
    cwd: rt.cwd,
    model: rt.model,
    mode: "",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: typeof payload.cli_version === "string" ? payload.cli_version : "",
    apiKeySource: "",
    ts,
  })
  rt.initEmitted = true
}

function applyEventMsg(rt: ReplayRuntime, payload: CodexEventMsgPayload, ts: number): void {
  switch (payload.type) {
    case "task_started": {
      const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : `t-${ts}`) as TurnId
      if (rt.currentTurnId !== null && rt.currentTurnId !== turnId) {
        settleOpenTools(rt, ts, "Codex started another turn before this turn completed.", true)
        rt.store.apply({
          kind: "turn-end",
          sessionId: rt.sessionId,
          turnId: rt.currentTurnId,
          stopReason: "end_turn",
          ts,
        })
      }
      rt.store.apply({ kind: "turn-start", sessionId: rt.sessionId, turnId, role: "assistant", ts })
      rt.currentTurnId = turnId
      rt.currentTurnStartedAt = ts
      rt.blockIndex = 0
      return
    }
    case "task_complete": {
      const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : rt.currentTurnId) as TurnId | null
      if (turnId) {
        settleOpenTools(rt, ts, "Codex completed this turn before this tool produced a result.", false)
        rt.store.apply({ kind: "turn-end", sessionId: rt.sessionId, turnId, stopReason: "end_turn", ts })
        rt.currentTurnId = null
        rt.currentTurnStartedAt = null
      }
      return
    }
    case "turn_aborted": {
      const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : rt.currentTurnId) as TurnId | null
      if (turnId) {
        settleOpenTools(rt, ts, "Codex interrupted this turn before this tool produced a result.", true)
        rt.store.apply({ kind: "turn-end", sessionId: rt.sessionId, turnId, stopReason: "interrupted", ts })
        if (rt.currentTurnId === turnId) rt.currentTurnId = null
        if (rt.currentTurnId === null) rt.currentTurnStartedAt = null
      }
      return
    }
    case "user_message": {
      const text = requiredString(payload.message, "event_msg.user_message", "message")
      applyUserMessage(rt, text, ts)
      return
    }
    case "agent_message":
    case "agent_message_content_delta":
    case "agent_message_delta":
    case "agent_reasoning":
    case "agent_reasoning_delta":
    case "agent_reasoning_raw_content":
    case "agent_reasoning_raw_content_delta":
    case "agent_reasoning_section_break":
    case "apply_patch_approval_request":
    case "background_event":
    case "collab_agent_interaction_begin":
    case "collab_agent_interaction_end":
    case "collab_agent_spawn_begin":
    case "collab_agent_spawn_end":
    case "collab_close_begin":
    case "collab_close_end":
    case "collab_resume_begin":
    case "collab_resume_end":
    case "collab_waiting_begin":
    case "collab_waiting_end":
    case "token_count":
    case "context_compacted":
    case "deprecation_notice":
    case "dynamic_tool_call_request":
    case "dynamic_tool_call_response":
    case "elicitation_request":
    case "entered_review_mode":
    case "error":
    case "exec_approval_request":
    case "exec_command_begin":
    case "exec_command_output_delta":
    case "exited_review_mode":
    case "get_history_entry_response":
    case "guardian_assessment":
    case "hook_completed":
    case "hook_started":
    case "image_generation_begin":
    case "image_generation_end":
    case "item_completed":
    case "item_started":
    case "list_skills_response":
    case "mcp_list_tools_response":
    case "mcp_startup_complete":
    case "mcp_startup_update":
    case "mcp_tool_call_begin":
    case "mcp_tool_call_end":
    case "model_rerout":
    case "model_verification":
    case "patch_apply_begin":
    case "patch_apply_updated":
    case "plan_delta":
    case "plan_update": {
      const entries = codexPlanEntries(payload)
      if (entries.length > 0) {
        rt.store.apply({
          kind: "plan-update",
          sessionId: rt.sessionId,
          source: "codex-plan",
          entries,
          providerEventId: typeof payload.id === "string" ? payload.id : undefined,
          providerTurnId: typeof payload.turn_id === "string" ? payload.turn_id : undefined,
          ts,
        })
      }
      return
    }
    case "raw_response_item":
    case "reasoning_content_delta":
    case "reasoning_raw_content_delta":
    case "realtime_conversation_closed":
    case "realtime_conversation_list_voices_response":
    case "realtime_conversation_realtime":
    case "realtime_conversation_sdp":
    case "realtime_conversation_started":
    case "request_user_input":
    case "session_configured":
    case "shutdown_complete":
    case "skills_update_available":
    case "stream_error":
    case "terminal_interaction":
    case "thread_name_updated":
    case "thread_rolled_back":
    case "turn_diff":
    case "undo_completed":
    case "undo_started":
    case "view_image_tool_call":
    case "web_search_begin":
    case "web_search_end":
    case "warning":
      return
    case "exec_command_end": {
      const id = requiredString(payload.call_id, "event_msg.exec_command_end", "call_id")
      rt.execCommandEndCallIds.add(id)
      const turnId = ensureTurn(rt, ts, "assistant")
      const parsed = Array.isArray(payload.parsed_cmd) ? payload.parsed_cmd : []
      const firstParsed = parsed.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined
      const input = {
        cmd: typeof firstParsed?.cmd === "string" ? firstParsed.cmd : commandText(payload.command),
        cwd: payload.cwd,
        parsed_cmd: parsed,
        exit_code: payload.exit_code,
        status: payload.status,
      }
      rt.store.apply({
        kind: "tool-use",
        sessionId: rt.sessionId,
        turnId,
        id: id as ToolUseId,
        name: "exec_command",
        input,
        ts,
      })
      rt.openToolIds.add(id)
      const exitCode = typeof payload.exit_code === "number" ? payload.exit_code : null
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id: id as ToolUseId,
        output: payload.aggregated_output ?? payload.stdout ?? "",
        is_error: payload.status === "failed" || (exitCode !== null && exitCode !== 0),
        ts,
      })
      rt.openToolIds.delete(id)
      return
    }
    case "patch_apply_end": {
      const id = requiredString(payload.call_id, "event_msg.patch_apply_end", "call_id")
      rt.patchApplyEndCallIds.add(id)
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id: id as ToolUseId,
        output: payload.stdout ?? payload.stderr ?? "",
        is_error: payload.success === false || payload.status === "failed",
        ts,
      })
      rt.openToolIds.delete(id)
      return
    }
    default:
      assertNever(payload)
  }
}

function settleOpenTools(rt: ReplayRuntime, ts: number, output: string, isError: boolean): void {
  if (rt.openToolIds.size === 0) return
  for (const id of rt.openToolIds) {
    rt.store.apply({
      kind: "tool-result",
      sessionId: rt.sessionId,
      id: id as ToolUseId,
      output,
      is_error: isError,
      ts,
    })
  }
  rt.openToolIds.clear()
}

function applyMessageResponse(rt: ReplayRuntime, payload: CodexResponseMessagePayload, ts: number): void {
  switch (payload.role) {
    case "assistant": {
      const text = extractTextContent(payload.content, "response_item.message:assistant")
      if (text.length > 0) {
        const turnId = ensureTurn(rt, ts, "assistant")
        rt.store.apply({ kind: "text-delta", sessionId: rt.sessionId, turnId, blockIndex: rt.blockIndex, text, ts })
        rt.blockIndex++
      }
      return
    }
    case "user": {
      const text = extractTextContent(payload.content, "response_item.message:user")
      applyUserMessage(rt, text, ts)
      return
    }
    case "developer":
    case "system":
      // Known bootstrap/instruction roles are intentionally not replayed,
      // but their shape still has to match the transcript format we know.
      extractTextContent(payload.content, `response_item.message:${payload.role}`)
      return
    default:
      assertNever(payload.role)
  }
}

function applyResponseItem(rt: ReplayRuntime, payload: CodexResponseItemPayload, ts: number): void {
  switch (payload.type) {
    case "message":
      applyMessageResponse(rt, payload, ts)
      return
    case "function_call": {
      const turnId = ensureTurn(rt, ts, "assistant")
      const id = requiredString(payload.call_id, "response_item.function_call", "call_id") as ToolUseId
      const name = requiredString(payload.name, "response_item.function_call", "name")
      const input = parseArgs(payload.arguments)
      rt.store.apply({ kind: "tool-use", sessionId: rt.sessionId, turnId, id, name, input, ts })
      rt.openToolIds.add(id)
      return
    }
    case "function_call_output": {
      const id = requiredString(payload.call_id, "response_item.function_call_output", "call_id") as ToolUseId
      if (rt.execCommandEndCallIds.has(id)) return
      const output = payload.output ?? ""
      rt.store.apply({ kind: "tool-result", sessionId: rt.sessionId, id, output, ts })
      rt.openToolIds.delete(id)
      return
    }
    case "custom_tool_call": {
      const turnId = ensureTurn(rt, ts, "assistant")
      const id = requiredString(payload.call_id, "response_item.custom_tool_call", "call_id") as ToolUseId
      const name = requiredString(payload.name, "response_item.custom_tool_call", "name")
      const input = payload.input ?? {}
      rt.store.apply({ kind: "tool-use", sessionId: rt.sessionId, turnId, id, name, input, ts })
      rt.openToolIds.add(id)
      if (payload.status === "failed") {
        rt.store.apply({
          kind: "tool-result",
          sessionId: rt.sessionId,
          id,
          output: typeof payload.error === "string" ? payload.error : "",
          is_error: true,
          ts,
        })
        rt.openToolIds.delete(id)
      }
      return
    }
    case "custom_tool_call_output": {
      const id = requiredString(payload.call_id, "response_item.custom_tool_call_output", "call_id") as ToolUseId
      if (rt.patchApplyEndCallIds.has(id)) return
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id,
        output: parseCustomToolOutput(payload.output),
        is_error: false,
        ts,
      })
      rt.openToolIds.delete(id)
      return
    }
    case "compaction":
    case "execution":
    case "ghost_commit":
    case "ghost_snapshot":
    case "image_generation_call":
    case "other":
    case "reasoning":
    case "summary":
    case "tool_search_output":
    case "web_search_call":
      return
    default:
      assertNever(payload)
  }
}

/**
 * Read the codex JSONL transcript and apply transformed AgentEvents to the
 * store. Unknown schema variants throw; known-but-ignored variants are
 * represented as explicit switch cases in the handlers above.
 */
export function replayCodexSessionFromDisk(store: SessionStore, sessionId: string): void {
  const path = findCodexTranscript(sessionId)
  if (!path) {
    store.apply({
      kind: "error",
      sessionId: sessionId as SessionId,
      message:
        `--resume: no codex transcript for session "${sessionId}". ` +
        `Looked under ${codexSessionsRoot()}/YYYY/MM/DD/rollout-*-${sessionId}.jsonl. ` +
        `Codex may not have flushed the rollout yet, or the id is wrong.`,
      ts: Date.now(),
    })
    return
  }
  replayCodexTranscriptFile(store, sessionId, path)
}

export function replayCodexTranscriptFile(store: SessionStore, sessionId: string, path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (err) {
    store.apply({
      kind: "error",
      sessionId: sessionId as SessionId,
      message: `--resume: failed to read codex transcript at ${path}: ${(err as Error).message}`,
      ts: Date.now(),
    })
    return
  }

  const rt: ReplayRuntime = {
    store,
    sessionId: sessionId as SessionId,
    path,
    currentTurnId: null,
    currentTurnStartedAt: null,
    blockIndex: 0,
    initEmitted: false,
    cwd: "",
    model: "",
    execCommandEndCallIds: new Set(),
    patchApplyEndCallIds: new Set(),
    openToolIds: new Set(),
    seenUserMessages: new Set(),
  }

  for (const [index, line] of raw.split("\n").entries()) {
    if (line.length === 0) continue
    const lineNumber = index + 1
    const parsed = parseCodexRolloutLine(path, line, lineNumber)
    const ts = parseTs(parsed.timestamp)

    try {
      switch (parsed.type) {
        case "session_meta":
          applySessionMeta(rt, parsed.payload, ts)
          break
        case "event_msg":
          applyEventMsg(rt, parsed.payload, ts)
          break
        case "response_item":
          applyResponseItem(rt, parsed.payload, ts)
          break
        case "turn_context":
          break
        case "compacted":
          break
        default:
          assertNever(parsed)
      }
    } catch (err) {
      throw new Error(`--resume: ${path}:${lineNumber}: ${(err as Error).message}`)
    }
  }

  // Synthetic turn-end if the transcript ended mid-turn — same rationale as
  // Claude's resume path. Without this, status stays non-idle and
  // controller.send() routes all input into the queue buffer forever.
  if (rt.currentTurnId !== null) {
    settleOpenTools(rt, Date.now(), "Resume transcript ended before this tool produced a result.", true)
    store.apply({
      kind: "turn-end",
      sessionId: rt.sessionId,
      turnId: rt.currentTurnId,
      stopReason: "end_turn",
      ts: Date.now(),
    })
    rt.currentTurnId = null
    rt.currentTurnStartedAt = null
  }

  // If we never emitted an init (transcript started without session_meta —
  // shouldn't happen, but be defensive), surface a minimal one so the UI
  // has a session-id baseline.
  if (!rt.initEmitted) {
    store.apply({
      kind: "session-init",
      sessionId: rt.sessionId,
      cwd: rt.cwd,
      model: rt.model,
      mode: "",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "",
      apiKeySource: "",
      ts: Date.now(),
    })
  }
}
