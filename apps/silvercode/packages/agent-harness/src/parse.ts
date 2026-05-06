/**
 * Stream-json parser for `claude --bare -p --output-format stream-json`.
 *
 * The raw format is newline-delimited JSON. Each line is one of:
 *   - {"type":"system","subtype":"init",...}       → session-init
 *   - {"type":"system","subtype":"status",...}     → status
 *   - {"type":"stream_event","event":{...}}        → message_start | content_block_start
 *                                                    | content_block_delta | content_block_stop
 *                                                    | message_delta | message_stop
 *   - {"type":"user","message":{...}}              → user-message (echoed)
 *   - {"type":"assistant","message":{...}}         → assistant-message (aggregated)
 *   - {"type":"result","subtype":"success",...}    → session-end
 *
 * We normalize this into AgentEvent (see events.ts). Callers feed raw lines via
 * `createStreamJsonParser().push(line)`; events surface through the subscriber.
 *
 * Side effect: this is also the first standalone stream-json parser in TS
 * (awesome-claude-code#1046 — the SDK couples parsing with subprocess
 * management). Exported as `@km/agent-harness/parse` so other tools can
 * consume stream-json without pulling in the spawn machinery.
 */

import type {
  AgentEvent,
  ContentBlock,
  PermissionRequestId,
  SessionId,
  TokenCounts,
  ToolUseId,
  TurnId,
} from "./events.ts"
import { quarantineLeadingRolePrefix } from "./transcript-loop-closure.ts"

type Emit = (event: AgentEvent) => void

type ParserState = {
  sessionId: SessionId | null
  currentTurnId: TurnId | null
  /** content_block_start sets this per-index so deltas can dispatch correctly. */
  blockTypeByIndex: Map<number, "text" | "tool_use" | "thinking">
  /** Accumulates partial tool_use input deltas until content_block_stop. */
  toolInputByIndex: Map<number, { id: ToolUseId; name: string; jsonFragments: string[] }>
  /** Map message.id → turnId so message_delta can emit turn-end. */
  turnIdByMessageId: Map<string, TurnId>
  /**
   * Whether a session-init has been emitted yet (synthetic-from-hook OR real
   * `subtype:"init"`). Modern claude (≥2.1.123) defers `subtype:"init"` until
   * after the first user message arrives, so the first hook_started /
   * hook_response event carrying a `session_id` synthesizes a placeholder
   * session-init to unblock downstream consumers (silvercode-claude-acp's
   * newSession waits for this event before resolving).
   *
   * Set when:
   *   1. We synthesize from a hook_started/hook_response (placeholder fields).
   *   2. We receive a real `subtype:"init"` (full populated fields — this
   *      ALSO emits a second session-init so consumers can refresh metadata
   *      that wasn't known at hook time).
   *
   * Bead: km-silvercode.claude-acp-modern-init-timing.
   */
  sessionInitSynthesized: boolean
}

function freshState(): ParserState {
  return {
    sessionId: null,
    currentTurnId: null,
    blockTypeByIndex: new Map(),
    toolInputByIndex: new Map(),
    turnIdByMessageId: new Map(),
    sessionInitSynthesized: false,
  }
}

function toSessionId(x: unknown): SessionId {
  return String(x ?? "unknown") as SessionId
}
function toTurnId(x: unknown): TurnId {
  return String(x ?? `turn-${Date.now()}`) as TurnId
}
function toToolUseId(x: unknown): ToolUseId {
  return String(x ?? `tool-${Date.now()}`) as ToolUseId
}
function toPermissionId(x: unknown): PermissionRequestId {
  return String(x ?? `perm-${Date.now()}`) as PermissionRequestId
}

function nowMs(): number {
  return Date.now()
}

function rawLabel(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "Raw transcript entry"
  const o = raw as Record<string, unknown>
  const type = typeof o.type === "string" ? o.type : "unknown"
  const nested =
    o.attachment &&
    typeof o.attachment === "object" &&
    typeof (o.attachment as Record<string, unknown>).type === "string"
      ? ` ${(o.attachment as Record<string, unknown>).type}`
      : ""
  return `Raw ${type}${nested}`
}

function isTrivialHookStdout(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length === 0 || trimmed === "{}" || trimmed === '{"continue":true}'
}

function hookLabel(attachment: Record<string, unknown>): string {
  const event = typeof attachment.hookEvent === "string" ? attachment.hookEvent : "Hook"
  const hookName = typeof attachment.hookName === "string" ? attachment.hookName : ""
  const command = typeof attachment.command === "string" ? attachment.command : ""
  const target = hookName.length > 0 ? hookName : command.length > 0 ? command : "hook"
  const exitCode = typeof attachment.exitCode === "number" ? attachment.exitCode : null
  return exitCode !== null && exitCode !== 0 ? `${event} failed: ${target}` : `${event}: ${target}`
}

