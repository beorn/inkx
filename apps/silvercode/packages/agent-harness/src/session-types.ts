/**
 * Public types for the session reducer + store.
 *
 * Lives in its own module so the reducer (`session-reducer.ts`) and the
 * thin store shim (`session-store.ts`) both depend on a shared canonical
 * type surface, without `session-store.ts` becoming a transitive
 * dependency of pure tests of the reducer.
 *
 * Bead: km-silvercode.session-store-tea-refactor.
 */

import type { ContentBlock, SessionId, ToolUseId, TurnId } from "./events.ts"

export type RoleIndicator = "user" | "assistant" | "system"

/**
 * Inline tool-call entry stored on a `MessageOp` (no `mcp_server`
 * indirection; the value `name` already includes the namespaced prefix
 * when applicable).
 */
export type ToolCallEntry = { id: ToolUseId; name: string; input: unknown; mcp_server?: string }

/**
 * Inline tool-result entry. Optional — attached to its tool op when the
 * matching `tool-result` event arrives (often on a later turn).
 */
export type ToolResultEntry = { id: ToolUseId; output: unknown; is_error?: boolean }

/**
 * One operation produced by the agent within a turn. The order of `ops`
 * preserves the agent's emission order: `text` op for each contiguous run
 * of text deltas, `tool` op for each tool-use. Result attaches to the
 * matching tool op when it arrives. This preserves codex-style
 * text→tool→text→tool interleavings that are flattened away by the legacy
 * `text` + `toolCalls[]` representation.
 *
 * Bead: km-silvercode.codex-bundling-order.
 */
export type MessageOp =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolCall: ToolCallEntry; result?: ToolResultEntry }

/**
 * Public surface — both the new ordered `ops` field AND the legacy
 * `text` / `toolCalls` / `toolResults` projections coexist. Existing
 * consumers that read `.text`, `.toolCalls`, `.toolResults` keep working
 * through `Object.defineProperty` getters installed on every entry; new
 * consumers (renderer, harness) read `.ops` directly to preserve order.
 */
export type MessageEntry = {
  id: TurnId
  role: RoleIndicator
  /**
   * Order-preserving op stream — text runs and tool calls in arrival order.
   * This is the canonical storage; the legacy fields below are derived.
   */
  ops: MessageOp[]
  /** Derived: concatenation of every `text` op's text, in order. */
  readonly text: string
  /** Derived: every `tool` op's `toolCall`, in order. */
  readonly toolCalls: Array<ToolCallEntry>
  /** Derived: every `tool` op's `result`, when present, in order. */
  readonly toolResults: Array<ToolResultEntry>
  /** Final blocks once the turn closes (aggregated from assistant-message). */
  blocks?: ContentBlock[]
  /** TodoWrite extracted data, if any, for this turn. */
  todos?: Todo[]
  /** End-of-turn stop reason. */
  stopReason?: string
  /**
   * Hidden context attached to this message — system-reminder bodies,
   * hook output, isMeta entries, command-tag wrappers. Stripped from
   * `text` for chat readability but preserved here so the debug view
   * (`/raw`) can expose what the model actually received. Populated by
   * the parser on resume; live messages don't have it.
   * Bead: km-silvercode.resume-show-everything-collapsed.
   */
  additionalContext?: string
  ts: number
}

/**
 * Internal mutable shape used while the reducer is building / updating
 * an entry. The public {@link MessageEntry} adds derived getters via
 * {@link installEntryProjections} before the entry leaves the reducer.
 */
export type WritableEntry = {
  id: TurnId
  role: RoleIndicator
  ops: MessageOp[]
  blocks?: ContentBlock[]
  todos?: Todo[]
  stopReason?: string
  additionalContext?: string
  ts: number
}

/**
 * Install the legacy `text` / `toolCalls` / `toolResults` getters on a
 * just-built entry. Each is a pure projection over `ops`. Computing on
 * read keeps the projection in lock-step with `ops` without separate
 * accumulators that could drift.
 */
