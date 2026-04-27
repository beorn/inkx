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
 * Defensive contract: never throws. Missing file / empty file / corrupt
 * line / unrecognized variant → at most an `error` event applied to the
 * store (so the UI surfaces an actionable message) and the function
 * returns. Mirrors `resume.ts`'s contract for Claude Code.
 *
 * Mapping table:
 *
 *   session_meta                 → session-init
 *   event_msg.user_message       → user-message
 *   event_msg.task_started       → turn-start
 *   event_msg.task_complete      → turn-end
 *   event_msg.agent_message      → (skipped; same text appears in response_item)
 *   event_msg.token_count        → (skipped; usage delta not represented in
 *                                   AgentEvent.turn-end yet)
 *   response_item.message:user   → (skipped; system bootstrap context, not
 *                                   user-typed text — that comes via event_msg)
 *   response_item.message:dev    → (skipped; system instructions)
 *   response_item.message:assist → text-delta
 *   response_item.function_call  → tool-use
 *   response_item.function_call_output → tool-result
 *   response_item.reasoning      → (skipped; not displayed in v1)
 *   turn_context                 → (skipped; per-turn metadata)
 *
 * Synthetic turn-end: if the transcript ends mid-turn (no final
 * task_complete after the last task_started), emit one so the store's
 * status returns to "idle" — same pattern as resume.ts. Without this,
 * `controller.send()` would buffer all input forever after a resume.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, SessionId, SessionStore, ToolUseId, TurnId } from "@km/agent-harness"

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

type CodexLine = { timestamp?: string; type?: string; payload?: Record<string, unknown> }

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

/**
 * Read the codex JSONL transcript and apply transformed AgentEvents to the
 * store. Best-effort: malformed lines or unrecognized variants are silently
 * skipped (parser errors surface via the store error event only when fatal).
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

  const sid = sessionId as SessionId
  let currentTurnId: TurnId | null = null
  let blockIndex = 0
  let initEmitted = false
  let cwd = ""
  let model = ""

  const ensureTurn = (ts: number, role: "user" | "assistant" = "assistant"): TurnId => {
    if (currentTurnId !== null) return currentTurnId
    const synth = `synthetic-${ts}` as TurnId
    store.apply({ kind: "turn-start", sessionId: sid, turnId: synth, role, ts })
    currentTurnId = synth
    blockIndex = 0
    return synth
  }

  for (const line of raw.split("\n")) {
    if (line.length === 0) continue
    let parsed: CodexLine
    try {
      parsed = JSON.parse(line) as CodexLine
    } catch {
      continue
    }
    const ts = parseTs(parsed.timestamp)
    const payload = (parsed.payload ?? {}) as Record<string, unknown>

    if (parsed.type === "session_meta") {
      if (initEmitted) continue
      cwd = typeof payload.cwd === "string" ? payload.cwd : ""
      const provider = typeof payload.model_provider === "string" ? payload.model_provider : ""
      model = provider ? `codex (${provider})` : "codex"
      store.apply({
        kind: "session-init",
        sessionId: sid,
        cwd,
        model,
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
      initEmitted = true
      continue
    }

    if (parsed.type === "event_msg") {
      const sub = payload.type
      if (sub === "task_started") {
        const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : `t-${ts}`) as TurnId
        store.apply({ kind: "turn-start", sessionId: sid, turnId, role: "assistant", ts })
        currentTurnId = turnId
        blockIndex = 0
      } else if (sub === "task_complete") {
        const turnId = (typeof payload.turn_id === "string" ? payload.turn_id : currentTurnId) as TurnId | null
        if (turnId) {
          store.apply({ kind: "turn-end", sessionId: sid, turnId, stopReason: "end_turn", ts })
          currentTurnId = null
        }
      } else if (sub === "user_message") {
        const text = typeof payload.message === "string" ? payload.message : ""
        if (text.length > 0) {
          // User messages get their own turn-id; pick a stable one from the
          // timestamp so reapplies dedupe.
          const turnId = `u-${ts}` as TurnId
          store.apply({ kind: "user-message", sessionId: sid, turnId, text, ts })
        }
      }
      // event_msg.agent_message and event_msg.token_count are intentionally
      // skipped — agent_message duplicates the response_item.message content,
      // and token_count has no current consumer.
      continue
    }

    if (parsed.type === "response_item") {
      const sub = payload.type
      if (sub === "message") {
        const role = payload.role
        if (role === "assistant") {
          const text = extractTextContent(payload.content)
          if (text.length > 0) {
            const turnId = ensureTurn(ts, "assistant")
            store.apply({ kind: "text-delta", sessionId: sid, turnId, blockIndex, text, ts })
            blockIndex++
          }
        }
        // role:user and role:developer are skipped — system bootstrap context
        // and instructions, not user-visible turns.
      } else if (sub === "function_call") {
        const turnId = ensureTurn(ts, "assistant")
        const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
        const name = typeof payload.name === "string" ? payload.name : "unknown"
        const input = parseArgs(payload.arguments)
        store.apply({ kind: "tool-use", sessionId: sid, turnId, id, name, input, ts })
      } else if (sub === "function_call_output") {
        const id = (typeof payload.call_id === "string" ? payload.call_id : `tu-${ts}`) as ToolUseId
        const output = payload.output ?? ""
        store.apply({ kind: "tool-result", sessionId: sid, id, output, ts })
      }
      // reasoning is skipped — not displayed in v1.
      continue
    }

    // turn_context and any unknown top-level types are silently dropped.
  }

  // Synthetic turn-end if the transcript ended mid-turn — same rationale as
  // Claude's resume path. Without this, status stays non-idle and
  // controller.send() routes all input into the queue buffer forever.
  if (currentTurnId !== null) {
    store.apply({
      kind: "turn-end",
      sessionId: sid,
      turnId: currentTurnId,
      stopReason: "end_turn",
      ts: Date.now(),
    })
    currentTurnId = null
  }

  // If we never emitted an init (transcript started without session_meta —
  // shouldn't happen, but be defensive), surface a minimal one so the UI
  // has a session-id baseline.
  if (!initEmitted) {
    store.apply({
      kind: "session-init",
      sessionId: sid,
      cwd,
      model,
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