function hookIsVisible(attachment: Record<string, unknown>): boolean {
  const exitCode = typeof attachment.exitCode === "number" ? attachment.exitCode : 0
  if (exitCode !== 0) return true
  if (attachment.hookEvent === "SessionStart") return false
  const content = typeof attachment.content === "string" ? attachment.content : ""
  const stdout = typeof attachment.stdout === "string" ? attachment.stdout : ""
  const stderr = typeof attachment.stderr === "string" ? attachment.stderr : ""
  return content.trim().length > 0 || stderr.trim().length > 0 || !isTrivialHookStdout(stdout)
}

type TranscriptMetadata = {
  label: string
  raw: unknown
}

function shortPath(path: string): string {
  const appsIndex = path.indexOf("/apps/")
  if (appsIndex >= 0) return path.slice(appsIndex + 1)
  const parts = path.split("/").filter((part) => part.length > 0)
  if (parts.length <= 3) return path
  return parts.slice(-3).join("/")
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function jsonSummary(raw: unknown): string {
  return JSON.stringify(raw, null, 2)
}

function compactFirstLine(value: unknown): string {
  if (typeof value !== "string") return ""
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  )
}

function recapLabel(content: unknown): string {
  const text = typeof content === "string" ? content.replace(/\s*\(disable recaps in \/config\)\s*$/i, "").trim() : ""
  return text.length > 0 ? `RECAP · ${text}` : "RECAP"
}

function countSkillListing(content: unknown): number {
  if (typeof content !== "string") return 0
  return content.split(/\r?\n/).filter((line) => /^\s*-\s+/.test(line)).length
}

function topLevelMetadata(obj: Record<string, unknown>): TranscriptMetadata | null {
  const type = obj.type
  if (type === "permission-mode") {
    const mode =
      typeof obj.permissionMode === "string" ? obj.permissionMode : typeof obj.mode === "string" ? obj.mode : ""
    return { label: mode.length > 0 ? `Permission mode: ${mode}` : "Permission mode changed", raw: obj }
  }
  if (type === "last-prompt") return { label: "Last prompt snapshot", raw: obj }
  if (type === "queue-operation") {
    const operation = typeof obj.operation === "string" ? obj.operation : "operation"
    return { label: `Queue ${operation}`, raw: obj }
  }
  if (type === "agent-name") {
    const name = typeof obj.agentName === "string" ? obj.agentName : ""
    return { label: name.length > 0 ? `Agent: ${shortPath(name)}` : "Agent name", raw: obj }
  }
  if (type === "custom-title") {
    const title = typeof obj.customTitle === "string" ? obj.customTitle : ""
    return { label: title.length > 0 ? `Title: ${shortPath(title)}` : "Custom title", raw: obj }
  }
  if (type === "ai-title") {
    const title = typeof obj.aiTitle === "string" ? obj.aiTitle : ""
    return { label: title.length > 0 ? `AI title: ${title}` : "AI title", raw: obj }
  }
  if (type === "file-history-snapshot") {
    const backups = Array.isArray(obj.trackedFileBackups) ? obj.trackedFileBackups.length : 0
    return { label: backups > 0 ? `File history snapshot: ${backups} files` : "File history snapshot", raw: obj }
  }
  return null
}

