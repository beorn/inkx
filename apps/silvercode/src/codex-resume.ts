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
 * the card. After replay, codex-acp's `loadSession` continues the live
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
 *   event_msg.agent_message      → ignored known duplicate
 *   event_msg.token_count        → ignored known usage metadata
 *   response_item.message:user   → ignored known bootstrap context
 *   response_item.message:dev    → ignored known instructions
 *   response_item.message:assist → text-delta
 *   response_item.function_call  → tool-use
 *   response_item.function_call_output → tool-result
 *   response_item.custom_tool_call → tool-use
 *   response_item.custom_tool_call_output → tool-result
 *   response_item.reasoning      → ignored known reasoning metadata
 *   turn_context                 → ignored known per-turn metadata
 *
 * Synthetic turn-end: if the transcript ends mid-turn (no final
 * task_complete after the last task_started), emit one so the store's
 * status returns to "idle" — same pattern as resume.ts. Without this,
 * `controller.send()` would buffer all input forever after a resume.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionId, SessionStore, ToolUseId, TurnId } from "@km/agent-harness"
import {
  commandText,
  parseCodexRolloutLine,
  parseCustomToolOutput,
  type CodexEventMsgPayload,
  type CodexResponseItemPayload,
  type CodexResponseMessagePayload,
} from "./session-model/codex-rollout.ts"

function codexSessionsRoot(): string {
  // Lazy: tests override HOME per-case, and we want each call to honor the
  // current env. Production callers see no behavioral change.
  return join(process.env.HOME ?? homedir(), ".codex", "sessions")
}

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
  blockIndex: number
  initEmitted: boolean
  cwd: string
  model: string
  execCommandEndCallIds: Set<string>
  patchApplyEndCallIds: Set<string>
}

function assertNever(value: never): never {
  throw new Error(`unreachable Codex transcript variant: ${JSON.stringify(value)}`)
}

function parseTs(s: string | undefined): number {
  if (!s) return Date.now()
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : Date.now()
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

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return ""
  let out = ""
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as { type?: string; text?: string }
      if ((p.type === "output_text" || p.type === "input_text") && typeof p.text === "string") {
        out += p.text
      }
    }
  }
  return out
}

function ensureTurn(rt: ReplayRuntime, ts: number, role: "user" | "assistant" = "assistant"): TurnId {
  if (rt.currentTurnId !== null) return rt.currentTurnId
  const synth = `synthetic-${ts}` as TurnId
  rt.store.apply({ kind: "turn-start", sessionId: rt.sessionId, turnId: synth, role, ts })
  rt.currentTurnId = synth
  rt.blockIndex = 0
  return synth
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
      rt.store.apply({ kind: "turn-start", sessionId: rt.sessionId, turnId, role: "assistant", ts })
      rt.currentTurnId = turnId
      rt.blockIndex = 0
      return
    }
    case "task_complete": {
      const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : rt.currentTurnId) as TurnId | null
      if (turnId) {
        rt.store.apply({ kind: "turn-end", sessionId: rt.sessionId, turnId, stopReason: "end_turn", ts })
        rt.currentTurnId = null
      }
      return
    }
    case "user_message": {
      const text = typeof payload.message === "string" ? payload.message : ""
      if (text.length > 0) {
        const turnId = `u-${ts}` as TurnId
        rt.store.apply({ kind: "user-message", sessionId: rt.sessionId, turnId, text, ts })
      }
      return
    }
    case "agent_message":
    case "token_count":
    case "context_compacted":
    case "view_image_tool_call":
      return
    case "exec_command_end": {
      const id = payload.call_id
      if (!id) return
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
      const exitCode = typeof payload.exit_code === "number" ? payload.exit_code : null
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id: id as ToolUseId,
        output: payload.aggregated_output ?? payload.stdout ?? "",
        is_error: payload.status === "failed" || (exitCode !== null && exitCode !== 0),
        ts,
      })
      return
    }
    case "patch_apply_end": {
      const id = payload.call_id
      if (!id) return
      rt.patchApplyEndCallIds.add(id)
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id: id as ToolUseId,
        output: payload.stdout ?? payload.stderr ?? "",
        is_error: payload.success === false || payload.status === "failed",
        ts,
      })
      return
    }
    default:
      assertNever(payload)
  }
}

function applyMessageResponse(rt: ReplayRuntime, payload: CodexResponseMessagePayload, ts: number): void {
  switch (payload.role) {
    case "assistant": {
      const text = extractTextContent(payload.content)
      if (text.length > 0) {
        const turnId = ensureTurn(rt, ts, "assistant")
        rt.store.apply({ kind: "text-delta", sessionId: rt.sessionId, turnId, blockIndex: rt.blockIndex, text, ts })
        rt.blockIndex++
      }
      return
    }
    case "user":
    case "developer":
    case "system":
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
      const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
      const name = typeof payload.name === "string" ? payload.name : "unknown"
      const input = parseArgs(payload.arguments)
      rt.store.apply({ kind: "tool-use", sessionId: rt.sessionId, turnId, id, name, input, ts })
      return
    }
    case "function_call_output": {
      const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
      if (rt.execCommandEndCallIds.has(id)) return
      const output = payload.output ?? ""
      rt.store.apply({ kind: "tool-result", sessionId: rt.sessionId, id, output, ts })
      return
    }
    case "custom_tool_call": {
      const turnId = ensureTurn(rt, ts, "assistant")
      const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
      const name = typeof payload.name === "string" ? payload.name : "unknown"
      const input = payload.input ?? {}
      rt.store.apply({ kind: "tool-use", sessionId: rt.sessionId, turnId, id, name, input, ts })
      if (payload.status === "failed") {
        rt.store.apply({
          kind: "tool-result",
          sessionId: rt.sessionId,
          id,
          output: typeof payload.error === "string" ? payload.error : "",
          is_error: true,
          ts,
        })
      }
      return
    }
    case "custom_tool_call_output": {
      const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
      if (rt.patchApplyEndCallIds.has(id)) return
      rt.store.apply({
        kind: "tool-result",
        sessionId: rt.sessionId,
        id,
        output: parseCustomToolOutput(payload.output),
        is_error: false,
        ts,
      })
      return
    }
    case "reasoning":
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
    blockIndex: 0,
    initEmitted: false,
    cwd: "",
    model: "",
    execCommandEndCallIds: new Set(),
    patchApplyEndCallIds: new Set(),
  }

  for (const [index, line] of raw.split("\n").entries()) {
    if (line.length === 0) continue
    const lineNumber = index + 1
    const parsed = parseCodexRolloutLine(path, line, lineNumber)
    const ts = parseTs(parsed.timestamp)

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
  }

  // Synthetic turn-end if the transcript ended mid-turn — same rationale as
  // Claude's resume path. Without this, status stays non-idle and
  // controller.send() routes all input into the queue buffer forever.
  if (rt.currentTurnId !== null) {
    store.apply({
      kind: "turn-end",
      sessionId: rt.sessionId,
      turnId: rt.currentTurnId,
      stopReason: "end_turn",
      ts: Date.now(),
    })
    rt.currentTurnId = null
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