function installEntryProjections<T extends WritableEntry>(entry: T): MessageEntry {
  Object.defineProperty(entry, "text", {
    get(this: WritableEntry) {
      let s = ""
      for (const op of this.ops) {
        if (op.kind === "text") s += op.text
      }
      return s
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(entry, "toolCalls", {
    get(this: WritableEntry) {
      const out: ToolCallEntry[] = []
      for (const op of this.ops) {
        if (op.kind === "tool") out.push(op.toolCall)
      }
      return out
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(entry, "toolResults", {
    get(this: WritableEntry) {
      const out: ToolResultEntry[] = []
      for (const op of this.ops) {
        if (op.kind === "tool" && op.result) out.push(op.result)
      }
      return out
    },
    enumerable: true,
    configurable: true,
  })
  return entry as unknown as MessageEntry
}

/**
 * Build a fresh `MessageEntry`. Used everywhere the reducer creates or
 * updates an entry — guarantees the legacy projections are present so
 * existing consumers (controller, SessionCard, SidePanel, harness tests,
 * storybook fixtures) keep working without migration.
 */
export function makeEntry(init: WritableEntry): MessageEntry {
  return installEntryProjections({ ...init })
}

export type Todo = {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

export type SessionStatus = "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"

export type SessionState = {
  sessionId: SessionId | null
  model: string
  mode: string
  cwd: string
  tools: string[]
  mcpServers: string[]
  /** Slash commands the agent advertises (built-in + plugin). Populated from session-init. */
  slashCommands: string[]
  /** Skill names loaded in the agent. Populated from session-init. */
  skills: string[]
  /** Plugin names loaded in the agent. Populated from session-init. */
  plugins: string[]
  /** Claude Code CLI version the subprocess is running. */
  claudeCodeVersion: string
  /** Which auth path claude is using (ANTHROPIC_API_KEY, OAuth, etc.). */
  apiKeySource: string
  status: SessionStatus
  messages: MessageEntry[]
  permissions: Array<{ requestId: string; tool: string; args: unknown }>
  /** The most recent TodoWrite snapshot, regardless of which turn produced it. */
  todos: Todo[]
  /** Running cost + tokens. */
  cost: { usd: number; inputTokens: number; outputTokens: number }
  /**
   * Most recent error surfaced by the harness or parser.
   *
   * Consecutive identical errors within a 5s window collapse into one
   * entry with `count > 1` rather than appearing as separate entries.
   * "Identical" is by `message`; "consecutive" means no different
   * error in between. The window is bounded by `ts` of the last fold,
   * so a slow-but-steady drip (one error every 4s) stays folded.
   *
   * Bead: km-silvercode.error-dedup.
   */
  lastError: ErrorEntry | null
}

/**
 * Public projection of the most recent error.
 *
 * `count` is always present (≥ 1) and is `> 1` only when consecutive
 * identical errors were folded. Renderers display a `(×N)` suffix when
 * `count > 1`. `ts` is the most recent fold timestamp — used by the
 * dedup window check and useful for "X seconds ago" style UI.
 */
export type ErrorEntry = {
  message: string
  count: number
  ts: number
}

export function initialSessionState(): SessionState {
  return {
    sessionId: null,
    model: "",
    mode: "",
    cwd: "",
    tools: [],
    mcpServers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "",
    apiKeySource: "",
    // "idle" not "spawning": claude --bare -p doesn't emit session-init
    // until the first user message arrives on stdin, so the subprocess can
    // sit in a "running but not yet chatty" state for a while. Labelling
    // that as "spawning" is a lie — the process IS spawned, it's just
    // waiting for input. Real transient spawning state (if we ever need
    // it) can be set briefly during the synchronous spawn() call and
    // cleared immediately after the subprocess is alive.
    status: "idle",
    messages: [],
    permissions: [],
    todos: [],
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    lastError: null,
  }
}