function attachmentMetadata(
  attachment: Record<string, unknown>,
  obj: Record<string, unknown>,
): TranscriptMetadata | null {
  const type = attachment.type
  if (type === "hook_success") {
    if (!hookIsVisible(attachment)) return null
    return { label: hookLabel(attachment), raw: attachment }
  }
  if (type === "hook_additional_context") {
    const hookName = typeof attachment.hookName === "string" ? attachment.hookName : ""
    const hookEvent = typeof attachment.hookEvent === "string" ? attachment.hookEvent : ""
    const content = stringList(attachment.content).join("\n\n")
    const subject = hookName.length > 0 ? hookName : hookEvent.length > 0 ? hookEvent : "hook"
    return { label: `Hook context: ${subject}`, raw: content.length > 0 ? content : attachment }
  }
  if (type === "edited_text_file") {
    const filename = typeof attachment.filename === "string" ? attachment.filename : "file"
    const snippet = typeof attachment.snippet === "string" ? attachment.snippet : jsonSummary(attachment)
    return { label: `Edited ${shortPath(filename)}`, raw: snippet }
  }
  if (type === "file") {
    const filename =
      typeof attachment.filename === "string"
        ? attachment.filename
        : typeof attachment.filePath === "string"
          ? attachment.filePath
          : "file"
    return { label: `Attached ${shortPath(filename)}`, raw: attachment }
  }
  if (type === "queued_command") {
    const commandMode = typeof attachment.commandMode === "string" ? attachment.commandMode : "command"
    const origin = attachment.origin && typeof attachment.origin === "object" ? attachment.origin : null
    const originKind =
      origin && typeof (origin as Record<string, unknown>).type === "string"
        ? ` from ${(origin as Record<string, unknown>).type}`
        : ""
    const prompt = compactFirstLine(attachment.prompt)
    return {
      label: prompt.length > 0 ? `Queued ${commandMode}: ${prompt}` : `Queued ${commandMode}${originKind}`,
      raw: attachment.prompt ?? attachment,
    }
  }
  if (type === "task_reminder" || type === "todo_reminder") {
    const count =
      typeof attachment.itemCount === "number" ? attachment.itemCount : stringList(attachment.content).length
    return { label: `Task reminder: ${count} item${count === 1 ? "" : "s"}`, raw: attachment }
  }
  if (type === "task_status") return { label: "Task status", raw: attachment }
  if (type === "deferred_tools_delta") {
    const added = stringList(attachment.addedNames)
    return { label: added.length > 0 ? `Tools available: ${added.length} added` : "Tools available", raw: attachment }
  }
  if (type === "mcp_instructions_delta") {
    const added = stringList(attachment.addedNames)
    return {
      label: added.length > 0 ? `MCP instructions: ${added.join(", ")}` : "MCP instructions",
      raw: attachment,
    }
  }
  if (type === "skill_listing") {
    const count = countSkillListing(attachment.content)
    return { label: count > 0 ? `Skills listed: ${count}` : "Skills listed", raw: attachment.content ?? attachment }
  }
  if (type === "auto_mode") {
    const reminder = typeof attachment.reminderType === "string" ? `: ${attachment.reminderType}` : ""
    return { label: `Auto mode${reminder}`, raw: attachment }
  }
  if (type === "command_permissions") return { label: "Command permissions", raw: attachment }
  if (type === "compact_file_reference") return { label: "Compact file reference", raw: attachment }
  if (type === "date_change") return { label: "Date changed", raw: attachment }
  if (type === "invoked_skills") return { label: "Invoked skills", raw: attachment }
  if (type === "nested_memory") return { label: "Nested memory", raw: attachment }
  return { label: rawLabel(obj), raw: obj }
}

function structuredToolResultOutput(obj: Record<string, unknown>, item: Record<string, unknown>): unknown {
  const fallback = (item.content as unknown) ?? (item.output as unknown) ?? ""
  const result = obj.toolUseResult
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>
    const stdout = typeof r.stdout === "string" ? r.stdout : ""
    const stderr = typeof r.stderr === "string" ? r.stderr : ""
    const exitCode = typeof r.exitCode === "number" ? r.exitCode : typeof r.exit_code === "number" ? r.exit_code : null
    if (stdout.length > 0 || stderr.length > 0 || exitCode !== null) {
      return {
        stdout,
        stderr,
        exitCode,
        content: fallback,
      }
    }
  }
  if (typeof result === "string") {
    const m = result.match(/(?:^Error:\s*)?Exit code (\d+)/)
    if (m?.[1]) {
      return {
        stdout: "",
        stderr: String(fallback),
        exitCode: Number(m[1]),
        content: fallback,
      }
    }
  }
  return fallback
}

/**
 * Result of normalizing on-disk user-message text:
 *   - `text` — the visible chat surface (what the user typed)
 *   - `additionalContext` — everything stripped (system-reminders, hook
 *     output, command tag wrappers). Preserved verbatim so the
 *     debug-view (`/raw`) can expose it on demand.
 *
 * Bead: `km-silvercode.resume-renders-system-reminders`,
 * `km-silvercode.resume-show-everything-collapsed`.
 */
type NormalizedUserText = { text: string; additionalContext: string }

/**
 * Strip Claude-Code wrapper tags from on-disk user-message text.
 *
 * The on-disk JSONL stores the FULL text Claude Code sent to the model,
 * which embeds wrapper tags around the actual user prompt:
 *   - `<system-reminder>...</system-reminder>` — hook output, env context
 *   - `<local-command-stdout>...</local-command-stdout>` — !-bang output
 *   - `<local-command-stderr>...</local-command-stderr>`
 *   - `<command-message>name</command-message>\n<command-name>/cmd</command-name>\n<command-args>args</command-args>`
 *     — slash command invocations (rendered as `/cmd args`)
 *
 * Normalizes the visible text to just what the user actually typed.
 * Returns "" if nothing usable remains (caller skips emitting an event).
 */
