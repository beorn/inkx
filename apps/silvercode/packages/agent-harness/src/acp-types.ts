/**
 * Silvercode canonical ACP-shaped types.
 *
 * These types deliberately mirror Agent Client Protocol (ACP) v1 at the
 * structural level — same fields, same discriminated-union tags — but live in
 * silvercode's own namespace. This way the boundary adapter (acp-boundary.ts)
 * is mostly identity, while silvercode's type surface is owned by silvercode
 * and insulated from `@agentclientprotocol/sdk` SDK type churn.
 *
 * **Promotion criterion** (when to drop this layer and use ACP types directly):
 * Both must hold —
 *   1. Zed reaches 100% spec coverage in its own ACP client.
 *   2. ACP's `protocolVersion` bumps to 2 with a real deprecation policy.
 * Until then, keep this layer. Re-evaluate quarterly. See
 * `apps/silvercode/packages/agent-harness/CLAUDE.md` for full rationale and
 * `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
 * § "ACP as silvery's internal domain model" / § "Reality check".
 *
 * **Boundary discipline**: only `acp-boundary.ts` may import from
 * `@agentclientprotocol/sdk`. Everywhere else in silvercode imports from this
 * module.
 */

// ---------------------------------------------------------------------------
// Branded id types
// ---------------------------------------------------------------------------

/** Session identifier — opaque string from the agent. */
export type SessionId = string & { readonly __brand: "SessionId" }

/** Tool-call identifier — unique within a session. */
export type ToolCallId = string & { readonly __brand: "ToolCallId" }

/** Permission-request identifier — unique within a session. */
export type PermissionRequestId = string & { readonly __brand: "PermissionRequestId" }

/** Permission-option identifier — references one option in a permission request. */
export type PermissionOptionId = string & { readonly __brand: "PermissionOptionId" }

/** Session-mode identifier (Plan / Act / Agent / etc.). */
export type SessionModeId = string & { readonly __brand: "SessionModeId" }

/** Wire protocol version (ACP `protocolVersion`). v1 = currently shipping. */
export type ProtocolVersion = number

// ---------------------------------------------------------------------------
// Annotations (metadata attached to content blocks)
// ---------------------------------------------------------------------------

export type Role = "user" | "assistant"

export interface Annotations {
  audience?: Role[] | null
  lastModified?: string | null
  priority?: number | null
}

// ---------------------------------------------------------------------------
// Content blocks — the structurally-typed payload for messages and tool I/O.
// ---------------------------------------------------------------------------

export interface TextContent {
  annotations?: Annotations | null
  text: string
}

export interface ImageContent {
  annotations?: Annotations | null
  data: string
  mimeType: string
  uri?: string | null
}

export interface AudioContent {
  annotations?: Annotations | null
  data: string
  mimeType: string
}

export interface ResourceLink {
  annotations?: Annotations | null
  description?: string | null
  mimeType?: string | null
  name: string
  size?: number | null
  title?: string | null
  uri: string
}

export interface TextResourceContents {
  mimeType?: string | null
  text: string
  uri: string
}

export interface BlobResourceContents {
  blob: string
  mimeType?: string | null
  uri: string
}

export type EmbeddedResourceResource = TextResourceContents | BlobResourceContents

export interface EmbeddedResource {
  annotations?: Annotations | null
  resource: EmbeddedResourceResource
}

/** Discriminated union of content blocks an agent or user can emit. */
export type ContentBlock =
  | (TextContent & { type: "text" })
  | (ImageContent & { type: "image" })
  | (AudioContent & { type: "audio" })
  | (ResourceLink & { type: "resource_link" })
  | (EmbeddedResource & { type: "resource" })

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

/**
 * Categories of tools the agent can invoke. Clients use this to choose icons
 * and to specialize per-kind body renderers (FilePreview, DiffView, etc.).
 *
 * Mirrors ACP's `ToolKind` literal union exactly.
 */
export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other"

/** Lifecycle status of a tool call. */
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed"

/** A file location associated with a tool call (for follow-along UI). */
export interface ToolCallLocation {
  line?: number | null
  path: string
}

/** Structured diff for `edit`-kind tool calls. */
export interface Diff {
  newText: string
  oldText?: string | null
  path: string
}

/** Reference to a client-managed terminal (for `execute`-kind tool calls). */
export interface Terminal {
  terminalId: string
}

/** A single content block produced by a tool call (wraps a ContentBlock). */
export interface Content {
  content: ContentBlock
}

/** Discriminated union of content a tool call can produce. */
export type ToolCallContent =
  | (Content & { type: "content" })
  | (Diff & { type: "diff" })
  | (Terminal & { type: "terminal" })

/**
 * A tool call advertised by the agent. Status / content / locations may be
 * incrementally refined via subsequent `tool_call_update` SessionUpdates.
 */
export interface ToolCall {
  toolCallId: ToolCallId
  title: string
  kind?: ToolKind
  status?: ToolCallStatus
  locations?: ToolCallLocation[]
  content?: ToolCallContent[]
  rawInput?: unknown
  rawOutput?: unknown
}

/**
 * Incremental update to a previously-announced tool call. All fields except
 * `toolCallId` are optional (and explicitly nullable per the ACP wire format).
 */
export interface ToolCallUpdate {
  toolCallId: ToolCallId
  title?: string | null
  kind?: ToolKind | null
  status?: ToolCallStatus | null
  locations?: ToolCallLocation[] | null
  content?: ToolCallContent[] | null
  rawInput?: unknown
  rawOutput?: unknown
}

