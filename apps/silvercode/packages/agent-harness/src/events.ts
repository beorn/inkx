/**
 * Canonical event schema — the typed surface all harness adapters expose.
 *
 * Raw stream-json from `claude --bare -p` is a superset; this module normalizes
 * it (and SDK events in Track 2, codex events in M12) into a uniform shape the
 * UI layer consumes. See parse.ts for the Claude-CLI normalizer.
 *
 * Event kinds intentionally model *turns* rather than individual messages. The
 * silvery UI (MessageList, ToolCallBlock, TodoPanel) binds to these events; the
 * session-store (session-store.ts) consumes them and emits signals for reactive
 * rendering.
 */

export type SessionId = string & { readonly __brand: "SessionId" }
export type TurnId = string & { readonly __brand: "TurnId" }
export type ToolUseId = string & { readonly __brand: "ToolUseId" }
export type PermissionRequestId = string & { readonly __brand: "PermissionRequestId" }

export type TokenCounts = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  total_cost_usd?: number
}

/** Content block inside an assistant message. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: ToolUseId; name: string; input: unknown; mcp_server?: string }
  | { type: "tool_result"; tool_use_id: ToolUseId; output: unknown; is_error?: boolean }
  | { type: "thinking"; text: string }
  | { type: "image"; mediaType: string; bytes?: number }

export type AgentEvent =
  | {
      kind: "session-init"
      sessionId: SessionId
      cwd: string
      model: string
      mode: string
      tools: string[]
      mcp_servers: string[]
      /** Slash commands the spawned agent advertises (built-in + plugin). */
      slashCommands: string[]
      /** Skill names the spawned agent has loaded. */
      skills: string[]
      /** Plugin names loaded into the spawned agent. */
      plugins: string[]
      ts: number
    }
  | { kind: "turn-start"; sessionId: SessionId; turnId: TurnId; role: "user" | "assistant"; ts: number }
  | { kind: "text-delta"; sessionId: SessionId; turnId: TurnId; blockIndex: number; text: string; ts: number }
  | { kind: "thinking-delta"; sessionId: SessionId; turnId: TurnId; blockIndex: number; text: string; ts: number }
  | {
      kind: "tool-use"
      sessionId: SessionId
      turnId: TurnId
      id: ToolUseId
      name: string
      input: unknown
      mcp_server?: string
      ts: number
    }
  | { kind: "tool-result"; sessionId: SessionId; id: ToolUseId; output: unknown; is_error?: boolean; ts: number }
  | {
      kind: "permission-request"
      sessionId: SessionId
      requestId: PermissionRequestId
      tool: string
      args: unknown
      ts: number
    }
  | { kind: "permission-decision"; sessionId: SessionId; requestId: PermissionRequestId; approved: boolean; ts: number }
  | { kind: "turn-end"; sessionId: SessionId; turnId: TurnId; stopReason?: string; usage?: TokenCounts; ts: number }
  | { kind: "assistant-message"; sessionId: SessionId; turnId: TurnId; content: ContentBlock[]; ts: number }
  | { kind: "user-message"; sessionId: SessionId; turnId: TurnId; text: string; additionalContext?: string; ts: number }
  | { kind: "status"; sessionId: SessionId; status: string; ts: number }
  | {
      kind: "session-end"
      sessionId: SessionId
      stopReason?: string
      usage?: TokenCounts
      costUsd?: number
      durationMs?: number
      ts: number
    }
  | { kind: "handoff"; from: SessionId; to: SessionId; context: unknown; ts: number }
  | {
      kind: "km-reference"
      sessionId: SessionId
      nodeId: string
      relation: "context" | "decision" | "output"
      ts: number
    }
  | { kind: "session-lifecycle"; sessionId: SessionId; state: "started" | "paused" | "resumed" | "ended"; ts: number }
  | { kind: "error"; sessionId: SessionId; message: string; raw?: unknown; ts: number }

/** Input to the subprocess. Writes to stdin as stream-json. */
export type AgentInput =
  | { type: "user"; message: { role: "user"; content: string } }
  | { type: "permission-response"; request_id: string; approved: boolean }
  | { type: "interrupt" }

/** Typed handle returned by spawnClaude / spawnSdk / spawnCodex. */
export interface AgentSession {
  readonly sessionId: SessionId
  /** Write a user message (already injected, ready for the agent). */
  send(text: string): void
  /** Approve or deny a pending permission request. */
  respondToPermission(requestId: PermissionRequestId, approved: boolean): void
  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(handler: (event: AgentEvent) => void): () => void
  /** Stop the subprocess and clean up. */
  close(): Promise<void>
  /** True if the subprocess has exited. */
  readonly closed: boolean
}

/** Utility type guard. */
export function isToolBlock(b: ContentBlock): b is Extract<ContentBlock, { type: "tool_use" }> {
  return b.type === "tool_use"
}