function normalizeUserText(raw: string): string {
  // Slash command shape: <command-name>/foo</command-name> + optional
  // <command-args>...</command-args>. When this shape is present, render
  // as "/foo args" — much closer to what the user typed. Args can
  // themselves contain embedded <system-reminder> blocks (the user typed
  // them as part of the prompt body) — recurse so those are stripped too.
  const cmdNameMatch = raw.match(/<command-name>([^<]*)<\/command-name>/)
  if (cmdNameMatch) {
    const name = cmdNameMatch[1]?.trim() ?? ""
    const argsMatch = raw.match(/<command-args>([\s\S]*?)<\/command-args>/)
    const args = argsMatch ? normalizeUserText(argsMatch[1] ?? "") : ""
    if (name.length > 0) return args.length > 0 ? `${name} ${args}` : name
  }
  // Otherwise: strip every wrapper tag (and its content) we know about.
  //
  // System-reminders nest (e.g. an outer <system-reminder> wraps an inner
  // task-tools nudge that itself uses <system-reminder>). Plain non-greedy
  // `<tag>...</tag>` matches outer-open + inner-close, which leaves the
  // outer-block's middle content stranded. Per-tag negative-lookahead
  // matches INNERMOST-first; iterating until stable peels the nesting
  // from the inside out.
  const tags = [
    "system-reminder",
    "local-command-stdout",
    "local-command-stderr",
    "command-message",
    "command-args",
    "command-name",
  ]
  const innermostRes = tags.map((t) => new RegExp(`<${t}>(?:(?!<${t}>)[\\s\\S])*?<\\/${t}>`, "g"))
  let stripped = raw
  let prev = ""
  while (prev !== stripped) {
    prev = stripped
    for (const re of innermostRes) stripped = stripped.replace(re, "")
  }
  // Safety net: any orphan open/close tokens left by malformed input.
  stripped = stripped.replace(new RegExp(`<\\/?(?:${tags.join("|")})>`, "g"), "")
  return stripped.trim()
}

/**
 * Extract the verbatim "additional context" stripped from the user
 * message — system-reminder bodies, command stdout/stderr, command-tag
 * wrappers. Used to drive the debug-view (`/raw`) so the user can see
 * EVERYTHING the model actually received without polluting the chat
 * surface.
 *
 * Bead: `km-silvercode.resume-show-everything-collapsed`.
 */
function extractAdditionalContext(raw: string): string {
  const tags = ["system-reminder", "local-command-stdout", "local-command-stderr"]
  const parts: string[] = []
  for (const tag of tags) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      const body = (m[1] ?? "").trim()
      if (body.length > 0) parts.push(`[${tag}]\n${body}`)
    }
  }
  return parts.join("\n\n")
}

function firstTagBody(raw: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(raw)
  return match?.[1]?.trim() ?? ""
}

function isTaskNotification(raw: string): boolean {
  return /^\s*<task-notification>[\s\S]*<\/task-notification>/m.test(raw)
}

function taskNotificationLabel(raw: string): string {
  const status = firstTagBody(raw, "status")
  const summary = firstTagBody(raw, "summary")
  const taskId = firstTagBody(raw, "task-id")
  const statusPrefix = status.length > 0 ? `Task ${status}` : "Task notification"
  const subject = summary.length > 0 ? summary : taskId.length > 0 ? taskId : "background task"
  return `${statusPrefix}: ${subject}`
}

function taskNotificationContext(raw: string): string {
  const result = firstTagBody(raw, "result")
  const outputFile = firstTagBody(raw, "output-file")
  const usage = firstTagBody(raw, "usage")
  const parts: string[] = []
  if (result.length > 0) parts.push(`[result]\n${result}`)
  if (outputFile.length > 0) parts.push(`[output-file]\n${outputFile}`)
  if (usage.length > 0) parts.push(`[usage]\n${usage}`)
  return parts.join("\n\n")
}

function userTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  let text = ""
  for (const item of content as Array<Record<string, unknown>>) {
    if (item.type === "text" && typeof item.text === "string") text += item.text
  }
  return text
}

function pickUsage(u: unknown): TokenCounts | undefined {
  if (!u || typeof u !== "object") return undefined
  const o = u as Record<string, unknown>
  const out: TokenCounts = {}
  if (typeof o.input_tokens === "number") out.input_tokens = o.input_tokens
  if (typeof o.output_tokens === "number") out.output_tokens = o.output_tokens
  if (typeof o.cache_creation_input_tokens === "number") {
    out.cache_creation_input_tokens = o.cache_creation_input_tokens
  }
  if (typeof o.cache_read_input_tokens === "number") {
    out.cache_read_input_tokens = o.cache_read_input_tokens
  }
  return out
}