// ---------------------------------------------------------------------------
// Plans — the typed TodoWrite equivalent.
// ---------------------------------------------------------------------------

export type PlanEntryStatus = "pending" | "in_progress" | "completed"
export type PlanEntryPriority = "high" | "medium" | "low"

export interface PlanEntry {
  content: string
  priority: PlanEntryPriority
  status: PlanEntryStatus
}

export interface Plan {
  entries: PlanEntry[]
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

export interface UnstructuredCommandInput {
  hint: string
}

/**
 * Input descriptor for a slash command. Currently only "unstructured" exists
 * in ACP — the entire field is the unstructured shape. Kept as an alias so
 * future ACP variants slot into the same union without breaking consumers.
 */
export type AvailableCommandInput = UnstructuredCommandInput

export interface AvailableCommand {
  name: string
  description: string
  input?: AvailableCommandInput | null
}

export interface AvailableCommandsUpdate {
  availableCommands: AvailableCommand[]
}

// ---------------------------------------------------------------------------
// Session mode + config + info + usage
// ---------------------------------------------------------------------------

export interface SessionMode {
  id: SessionModeId
  name: string
  description?: string | null
}

export interface CurrentModeUpdate {
  currentModeId: SessionModeId
}

/**
 * Session configuration option update — agent advertises which configuration
 * options are available (model, thinking-level, etc.). Kept opaque at this
 * layer — full typed-config UI lives in silvercode components.
 */
export interface ConfigOptionUpdate {
  /** Full set of configuration options + current values. Opaque payload. */
  configOptions: unknown[]
}

export interface SessionInfoUpdate {
  title?: string | null
  updatedAt?: string | null
}

export interface Cost {
  amount: number
  currency: string
}

export interface UsageUpdate {
  size: number
  used: number
  cost?: Cost | null
}

// ---------------------------------------------------------------------------
// Streaming session updates — the discriminated union UI components consume.
// ---------------------------------------------------------------------------

/** Wraps a single ContentBlock for chunked streaming (mirrors ACP ContentChunk). */
export interface ContentChunk {
  content: ContentBlock
  /** Optional message id — chunks with the same messageId belong to the same message. */
  messageId?: string | null
}

/**
 * The streaming-update discriminated union. One variant per ACP
 * `SessionUpdate.sessionUpdate` value. Components match on `sessionUpdate`.
 */
export type SessionUpdate =
  | (ContentChunk & { sessionUpdate: "user_message_chunk" })
  | (ContentChunk & { sessionUpdate: "agent_message_chunk" })
  | (ContentChunk & { sessionUpdate: "agent_thought_chunk" })
  | (ToolCall & { sessionUpdate: "tool_call" })
  | (ToolCallUpdate & { sessionUpdate: "tool_call_update" })
  | (Plan & { sessionUpdate: "plan" })
  | (AvailableCommandsUpdate & { sessionUpdate: "available_commands_update" })
  | (CurrentModeUpdate & { sessionUpdate: "current_mode_update" })
  | (ConfigOptionUpdate & { sessionUpdate: "config_option_update" })
  | (SessionInfoUpdate & { sessionUpdate: "session_info_update" })
  | (UsageUpdate & { sessionUpdate: "usage_update" })

/** Convenience: just the discriminator literals from SessionUpdate. */
export type SessionUpdateKind = SessionUpdate["sessionUpdate"]

// ---------------------------------------------------------------------------
// Permissions — the request the agent makes to the client to authorize a tool.
// ---------------------------------------------------------------------------

/**
 * Hint about what kind of permission option this is. Lets clients render
 * "Allow" / "Allow always" / "Reject" / "Reject always" with appropriate
 * affordances (colors, default focus, keyboard shortcuts).
 */
export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always"

export interface PermissionOption {
  optionId: PermissionOptionId
  name: string
  kind: PermissionOptionKind
}

export interface RequestPermissionRequest {
  sessionId: SessionId
  toolCall: ToolCallUpdate
  options: PermissionOption[]
}

export interface SelectedPermissionOutcome {
  optionId: PermissionOptionId
}

export type RequestPermissionOutcome = { outcome: "cancelled" } | (SelectedPermissionOutcome & { outcome: "selected" })

export interface RequestPermissionResponse {
  outcome: RequestPermissionOutcome
}

// ---------------------------------------------------------------------------
// Capabilities — declared during initialize(), drive feature gating in UI.
// ---------------------------------------------------------------------------

/**
 * Filesystem capabilities the *client* advertises. The agent uses these to
 * decide whether to call `fs/read_text_file` / `fs/write_text_file` rather
 * than touching disk directly.
 */
export interface FileSystemCapabilities {
  readTextFile?: boolean
  writeTextFile?: boolean
}

/**
 * What the client (silvercode) can do. Sent to the agent in the initialize
 * exchange. Kept structurally compatible with ACP's ClientCapabilities at v1
 * — additional fields can be added without breaking consumers.
 */
export interface ClientCapabilities {
  fs?: FileSystemCapabilities
  terminal?: boolean
}

/**
 * What the agent can do. Received from the agent in the initialize response.
 * Drives UI feature gating (no thinking? hide the thinking pane).
 */
export interface AgentCapabilities {
  loadSession?: boolean
  promptCapabilities?: {
    audio?: boolean
    embeddedContext?: boolean
    image?: boolean
  }
}

// ---------------------------------------------------------------------------
// Stop reason — emitted at the end of a prompt turn.
// ---------------------------------------------------------------------------

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled"
