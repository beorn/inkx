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
}

function freshState(): ParserState {
  return {
    sessionId: null,
    currentTurnId: null,
    blockTypeByIndex: new Map(),
    toolInputByIndex: new Map(),
    turnIdByMessageId: new Map(),
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

function pickUsage(u: unknown): TokenCounts | undefined {
  if (!u || typeof u !== "object") return undefined
  const o = u as Record<string, unknown>
  const out: TokenCounts = {}
  if (typeof o.input_tokens === "number") out.input_tokens = o.input_tokens
  if (typeof o.output_tokens === "number") out.output_tokens = o.output_tokens
  if (typeof o.cache_creation_input_tokens === "number")
    out.cache_creation_input_tokens = o.cache_creation_input_tokens
  if (typeof o.cache_read_input_tokens === "number")
    out.cache_read_input_tokens = o.cache_read_input_tokens
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
        ts: nowMs(),
      })
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
    const turnId = state.turnIdByMessageId.get(String(msg.id ?? "")) ?? state.currentTurnId ?? toTurnId(null)
    const rawContent = msg.content
    const blocks: ContentBlock[] = Array.isArray(rawContent)
      ? (rawContent as Array<Record<string, unknown>>)
          .map((b): ContentBlock | null => {
            const t = b.type
            if (t === "text") return { type: "text", text: String(b.text ?? "") }
            if (t === "thinking") return { type: "thinking", text: String(b.thinking ?? b.text ?? "") }
            if (t === "tool_use")
              return {
                type: "tool_use",
                id: toToolUseId(b.id),
                name: String(b.name ?? ""),
                input: (b.input as unknown) ?? {},
                mcp_server: typeof b.mcp_server === "string" ? (b.mcp_server as string) : undefined,
              }
            if (t === "tool_result")
              return {
                type: "tool_result",
                tool_use_id: toToolUseId(b.tool_use_id),
                output: (b.content as unknown) ?? (b.output as unknown) ?? "",
                is_error: Boolean(b.is_error),
              }
            return null
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
  }

  function handleUserEcho(obj: Record<string, unknown>): void {
    const msg = obj.message as Record<string, unknown> | undefined
    if (!msg) return
    const sid = state.sessionId ?? toSessionId(obj.session_id)
    state.sessionId = sid
    let text = ""
    let hasToolResult = false
    const content = msg.content
    if (typeof content === "string") text = content
    else if (Array.isArray(content)) {
      for (const item of content as Array<Record<string, unknown>>) {
        if (item.type === "text" && typeof item.text === "string") text += item.text
        else if (item.type === "tool_result") {
          hasToolResult = true
          emit({
            kind: "tool-result",
            sessionId: sid,
            id: toToolUseId(item.tool_use_id),
            output: (item.content as unknown) ?? (item.output as unknown) ?? "",
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
      const turnId = toTurnId(msg.id ?? `user-${nowMs()}`)
      state.currentTurnId = turnId
      emit({
        kind: "user-message",
        sessionId: sid,
        turnId,
        text,
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
      // Other types (queue-operation, last-prompt, file-history-snapshot, etc.)
      // appear in on-disk JSONL but not in stream-json live output; safe to ignore.
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