export type StreamJsonParser = {
  /** Feed one JSON line (no trailing newline). */
  push(line: string): void
  /** Flush any buffered data (currently a no-op; reserved for chunked parsing). */
  flush(): void
  /** Reset internal state. */
  reset(): void
}

export function createStreamJsonParser(emit: Emit): StreamJsonParser {
  let state = freshState()

  function handleSystem(obj: Record<string, unknown>): void {
    const subtype = obj.subtype
    if (subtype === "init") {
      const sid = toSessionId(obj.session_id)
      state.sessionId = sid
      state.sessionInitSynthesized = true
      emit({
        kind: "session-init",
        sessionId: sid,
        cwd: String(obj.cwd ?? ""),
        model: String(obj.model ?? ""),
        mode: String(obj.permissionMode ?? obj.mode ?? "default"),
        tools: Array.isArray(obj.tools) ? (obj.tools as string[]) : [],
        mcp_servers: Array.isArray(obj.mcp_servers)
          ? (obj.mcp_servers as Array<{ name?: string } | string>).map((s) =>
              typeof s === "string" ? s : String(s?.name ?? ""),
            )
          : [],
        slashCommands: Array.isArray(obj.slash_commands) ? (obj.slash_commands as string[]) : [],
        skills: Array.isArray(obj.skills) ? (obj.skills as string[]) : [],
        plugins: Array.isArray(obj.plugins)
          ? (obj.plugins as Array<{ name?: string } | string>).map((p) =>
              typeof p === "string" ? p : String(p?.name ?? ""),
            )
          : [],
        claudeCodeVersion: typeof obj.claude_code_version === "string" ? (obj.claude_code_version as string) : "",
        apiKeySource: typeof obj.apiKeySource === "string" ? (obj.apiKeySource as string) : "",
        ts: nowMs(),
      })
      return
    }
    if (subtype === "away_summary") {
      const sid = state.sessionId ?? toSessionId(obj.session_id ?? obj.sessionId)
      state.sessionId = sid
      emit({
        kind: "raw-transcript",
        sessionId: sid,
        turnId: toTurnId((obj.uuid as string | undefined) ?? `away-summary-${nowMs()}`),
        label: recapLabel(obj.content),
        raw: obj,
        ts: nowMs(),
      })
      return
    }
    // Modern claude (≥2.1.123) defers `subtype:"init"` until AFTER the first
    // user message arrives on stdin. With stdin held idle, the first events
    // claude emits are the SessionStart hook envelopes —
    //   {"type":"system","subtype":"hook_started", …, session_id:<UUID>}
    //   {"type":"system","subtype":"hook_response", …, session_id:<UUID>}
    // — each carrying the real session_id. silvercode-claude-acp's
    // `newSession` waits for a session-init event before resolving; without
    // recognizing hook envelopes the wire stalls forever (or hits the 30s
    // timeout) and the user sees "spawn session failed: ACP connection
    // closed" on every fresh session.
    //
    // Fix: synthesize a session-init with placeholder fields on the FIRST
    // hook event seen (per parser instance), using the real session_id from
    // the envelope. When the real `subtype:"init"` lands later, it ALSO
    // emits a session-init (above branch) with the full populated metadata
    // — downstream consumers see two events and can refresh.
    //
    // Bead: km-silvercode.claude-acp-modern-init-timing.
    if (subtype === "hook_started" || subtype === "hook_response") {
      if (!state.sessionInitSynthesized) {
        const sid = toSessionId(obj.session_id)
        state.sessionId = sid
        state.sessionInitSynthesized = true
        emit({
          kind: "session-init",
          sessionId: sid,
          cwd: "",
          model: "",
          mode: "default",
          tools: [],
          mcp_servers: [],
          slashCommands: [],
          skills: [],
          plugins: [],
          claudeCodeVersion: "",
          apiKeySource: "",
          ts: nowMs(),
        })
      }
      // Hook events themselves carry diagnostic info (output, exit_code,
      // outcome) but no current AgentEvent variant maps them. Drop silently
      // after the first one synthesizes init — adding a dedicated
      // `hook-event` AgentEvent variant is future work if a consumer needs
      // it.
      return
    }
    if (subtype === "status") {
      if (!state.sessionId) state.sessionId = toSessionId(obj.session_id)
      emit({
        kind: "status",
        sessionId: state.sessionId,
        status: String(obj.status ?? ""),
        ts: nowMs(),
      })
    }
  }

  function handleStreamEvent(obj: Record<string, unknown>): void {
    const event = obj.event as Record<string, unknown> | undefined
    if (!event || typeof event !== "object") return
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    state.sessionId = sid
    const type = event.type

    if (type === "message_start") {
      const msg = event.message as Record<string, unknown> | undefined
      const msgId = String(msg?.id ?? `msg-${nowMs()}`)
      const turnId = toTurnId(msgId)
      state.currentTurnId = turnId
      state.turnIdByMessageId.set(msgId, turnId)
      state.blockTypeByIndex.clear()
      state.toolInputByIndex.clear()
      emit({
        kind: "turn-start",
        sessionId: sid,
        turnId,
        role: msg?.role === "user" ? "user" : "assistant",
        ts: nowMs(),
      })
      return
    }

    if (type === "content_block_start") {
      const idx = Number(event.index ?? 0)
      const block = event.content_block as Record<string, unknown> | undefined
      const bType = block?.type
      if (bType === "text") {
        state.blockTypeByIndex.set(idx, "text")
      } else if (bType === "thinking") {
        state.blockTypeByIndex.set(idx, "thinking")
      } else if (bType === "tool_use") {
        state.blockTypeByIndex.set(idx, "tool_use")
        const id = toToolUseId(block?.id)
        const name = String(block?.name ?? "")
        state.toolInputByIndex.set(idx, { id, name, jsonFragments: [] })
        emit({
          kind: "tool-use",
          sessionId: sid,
          turnId: state.currentTurnId ?? toTurnId(null),
          id,
          name,
          input: (block?.input as unknown) ?? {},
          mcp_server: typeof block?.mcp_server === "string" ? (block.mcp_server as string) : undefined,
          ts: nowMs(),
        })
      }
      return
    }

    if (type === "content_block_delta") {
      const idx = Number(event.index ?? 0)
      const delta = event.delta as Record<string, unknown> | undefined
      const dType = delta?.type
      const turnId = state.currentTurnId ?? toTurnId(null)
      if (dType === "text_delta") {
        emit({
          kind: "text-delta",
          sessionId: sid,
          turnId,
          blockIndex: idx,
          text: String(delta?.text ?? ""),
          ts: nowMs(),
        })
      } else if (dType === "thinking_delta") {
        emit({
          kind: "thinking-delta",
          sessionId: sid,
          turnId,
          blockIndex: idx,
          text: String(delta?.thinking ?? delta?.text ?? ""),
          ts: nowMs(),
        })
      } else if (dType === "input_json_delta") {
        // Accumulate tool input fragments; final parsed object emits on content_block_stop.
        const entry = state.toolInputByIndex.get(idx)
        if (entry) entry.jsonFragments.push(String(delta?.partial_json ?? ""))
      }
      return
    }

    if (type === "content_block_stop") {
      const idx = Number(event.index ?? 0)
      const entry = state.toolInputByIndex.get(idx)
      if (entry) {
        let parsed: unknown = {}
        const joined = entry.jsonFragments.join("")
        if (joined.length > 0) {
          try {
            parsed = JSON.parse(joined)
          } catch {
            parsed = { _raw: joined }
          }
        }
        // Re-emit tool-use with the fully parsed input (overwrites the partial one).
        emit({
          kind: "tool-use",
          sessionId: sid,
          turnId: state.currentTurnId ?? toTurnId(null),
          id: entry.id,
          name: entry.name,
          input: parsed,
          ts: nowMs(),
        })
      }
      return
    }

    if (type === "message_delta") {
      const delta = event.delta as Record<string, unknown> | undefined
      const stopReason = typeof delta?.stop_reason === "string" ? (delta.stop_reason as string) : undefined
      emit({
        kind: "turn-end",
        sessionId: sid,
        turnId: state.currentTurnId ?? toTurnId(null),
        stopReason,
        usage: pickUsage(event.usage),
        ts: nowMs(),
      })
      return
    }
    if (type === "message_stop") {
      // message_delta already emitted turn-end; nothing to do here for now.
    }
  }

  function handleAssistantAggregate(obj: Record<string, unknown>): void {
    const msg = obj.message as Record<string, unknown> | undefined
    if (!msg) return
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    state.sessionId = sid
    // Turn-id resolution for assistant events:
    //   1. If a live `message_start` registered this msg.id under a turnId
    //      (live stream), reuse it.
    //   2. Else if msg.id exists (JSONL-on-disk replay has no message_start
    //      but every assistant entry has an id), use msg.id directly — this
    //      guarantees every distinct assistant message gets a distinct bucket
    //      in the session store. Without this, replay collapsed 300+ messages
    //      into ~4 when multiple events fell into the same Date.now() ms.
    //   3. Fall back to currentTurnId / synthetic.
    const msgIdStr = typeof msg.id === "string" ? (msg.id as string) : ""
    const turnId =
      state.turnIdByMessageId.get(msgIdStr) ??
      (msgIdStr.length > 0 ? (msgIdStr as TurnId) : null) ??
      state.currentTurnId ??
      toTurnId(null)
    const rawContent = msg.content
    const blocks: ContentBlock[] = Array.isArray(rawContent)
      ? (rawContent as Array<Record<string, unknown>>)
          .map((b): ContentBlock | null => {
            const t = b.type
            if (t === "text") {
              // Layer 3 loop-closure: if the assistant text starts with a
              // role-prefix marker, quarantine it inline so the next
              // session's transcript builder does not re-ingest it as a
              // synthetic user turn. See ambient-context-safety.md § 3
              // Layer 3 / forensic session e8967322.
              return { type: "text", text: quarantineLeadingRolePrefix(String(b.text ?? "")) }
            }
            if (t === "thinking") return { type: "thinking", text: String(b.thinking ?? b.text ?? "") }
            if (t === "tool_use") {
              return {
                type: "tool_use",
                id: toToolUseId(b.id),
                name: String(b.name ?? ""),
                input: (b.input as unknown) ?? {},
                mcp_server: typeof b.mcp_server === "string" ? (b.mcp_server as string) : undefined,
              }
            }
            if (t === "tool_result") {
              return {
                type: "tool_result",
                tool_use_id: toToolUseId(b.tool_use_id),
                output: structuredToolResultOutput(obj, b),
                is_error: Boolean(b.is_error),
              }
            }
            return { type: "raw", label: `Unknown assistant block ${String(t)}`, raw: b }
          })
          .filter((b): b is ContentBlock => b != null)
      : []
    emit({
      kind: "assistant-message",
      sessionId: sid,
      turnId,
      content: blocks,
      ts: nowMs(),
    })
    const stopReason = typeof msg.stop_reason === "string" ? (msg.stop_reason as string) : undefined
    if (stopReason === "end_turn") {
      emit({
        kind: "turn-end",
        sessionId: sid,
        turnId,
        stopReason,
        usage: pickUsage(msg.usage),
        ts: nowMs(),
      })
    }
  }

  function handleUserEcho(obj: Record<string, unknown>): void {
    const msg = obj.message as Record<string, unknown> | undefined
    if (!msg) return
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    state.sessionId = sid
    // Claude stores post-/compact summaries as `type:"user"` because they
    // are replayed into the next model invocation, but they are generated
    // transcript context, not something the user typed. Keep them collapsed
    // as metadata so resume doesn't flood the default transcript surface.
    if (obj.isCompactSummary === true) {
      const compactText = userTextContent(msg.content).trim()
      if (compactText.length === 0) return
      const uniq = (msg.id as string | undefined) ?? (obj.uuid as string | undefined) ?? `compact-${nowMs()}`
      emit({
        kind: "raw-transcript",
        sessionId: sid,
        turnId: toTurnId(uniq),
        label: "Compact summary",
        raw: compactText,
        ts: nowMs(),
      })
      return
    }
    // On-disk JSONL marks internal Claude Code metadata entries with
    // `isMeta: true` at the top level (e.g. the post-/compact "Caveat"
    // banner, the "Continue from where you left off." auto-resume
    // prompt). These aren't user input — but they ARE context the model
    // received and may have responded to, so the debug-view (`/raw`)
    // surfaces them via additionalContext. Visible chat text stays
    // empty so they don't clutter the default surface. Live
    // stream-json never sets isMeta, so this branch only matters for
    // replay.
    if (obj.isMeta === true) {
      const metaText = userTextContent(msg.content).trim()
      if (metaText.length === 0) return
      const uniq = (msg.id as string | undefined) ?? (obj.uuid as string | undefined) ?? `meta-${nowMs()}`
      const turnId = toTurnId(uniq)
      // Don't advance currentTurnId — meta entries shouldn't anchor
      // following turn-end events.
      emit({
        kind: "user-message",
        sessionId: sid,
        turnId,
        text: "",
        additionalContext: `[isMeta]\n${metaText}`,
        ts: nowMs(),
      })
      return
    }
    let text = ""
    let additionalContext = ""
    let hasToolResult = false
    const content = msg.content
    if (typeof content === "string") {
      if (isTaskNotification(content)) {
        const uniq = (msg.id as string | undefined) ?? (obj.uuid as string | undefined) ?? `task-${nowMs()}`
        const context = taskNotificationContext(content)
        emit({
          kind: "raw-transcript",
          sessionId: sid,
          turnId: toTurnId(uniq),
          label: taskNotificationLabel(content),
          raw: context.length > 0 ? context : taskNotificationLabel(content),
          ts: nowMs(),
        })
        return
      }
      text = normalizeUserText(content)
      additionalContext = extractAdditionalContext(content)
    } else if (Array.isArray(content)) {
      for (const item of content as Array<Record<string, unknown>>) {
        if (item.type === "text" && typeof item.text === "string") text += item.text
        else if (item.type === "tool_result") {
          hasToolResult = true
          emit({
            kind: "tool-result",
            sessionId: sid,
            id: toToolUseId(item.tool_use_id),
            output: structuredToolResultOutput(obj, item),
            is_error: Boolean(item.is_error),
            ts: nowMs(),
          })
        }
      }
    }
    // Only start a new turn when the user actually sent *text*. Pure
    // tool_result echoes belong to the preceding assistant turn, so don't
    // advance currentTurnId for them (otherwise the subsequent turn-end
    // attaches to a phantom empty message).
    if (text.length > 0) {
      // Prefer the JSONL's top-level uuid over Date.now() for uniqueness —
      // Date.now() collides when several user messages fall in the same ms
      // during a replay, collapsing them into one store bucket. uuid is
      // stable per message on disk; msg.id is rare for user messages.
      const uniq =
        msg.id ?? (obj.uuid as string | undefined) ?? `user-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`
      const turnId = toTurnId(uniq)
      state.currentTurnId = turnId
      emit({
        kind: "user-message",
        sessionId: sid,
        turnId,
        text,
        additionalContext: additionalContext.length > 0 ? additionalContext : undefined,
        ts: nowMs(),
      })
    }
    if (!hasToolResult && text.length === 0) {
      // Nothing actionable — ignore.
    }
  }

  function handleResult(obj: Record<string, unknown>): void {
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    state.sessionId = sid
    emit({
      kind: "session-end",
      sessionId: sid,
      stopReason: typeof obj.stop_reason === "string" ? (obj.stop_reason as string) : undefined,
      usage: pickUsage(obj.usage),
      costUsd: typeof obj.total_cost_usd === "number" ? (obj.total_cost_usd as number) : undefined,
      durationMs: typeof obj.duration_ms === "number" ? (obj.duration_ms as number) : undefined,
      ts: nowMs(),
    })
  }

  function handlePermission(obj: Record<string, unknown>): void {
    // Not observed in the initial probe — Claude Code emits permission prompts
    // via a different mechanism (hook or MCP) depending on mode. Placeholder.
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    emit({
      kind: "permission-request",
      sessionId: sid,
      requestId: toPermissionId(obj.request_id ?? obj.id),
      tool: String(obj.tool ?? ""),
      args: obj.args ?? {},
      ts: nowMs(),
    })
  }

  function emitRawMetadata(obj: Record<string, unknown>, metadata: TranscriptMetadata): void {
    const sid = state.sessionId ?? toSessionId(obj.session_id ?? obj.sessionId)
    emit({
      kind: "raw-transcript",
      sessionId: sid,
      turnId: toTurnId((obj.uuid as string | undefined) ?? `raw-${nowMs()}`),
      label: metadata.label,
      raw: metadata.raw,
      ts: nowMs(),
    })
  }

  return {
    push(line: string): void {
      const trimmed = line.trim()
      if (trimmed.length === 0) return
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(trimmed) as Record<string, unknown>
      } catch (err) {
        const sid = state.sessionId ?? ("unknown" as SessionId)
        emit({
          kind: "error",
          sessionId: sid,
          message: `parse error: ${(err as Error).message}`,
          raw: trimmed,
          ts: nowMs(),
        })
        return
      }
      const type = obj.type
      if (type === "system") handleSystem(obj)
      else if (type === "stream_event") handleStreamEvent(obj)
      else if (type === "assistant") handleAssistantAggregate(obj)
      else if (type === "user") handleUserEcho(obj)
      else if (type === "result") handleResult(obj)
      else if (type === "permission-request") handlePermission(obj)
      else if (type === "attachment" && obj.attachment && typeof obj.attachment === "object") {
        const attachment = obj.attachment as Record<string, unknown>
        const metadata = attachmentMetadata(attachment, obj)
        if (metadata) emitRawMetadata(obj, metadata)
      } else {
        emitRawMetadata(obj, topLevelMetadata(obj) ?? { label: rawLabel(obj), raw: obj })
      }
    },
    flush(): void {
      /* no buffering — lines are pushed complete */
    },
    reset(): void {
      state = freshState()
    },
  }
}

/** Convenience: buffer a stream of bytes/strings, split on \n, feed the parser. */
export function createLineSplitter(onLine: (line: string) => void): {
  push(chunk: string | Uint8Array): void
  flush(): void
} {
  let buf = ""
  const decoder = new TextDecoder()
  return {
    push(chunk: string | Uint8Array): void {
      buf += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
      let idx = buf.indexOf("\n")
      while (idx !== -1) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        if (line.length > 0) onLine(line)
        idx = buf.indexOf("\n")
      }
    },
    flush(): void {
      if (buf.length > 0) {
        onLine(buf)
        buf = ""
      }
    },
  }
}
