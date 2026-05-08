/**
 * Controller — owns N sessions, routes events into per-session stores, and
 * wires subscriptions back out to React.
 *
 * Keeps the UI declarative: React components never call spawn directly, they
 * call controller methods. The controller is the bridge between the silvery
 * render tree and the headless agent-harness.
 */

import { createLogger } from "loggily"
import { existsSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import createDebug from "debug"
import {
  type AgentEvent,
  type AgentSession,
  type EventLog,
  type Injector,
  type McpServerSpec,
  type PermissionOptionId,
  type PermissionRequestId,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionId,
  type SessionStore,
  type TurnId,
  type AcpSetSessionConfigOptionParams,
  acpRequestPermissionToSilvercode,
  silvercodeRequestPermissionResponseToAcp,
  channelDigestInjector,
  connectAcpRegistry,
  createFileEventLog,
  createSessionStore,
  cwdInjector,
  spawnClaude,
  spawnCodex,
  spawnSdk,
  activeBeadInjector,
  type AcpRegistryId,
} from "@km/agent-harness"
import { createScope, type Scope } from "@silvery/scope"
import { createInMemoryTribe, type TribeBackend } from "@km/tribe-mcp"
import { resolveAccountDir } from "./accounts.ts"
import { bdPrimeOutputAsync, bdPrimePeek, readActiveBeadAsync, readActiveBeadPeek } from "./bd-prime.ts"
import { type ChannelEvent, type ChannelQueue, createChannelQueue } from "./channel-queue.ts"
import { type NotificationStream, createNotificationStream } from "./notification-stream.ts"
import { type MuteState, createMuteState } from "./mute-state.ts"
import { wireChannelSources } from "./channel-sources.ts"
import { registerAllNotificationAdapters } from "./notification-adapters/index.ts"
import { findCodexTranscript, replayCodexSessionFromDisk } from "./codex-resume.ts"
import { triggerRecallProbe } from "./notification-adapters/recall.ts"
import { type CoordinatorMcpServer, createCoordinatorMcpServer } from "./coordinator-mcp.ts"
import { type CrossAgentState, createCrossAgentState } from "./cross-agent-state.ts"
import { replaySessionFromDisk, sessionJsonlPath } from "./resume.ts"
import { discoverClaudeSubagentSessions } from "./claude-subagent-sessions.ts"
import type { SessionHistoryMetadata, SubagentSessionSummary } from "./session-metadata.ts"
import type { ReasoningEffort, SessionConfigValue } from "./config-schema.ts"

// Queue diagnostics — enable with `DEBUG=silvercode:queue` (combined with
// `DEBUG_LOG=<path>` when running the TUI so the alt-screen UI isn't
// polluted). Traces every send/setQueuedText/tryFlush and the decision the
// controller made. Loaded when investigating "queue items stay there"
// reports — auto-flush should fire on `turn-end`.
const dQueue = createDebug("silvercode:queue")
const dBackground = createDebug("silvercode:background")
const dRecall = createDebug("silvercode:recall")

function createReplayOnlySession(sessionId: string, sendFailureMessage: string): AgentSession {
  const subscribers = new Set<(event: AgentEvent) => void>()
  let closed = false
  const sid = sessionId as SessionId
  let offlineTurnSeq = 0

  function emit(event: AgentEvent): void {
    if (closed) return
    for (const handler of Array.from(subscribers)) handler(event)
  }

  return {
    sessionId: sid,
    send(text: string): void {
      if (closed) return
      const ts = Date.now()
      const turnId = `offline-${ts}-${++offlineTurnSeq}` as TurnId
      emit({ kind: "user-message", sessionId: sid, turnId, text, ts })
      emit({ kind: "error", sessionId: sid, message: sendFailureMessage, ts: ts + 1 })
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      if (closed) return
      emit({ kind: "permission-decision", sessionId: sid, requestId, approved, ts: Date.now() })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      subscribers.add(handler)
      return () => subscribers.delete(handler)
    },
    close(): Promise<void> {
      closed = true
      subscribers.clear()
      return Promise.resolve()
    },
    get closed(): boolean {
      return closed
    },
    [Symbol.asyncDispose](): Promise<void> {
      return this.close()
    },
  }
}

/**
 * Trigger a recall probe every Nth assistant `turn-end` per session.
 * Five matches the design rationale (rare-token extraction is a future
 * upgrade; the simpler "verbatim every-Nth-turn" rule is the v1 step
 * defined in the recall adapter docs). Recall itself self-rate-limits
 * to ≥60s between queries, so a high-frequency conversation hits the
 * rate limit before this counter wraps.
 */
const RECALL_PROBE_TURN_INTERVAL = 5
/** Cap on how much of the last user prompt we hand to recall. */
const RECALL_QUERY_MAX_CHARS = 500

/**
 * Hard cap on concurrent live AgentSessions per controller. Each session
 * carries a claude subprocess + N MCP grandchildren (typically 3-8 worker
 * processes total per pane), so 8 panes ≈ 24-64 worker processes — already
 * generous. Past this, additional `spawnSession()` calls reject with an
 * explicit error so a runaway loop fails closed instead of fork-bombing.
 *
 * If a real workflow needs more, lift this — the value is a guardrail, not
 * a product limit.
 */
const MAX_LIVE_SESSIONS = 8

/**
 * Prefix that marks a synthetic "background result" system message stuffed
 * into the conversation by `completeJob`. SessionUpdateList recognises this
 * prefix and renders the row with a distinct (system) treatment instead of
 * the default user-message styling. Exported so test + UI code stays in
 * lockstep with the controller — the prefix is the contract.
 *
 * Pure ASCII (no fancy unicode chevrons): emoji-leaning code points like
 * U+25B6 BLACK RIGHT-POINTING TRIANGLE silently get the VS16 selector
 * applied by terminals that prefer emoji presentation, breaking the
 * contains-substring contract for tests that live below the rendering
 * layer.
 */
export const BACKGROUND_MESSAGE_PREFIX = "[bg] "

/**
 * Resolve stdio MCP server specs for a spawned session. Each session gets:
 *   - km-mcp-server (km_search / km_get_node / km_get_board / km_render_path)
 *   - km-tribe-mcp (tribe_send / tribe_history / tribe_members / tribe_broadcast)
 *
 * Both run via `bun run` against the workspace package src so they resolve
 * workspace deps the same way the host does. TRIBE_SESSION_NAME keys the
 * tribe backend to this session's identity.
 */
function defaultMcpServers(sessionName: string, workspaceRoot: string, kmDbPath: string | null): McpServerSpec[] {
  const tribeBin = resolvePath(workspaceRoot, "apps/silvercode/packages/tribe-mcp/src/bin.ts")
  const specs: McpServerSpec[] = [
    {
      name: "tribe",
      command: "bun",
      args: ["run", tribeBin],
      env: { TRIBE_SESSION_NAME: sessionName },
    },
  ]
  // Declare km MCP ONLY when the bin can start (db exists). claude is
  // launched with --strict-mcp-config so any declared server that fails
  // to init blocks the session. The bin itself throws on missing db per
  // principles.md (fail fast, fail loud); the controller's job is to
  // decide not to declare it in the first place. Absence of km tools
  // surfaces in the session-init event (mcp_servers list) and in the
  // UI's meta block, which is honest about what's mounted.
  if (kmDbPath) {
    const kmBin = resolvePath(workspaceRoot, "apps/silvercode/packages/km-mcp-server/src/bin.ts")
    specs.push({
      name: "km",
      command: "bun",
      args: ["run", kmBin],
      env: { KM_DB_PATH: kmDbPath },
    })
  }
  return specs
}

/** Locate .km/state.db for the km MCP. Returns null if not found. */
function findKmDb(cwd: string): string | null {
  const envPath = process.env.KM_DB_PATH
  if (envPath && envPath.length > 0) return resolvePath(envPath)
  const candidate = resolvePath(cwd, ".km", "state.db")
  if (existsSync(candidate)) return candidate
  return null
}

export type SessionHandle = {
  readonly id: string
  readonly name: string
  readonly store: SessionStore
  readonly session: AgentSession
  readonly unsubscribe: () => void
  readonly log?: EventLog
  /** Anthropic account bound to this session (multi-account). */
  readonly account?: string
  /**
   * Per-session coordinator-mcp server (in-process, holds a reference to
   * the controller's shared CrossAgentState). The agent-side wiring (how
   * the spawned subprocess actually reaches this in-process server) is a
   * follow-up bead — see `apps/silvercode/docs/in-process-mcp.md`. The
   * server is exposed here so tests + UI panes can dispatch tool calls
   * directly against this session's identity.
   */
  readonly coordinatorMcp: CoordinatorMcpServer
  readonly metadata: SessionHistoryMetadata
  /**
   * Resume session id — set when the session was created via
   * `silvercode --resume <id>` (i.e. `opts.resume` was non-empty at
   * spawn time). Drives the Welcome screen's "Loading session <id>…"
   * variant: while replay is in flight + the live spawn is initializing
   * we show a quiet loading indicator instead of a command box, because
   * the user is waiting on a transcript replay rather than starting a
   * fresh turn. `undefined` for fresh sessions. Bead: km-cr94.
   */
  readonly resumeId?: string
}

/**
 * Background job snapshot. The synthetic Ctrl-B path is disabled because
 * assistant message ids are not stable provider job ids across tool-call
 * boundaries. This type remains for native/future backend background work.
 */
export type BackgroundJobStatus = "running" | "completed" | "cancelled" | "failed"

export type BackgroundJob = {
  readonly id: string
  readonly turnId: string
  readonly startedAt: number
  /** `completedAt` is set on the terminal status flip. */
  readonly completedAt?: number
  readonly status: BackgroundJobStatus
  /** Snapshot of harness events seen for this turn since it was backgrounded. */
  readonly events: ReadonlyArray<AgentEvent>
  /** Snippet preview built from the last assistant text-delta seen — for the SidePanel + system message. */
  readonly snippet: string
}

export type ControllerOptions = {
  cwd: string
  model?: string
  reasoningEffort?: ReasoningEffort
  sessionConfig?: Readonly<Record<string, SessionConfigValue>>
  resume?: string
  /**
   * When true, spawn Claude with `--bare` for deterministic subprocess
   * behavior (disables hooks/plugins/skills/CLAUDE.md). Default (false) runs
   * the full Claude Code setup so sessions mirror what a real user sees.
   * Propagated verbatim through SpawnSessionOptions → spawnClaude.
   */
  bare: boolean
  /**
   * Canonical agent id from BUILTIN_AGENTS — drives controller dispatch
   * to the matching factory:
   *   - codex-spawn       → spawnCodex (legacy stream-json)
   *   - claude-code-sdk   → spawnSdk (in-process Anthropic SDK)
   *   - claude-code-spawn → spawnClaude (default Claude legacy path)
   *   - undefined         → spawnClaude (default fallback)
   *   - any other id      → connectAcpRegistry (ACP transport)
   */
  agent?: string
  logDir?: string
  initialSessions: number
  /**
   * Anthropic account name for per-session credential isolation (v1.1
   * multi-account). Resolves to `~/.config/claude-profiles/<account>/` which the
   * harness exposes via `CLAUDE_CONFIG_DIR`. Undefined → use the user's main
   * `~/.claude/` (current behavior, unchanged).
   */
  account?: string
  /** Hook for tests to swap spawn behavior. */
  spawnFactory?: (opts: SpawnSessionOptions) => AgentSession | Promise<AgentSession>
  /**
   * Provide the active-bead injector data at each turn. Default returns empty
   * (no injection). M3 wires this to bd show output.
   */
  getActiveBead?: () => { beadId?: string; title?: string; worktree?: string }
  /**
   * Drain pending channel messages for a session (M4 wiring). Default returns
   * empty; silvercode consumers can pass the tribe-mcp drain here.
   */
  drainChannel?: (sessionId: string) => Array<{ from: string; text: string }>
  /** Tribe backend for M4 channel integration. Defaults to in-memory. */
  tribe?: TribeBackend
  /**
   * MCP servers to mount for every spawned session. Defaults to km + tribe
   * stdio bins shipped with silvercode. Pass [] to disable MCP mounting.
   */
  mcpServers?: McpServerSpec[]
  /**
   * Root of the workspace (used to resolve bundled MCP bin paths). Defaults
   * to process.cwd().
   */
  workspaceRoot?: string
  /**
   * Read the UI's currently-focused region. When the user has moved focus
   * INTO the queue region (to inspect / edit / reorder queued entries), the
   * controller's turn-end auto-flush MUST NOT yank the draft out from under
   * them. Returns "queue" while the user is editing the queue TextArea,
   * "command" otherwise. Default (undefined accessor) → behave as before
   * (always auto-flush on turn-end). The explicit `flushQueue` path is
   * unaffected — Enter-in-queue is the user saying "send now" and bypasses
   * this guard. See bead `km-silvercode.queue-focus-flush-guard`.
   */
  getFocusedRegion?: () => "queue" | "command"
  /**
   * Optional scope for owning the controller's auxiliary subscribers
   * (channel queue, channel-source watchers). Defaults to a fresh root
   * scope created at controller-init and disposed via `closeAll`. Pass
   * an explicit scope to integrate with the host app's lifecycle.
   */
  scope?: Scope
  /**
   * Disable wiring channel sources (tribe / telegram / ci / lore /
   * subagent). Tests pass `true` to keep the queue inert. The queue
   * itself is always created so the controller surface is uniform.
   */
  disableChannelSources?: boolean

  /**
   * Disable Phase 6.b notification adapters (tribe / recall / subagent / ci /
   * filewatch — see `apps/silvercode/src/notification-adapters/`). Defaults to
   * the same value as `disableChannelSources` so tests that opt out of
   * the legacy channel pipeline also opt out of the new one.
   *
   * The new notification adapters live alongside (not in place of) the legacy
   * `wireChannelSources` path. When both are active, the new tribe
   * adapter and the legacy `subscribeTribe` would both tail the bus —
   * setting `disableLegacyTribeSource` (below) is the recommended way to
   * avoid double-emit.
   */
  disableNotificationAdapters?: boolean
  /**
   * Disable the legacy `subscribeTribe` path inside `wireChannelSources`
   * — the new notification-adapters tribe subscriber tails the same bus and
   * sanitizes/debounces the result. Defaults to `false` to preserve
   * back-compat; flip to `true` when standing on the new pipeline.
   */
  disableLegacyTribeSource?: boolean
}

export type SpawnSessionOptions = {
  id: string
  name: string
  /** Canonical agent id from BUILTIN_AGENTS. See ControllerOptions.agent. */
  agent?: string
  cwd: string
  model?: string
  reasoningEffort?: ReasoningEffort
  sessionConfig?: Readonly<Record<string, SessionConfigValue>>
  resume?: string
  bare: boolean
  /** Anthropic account name — pass-through from ControllerOptions.account. */
  account?: string
}

export type Controller = {
  snapshot(): SessionHandle[]
  focusedId(): string
  focus(id: string): void
  subscribe(handler: (sessions: SessionHandle[]) => void): () => void
  onFocusChange(handler: (id: string) => void): () => void
  /**
   * Most-recent spawn error, if any. Set when `spawnSession()` rejects and
   * cleared when a session successfully spawns. The UI uses this to render
   * a visible banner inside the alt-screen — without it, spawn failures
   * (bad agent config, missing binary, ACP connection closed, etc.) write
   * to stderr which is hidden behind alt-screen and the user sees a blank
   * UI with no clue what went wrong.
   * Bead: km-silvercode.spawn-error-blank-screen.
   */
  lastSpawnError(): string | null
  onSpawnError(handler: (message: string | null) => void): () => void
  /**
   * Send a user message. If the session is currently NOT idle (Claude is
   * thinking / running a tool / waiting for permission), the text is
   * appended to a queue buffer and the whole buffer is submitted as ONE
   * user message when Claude returns to idle — matches Claude Code's
   * batching behaviour.
   */
  send(sessionId: string, text: string): void
  /** Current queue buffer for a session. Empty string when none. */
  queuedText(sessionId: string): string
  /** Replace the whole queue buffer — used by the on-screen queue editor. */
  setQueuedText(sessionId: string, text: string): void
  /** Subscribe to queue-text changes (payload: the new buffer). */
  onQueueChange(handler: (sessionId: string, text: string) => void): () => void
  /** Drop the queue (Esc-to-cancel on empty input). */
  clearQueue(sessionId: string): void
  /**
   * Force-flush the queue buffer NOW, regardless of idle status. Used by
   * the queue editor when the user explicitly submits (Enter in the queue
   * region). Bypasses the `status === "idle"` gate that the notification
   * auto-flush path uses, because the user's explicit submit is its own
   * signal — Claude Code's CLI buffers stdin if Claude is mid-turn, so
   * sending a queued user message during a turn is safe and lands as the
   * next turn's input. No-op if the queue is empty.
   */
  flushQueue(sessionId: string): void
  /**
   * Retry the normal auto-flush path without forcing a mid-turn send.
   * Used by the UI when focus leaves the queue editor after a turn-end
   * skipped auto-flush because the queue was focused.
   */
  autoFlushQueue(sessionId: string): void
  respondPermission(sessionId: string, requestId: string, approved: boolean): void
  /**
   * Multi-option ACP permission response. Routes the user's chosen option to
   * the ACP-session's per-session permission queue resolver. `approved`
   * reflects whether the chosen option is an allow or reject kind — used by
   * the session store to update `status` / `permissions` state.
   *
   * For legacy (stream-json) sessions this falls back to `respondPermission`.
   */
  respondPermissionOption(sessionId: string, requestId: string, optionId: PermissionOptionId, approved: boolean): void
  /** Set any ACP session config option advertised by the live backend. */
  setSessionConfigOption(sessionId: string, params: AcpSetSessionConfigOptionParams): Promise<void>
  /** Set Codex's ACP `reasoning_effort` option for a live ACP-backed session. */
  setReasoningEffort(sessionId: string, effort: ReasoningEffort): Promise<void>
  /**
   * Answer a pending AskUserQuestion tool call. The answers are formatted
   * as a follow-up user message describing what the user picked, then
   * sent through the agent's normal stdin path. A synthetic `tool-result`
   * event is also applied to the session store so the UI's
   * `pendingQuestion` clears immediately. The agent receives the answer
   * as user-level context and continues its turn naturally.
   *
   * Bead: km-silvercode.askuserquestion-implement.
   */
  respondAskUserQuestion(
    sessionId: string,
    toolUseId: string,
    answers: ReadonlyArray<{ question: string; label: string }>,
  ): void
  /**
   * Cancel a pending AskUserQuestion tool call (Escape pressed in the
   * picker). Clears the UI's `pendingQuestion` via a synthetic tool-result
   * event and informs the agent via a follow-up user message that the
   * question was cancelled — without this, the agent would sit waiting
   * for an answer that never comes.
   */
  cancelAskUserQuestion(sessionId: string, toolUseId: string): void
  runSlashCommand(sessionId: string, text: string): void
  spawnSession(name?: string): Promise<SessionHandle>
  /** Move work+context from source → destination session. */
  handoff(fromId: string, toId: string, prompt: string): void
  /** Fork a session — spawn a new one pre-seeded with the source's context. */
  fork(fromId: string): Promise<SessionHandle>
  /**
   * Send SIGTERM to every session's child and unsubscribe. Synchronous —
   * the children shut down gracefully (flushing their pending output +
   * tearing down their own MCP subprocesses) in the background; we return
   * immediately. Listen on session.subscribe('session-end') to wait.
   */
  closeAll(): void
  /**
   * Disabled compatibility shim. The earlier synthetic implementation
   * keyed background work by assistant message id, which is not a stable
   * provider job id across tool calls. Keep the method as a no-op until a
   * backend exposes native job/background semantics.
   */
  backgroundActiveJob(sessionId: string): void
  /**
   * Interrupt the active foreground job for `sessionId` (Esc parity with
   * Claude Code). Idempotent + safe to call when no job is running
   * (no-op).
   *
   * v1 semantics — until `km-agent-harness.per-turn-abort` lands we cannot
   * surgically abort the subprocess turn without killing the whole
   * session. Instead:
   *   - the SessionStore is forced to `idle` via a synthetic turn-end so
   *     the UI accepts new input,
   *   - subsequent stream chunks for the interrupted turnId are dropped
   *     (event mirroring stops),
   *   - a `[bg] interrupted` system message is appended so the user has
   *     visible confirmation.
   * The underlying Claude subprocess keeps running until its turn-end
   * arrives naturally — at which point the result is suppressed.
   */
  interruptActiveJob(sessionId: string): void
  /**
   * Pop the head of the queue (everything before the first `\n\n`),
   * leaving the rest in place. Returns the popped head; empty string
   * when the queue is empty. Wire format mirrors `controller.send`'s
   * `\n\n` delimiter so callers round-trip cleanly.
   */
  popQueueHead(sessionId: string): string
  /**
   * Surface a completed (or running) background job. v1 semantics:
   * inject the captured snippet as a system message into the conversation.
   */
  surfaceBackgroundJob(sessionId: string, jobId: string): void
  /**
   * Cancel a backgrounded job. v1 semantics: marks the job as `cancelled`
   * + emits a system message; the underlying subprocess turn keeps running
   * because `AgentSession` does not yet expose per-turn cancellation. The
   * cancellation is recorded so the eventual `turn-end` is dropped (no
   * stale "result arrived" message). See bead
   * `km-agent-harness.per-turn-abort` for the upstream gap.
   */
  cancelBackgroundJob(sessionId: string, jobId: string): void
  /** Snapshot of background jobs for one session, newest first. */
  backgroundJobs(sessionId: string): ReadonlyArray<BackgroundJob>
  /** Subscribe to background-job list changes (per session). */
  onBackgroundJobsChange(handler: (sessionId: string, jobs: ReadonlyArray<BackgroundJob>) => void): () => void
  /**
   * Channel queue — silvercode-owned notification-event buffer. Subscribers
   * (tribe, telegram, CI, lore, sub-agent) push `ChannelEvent`s here on
   * receipt; the prompt-assembly hook decides whether to drain them as
   * typed `EmbeddedResource` blocks on the next user prompt.
   *
   * Default disposition: hold the queue, surface a notification badge
   * via `pendingCount`, drain on user-invoked `/inject-<source>` slash
   * command. Auto-injection is opt-in per session (future work). See
   * `prompt-assembly.ts`.
   *
   * Replaces Claude Code's free-text `<channel source="..." ...>` tag
   * injection — when wrapping Claude Code via `acp-adapter-claude` we
   * also need to suppress the native `<channel>` tag at the spawn level
   * (TODO: wire via env / system-prompt amendment in
   * `acp-adapter-claude`).
   */
  readonly channelQueue: ChannelQueue
  /**
   * Notification stream — per-session journal of notification observations
   * delivered to the agent. Used by the chat scrollback to render
   * inline `NotificationEventRow` rows at injection timestamp. UI-only; no
   * effect on what the agent receives.
   *
   * Bead: km-silvercode.notification-inline-display.
   */
  readonly notificationStream: NotificationStream
  /**
   * Visual mute filter for notification sources. Toggling a source via the
   * side panel hides matching rows from the inline scrollback but does
   * NOT prevent the agent from receiving them. Enforced structurally —
   * no module on the prompt-assembly path imports this.
   *
   * Bead: km-silvercode.notification-inline-display.
   */
  readonly notificationMuteState: MuteState
  /**
   * Cross-agent state — silvercode-owned coordination store shared across
   * every session this controller spawned. Holds file claims, handoffs,
   * active session list, recent peer broadcasts. Each session gets its
   * own coordinator-mcp instance (`SessionHandle.coordinatorMcp`) that
   * delegates to this single store. UI panes subscribe to its signals
   * via `useSignal` for live updates.
   *
   * See `apps/silvercode/src/cross-agent-state.ts` and
   * `apps/silvercode/docs/multi-agent.md`.
   */
  readonly crossAgentState: CrossAgentState
}

let nextId = 1

const ctrlStartupLog = createLogger("silvercode:startup")
const ctrlBootT0 = (globalThis as { __SILVERCODE_BOOT_T0?: number }).__SILVERCODE_BOOT_T0 ?? Date.now()
function ctrlStartupTick(label: string, extra?: Record<string, unknown>): void {
  ctrlStartupLog.info?.(label, { elapsedMs: Date.now() - ctrlBootT0, ...extra })
}

function isClaudeAgentId(agent: string | undefined): boolean {
  return (
    agent === undefined ||
    agent === "claude" ||
    agent === "claude-code" ||
    agent === "claude-code-spawn" ||
    agent === "claude-code-sdk"
  )
}

function latestUserMessageTs(store: SessionStore): number | undefined {
  const messages = store.state.get().messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === "user") return message.ts
  }
  return undefined
}

function channelEventFromClaudeSubagentSummary(
  sessionId: string,
  summary: SubagentSessionSummary,
  status: "started" | "completed" | "failed" | "stopped",
): ChannelEvent {
  const agent = summary.agentType ?? "Agent"
  const description = summary.description ?? summary.id
  const timestamp = summary.completedAt ?? summary.startedAt ?? Date.now()
  const resultText = summary.resultText ? ` — ${summary.resultText}` : ""
  return {
    id: `claude-subagent:${sessionId}:${summary.id}:${status}:${timestamp}`,
    source: "subagent",
    timestamp,
    content: `[subagent ${agent}] ${status}: ${description}${status === "completed" ? resultText : ""}`,
    meta: {
      kind: "subagent-status",
      provider: "claude-sidechain",
      status,
      agent,
      fromSessionId: sessionId,
      description,
      subagentSessionId: summary.id,
      transcriptPath: summary.transcriptPath,
    },
  }
}

function notificationStatusForSubagentSummary(
  status: SubagentSessionSummary["status"],
): "started" | "completed" | "failed" | "stopped" {
  if (status === "done") return "completed"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "stopped"
  return "started"
}

export function createSilvercodeController(opts: ControllerOptions): Controller {
  ctrlStartupTick("controller:create:enter")
  const sessions: SessionHandle[] = []
  let focusedId = ""
  const sessionSubs = new Set<(s: SessionHandle[]) => void>()
  const focusSubs = new Set<(id: string) => void>()

  // Channel pipeline — silvercode-owned notification-event buffer feeding the
  // typed prompt-assembly path (apps/silvercode/src/prompt-assembly.ts).
  // Replaces Claude Code's free-text `<channel source="..." ...>` tag
  // injection — see hub/silvercode/future/ai-terminal/10-agent-router-landscape.md.
  // The scope owns watcher teardown for tribe / telegram / ci / lore /
  // subagent subscribers; closeAll() disposes it.
  //
  // Note: ownsScope tracks whether we created the scope (and therefore
  // are responsible for disposing it on closeAll). When the host app
  // passes a scope in via opts.scope, the host owns disposal.
  const ownsScope = !opts.scope
  const controllerScope: Scope = opts.scope ?? createScope("silvercode-controller")
  const channelQueue = createChannelQueue(controllerScope)
  // Notification stream + mute state — UI-only echo of channel events so the
  // chat scrollback can render inline observation rows at the timestamp
  // each event arrived. Mute filters operate on the stream, never on
  // channelQueue or prompt-assembly. See
  // apps/silvercode/docs/channels.md.
  const notificationStream = createNotificationStream(controllerScope)
  const notificationMuteState = createMuteState(controllerScope)
  // Cross-agent state — one per controller, shared across every session.
  // Each session's coordinator-mcp delegates to this store; UI panes
  // subscribe to its signals (claims, activeSessions, ...). Channel-queue
  // events fan out into `recordBroadcast` below so the prompt-assembly
  // slice has visibility into recent peer activity.
  const crossAgentState = createCrossAgentState(controllerScope)
  ctrlStartupTick("controller:create:beforeWireChannelSources")
  if (!opts.disableChannelSources) {
    wireChannelSources(controllerScope, channelQueue, {
      disable: opts.disableLegacyTribeSource ? { tribe: true } : undefined,
    })
  }
  ctrlStartupTick("controller:create:afterWireChannelSources")
  // Phase 6.b notification adapters — sanitize + debounce real source signals
  // (tribe, ci, filewatch, subagent; recall is a wired stub awaiting a
  // controller token stream). Disabling is gated by
  // `disableNotificationAdapters` (default: follow the legacy channel-sources
  // gate). The returned handle bundle exposes per-source surfaces — the
  // subagent handle below receives Task-tool `tool-use` / `tool-result`
  // events from the per-session subscribe loop.
  let subagentAdapter: ReturnType<typeof registerAllNotificationAdapters>["subagent"] | undefined
  const claudeSidechainNotificationKeys = new Map<string, Set<string>>()
  const lastClaudeSidechainScanAt = new Map<string, number>()
  function recordClaudeSidechainSubagents(
    sessionId: string,
    store: SessionStore,
    metadata: SessionHistoryMetadata,
    force = false,
  ): void {
    if (!isClaudeAgentId(metadata.agent)) return
    const providerSessionId = metadata.sessionId ?? metadata.resumeId
    if (!providerSessionId) return
    const now = Date.now()
    const lastScanAt = lastClaudeSidechainScanAt.get(sessionId) ?? 0
    if (!force && now - lastScanAt < 250) return
    lastClaudeSidechainScanAt.set(sessionId, now)

    const summaries = discoverClaudeSubagentSessions(metadata.cwd, providerSessionId)
    metadata.subagentSessions = summaries
    const since = latestUserMessageTs(store)
    const seen = claudeSidechainNotificationKeys.get(sessionId) ?? new Set<string>()
    claudeSidechainNotificationKeys.set(sessionId, seen)
    for (const summary of summaries) {
      if (since !== undefined && summary.startedAt !== undefined && summary.startedAt < since) continue
      const status = notificationStatusForSubagentSummary(summary.status)
      const event = channelEventFromClaudeSubagentSummary(sessionId, summary, status)
      if (seen.has(event.id)) continue
      seen.add(event.id)
      notificationStream.record(sessionId, event)
    }
  }
  if (!opts.disableNotificationAdapters && !opts.disableChannelSources) {
    ctrlStartupTick("controller:create:beforeRegisterNotification")
    const adapters = registerAllNotificationAdapters({
      scope: controllerScope,
      queue: channelQueue,
      cwd: opts.cwd,
    })
    subagentAdapter = adapters.subagent
    ctrlStartupTick("controller:create:afterRegisterNotification")
  }
  // Mirror channel-queue events into the cross-agent broadcast ring buffer
  // so the prompt-projection slice (apps/silvercode/src/prompt-cross-agent.ts)
  // sees recent peer activity even when individual sessions choose not to
  // auto-drain the channel queue. The subscription is owned by the
  // controller scope — disposing the scope unsubscribes.
  const broadcastUnsub = channelQueue.subscribe((event) => {
    crossAgentState.recordBroadcast({
      id: event.id,
      source: event.source,
      content: event.content,
      timestamp: event.timestamp,
      // Channel events don't currently carry sessionId; future tribe
      // subscribers can populate `meta.fromSessionId` to attribute.
      fromSessionId: typeof event.meta?.fromSessionId === "string" ? (event.meta.fromSessionId as string) : undefined,
    })
    // Record into the per-session notification journal so the chat scrollback
    // can render an inline observation row. Phase 6.a: write to the
    // currently-focused session (one focused pane at a time owns the
    // notification firehose). Future phases attribute by which session
    // actually drained the queue in `assembleAcpPrompt`.
    //
    // Fallback: if `focusedId` is empty (controller startup window before
    // any session has spawned + focused), target the first session in the
    // list. Without this, filewatch / tribe events fired during startup get
    // silently dropped from the notification stream — they live in the channel
    // queue (so prompt-assembly still sees them) but never render inline.
    // Bead: km-silvercode.claude-acp-wire-bugs.
    const targetId = focusedId || sessions[0]?.id
    if (targetId) notificationStream.record(targetId, event)
  })
  controllerScope.defer(() => broadcastUnsub())
  // TODO (acp-adapter-claude): when we wrap Claude Code via the ACP
  // adapter, the spawned subprocess MUST NOT emit its own
  // `<channel source="..." ...>` tag injection — silvercode owns the
  // channel pipeline now via channelQueue + assembleAcpPrompt. Until
  // that adapter lands, we keep the legacy `channelDigestInjector` path
  // wired below for the stream-json sessions, which means the legacy
  // tribe digest still flows through the user-role text. Migrating one
  // session at a time onto the ACP path drains channelQueue via
  // `assembleAcpPrompt({ autoInject: false })` + slash commands.

  function notifySessions(): void {
    for (const fn of sessionSubs) fn(sessions)
  }

  // Spawn-error broadcast — see Controller.lastSpawnError for the full
  // rationale. Held outside notifySessions so a stale error doesn't get
  // re-broadcast on every session list change.
  let spawnError: string | null = null
  const spawnErrorSubs = new Set<(message: string | null) => void>()
  function setSpawnError(message: string | null): void {
    if (spawnError === message) return
    spawnError = message
    for (const fn of spawnErrorSubs) fn(message)
  }

  // Per-session message queue — single string buffer so the on-screen
  // queue editor can bind a TextArea to it directly. We only auto-queue
  // when the provider cannot accept another prompt yet: the previous
  // stdin write has not been acknowledged by any backend event, or the
  // backend protocol is single-flight (ACP).
  //
  // Option B model: the queue TextArea is ALWAYS live (no editor mode,
  // no "hold" state). Auto-flush drains as soon as the transport is
  // sendable; explicit submit (Enter in queue region) bypasses the
  // auto-focus guard but still waits for the transport ack window.
  const queues = new Map<string, string>()
  const queueSubs = new Set<(sessionId: string, text: string) => void>()
  type OutboundTurnState = { readonly kind: "awaiting-backend-ack" }
  const outboundTurns = new Map<string, OutboundTurnState>()
  let localUserTurnSeq = 0

  // Recall probe wiring — per-session bookkeeping. We probe recall
  // every Nth assistant `turn-end` against the most recent user
  // prompt, so prior-session context surfaces as a notification digest
  // event. Recall itself self-rate-limits to ≥60s between queries
  // (`MIN_RECALL_INTERVAL_MS` in `notification-adapters/recall.ts`); the
  // turn counter is the secondary throttle that keeps even a slow
  // conversation from churning recall on every reply.
  const lastUserPromptBySession = new Map<string, string>()
  const turnCountBySession = new Map<string, number>()
  function recordUserPromptForRecall(sessionId: string, text: string): void {
    if (text.length === 0) return
    lastUserPromptBySession.set(sessionId, text.slice(0, RECALL_QUERY_MAX_CHARS))
  }
  function maybeProbeRecall(sessionId: string): void {
    if (opts.disableNotificationAdapters || opts.disableChannelSources) return
    const next = (turnCountBySession.get(sessionId) ?? 0) + 1
    turnCountBySession.set(sessionId, next)
    if (next % RECALL_PROBE_TURN_INTERVAL !== 0) return
    const query = lastUserPromptBySession.get(sessionId)
    if (!query || query.trim().length === 0) return
    dRecall("probe %s turn=%d query=%s", sessionId, next, query.slice(0, 80))
    // Fire-and-forget — recall is a best-effort signal. Failures are
    // logged inside the adapter; the conversation never blocks on it.
    triggerRecallProbe({ scope: controllerScope, queue: channelQueue }, query).catch((err) => {
      dRecall("probe failed %s: %s", sessionId, err)
    })
  }

  // ───── ACP per-session permission queue ─────
  //
  // When an ACP session's `permissionHandler` is invoked, we push a
  // `{requestId, req, resolver}` entry onto this map so the UI can surface
  // it via the existing permission-request / awaiting-permission flow, and
  // the user's decision resolves the handler's promise.
  //
  // Key:   sessionId
  // Value: map from requestId → pending resolver + original request
  //
  // The legacy (stream-json) path does NOT use this map — it drives the
  // session directly via `AgentSession.respondToPermission`.
  type AcpPermResolver = (response: RequestPermissionResponse) => void
  type AcpPermEntry = {
    readonly requestId: string
    readonly req: RequestPermissionRequest
    readonly resolve: AcpPermResolver
  }
  type AcpPermDecision = { readonly approved: boolean; readonly optionId?: PermissionOptionId }
  const acpPermQueues = new Map<string, Map<string, AcpPermEntry>>()
  const deferredAcpPermDecisions = new Map<string, Map<string, AcpPermDecision>>()
  function isAcpSession(session: AgentSession): boolean {
    const value = session as { agent?: unknown; protocolVersion?: unknown }
    return value.agent !== undefined && typeof value.protocolVersion === "number"
  }
  function isConfigurableAcpSession(session: AgentSession): session is AgentSession & {
    readonly configOptions?: unknown[]
    setSessionConfigOption(params: AcpSetSessionConfigOptionParams): Promise<{ configOptions: unknown[] }>
  } {
    return typeof (session as { setSessionConfigOption?: unknown }).setSessionConfigOption === "function"
  }
  function advertisesConfigOption(session: AgentSession, configId: string): boolean {
    const configOptions = (session as { configOptions?: unknown }).configOptions
    if (!Array.isArray(configOptions)) return true
    return configOptions.some((option) => {
      if (!option || typeof option !== "object") return false
      return (option as { id?: unknown }).id === configId
    })
  }
  async function setSessionConfigOption(sessionId: string, params: AcpSetSessionConfigOptionParams): Promise<void> {
    const s = sessions.find((h) => h.id === sessionId)
    if (!s) return
    if (!isConfigurableAcpSession(s.session)) {
      return
    }
    if (!advertisesConfigOption(s.session, params.configId)) return
    try {
      await s.session.setSessionConfigOption(params)
    } catch (err) {
      s.store.apply({
        kind: "error",
        sessionId: s.session.sessionId,
        message: `set ACP config option failed: ${(err as Error).message}`,
        ts: Date.now(),
      })
    }
  }
  function resolveAcpPermission(entry: AcpPermEntry, decision: AcpPermDecision): void {
    if (!decision.approved) {
      entry.resolve({ outcome: { outcome: "cancelled" } })
      return
    }
    if (decision.optionId) {
      entry.resolve({ outcome: { outcome: "selected", optionId: decision.optionId } })
      return
    }
    const allowOpt =
      entry.req.options.find((o) => o.kind === "allow_once" || o.kind === "allow_always") ?? entry.req.options[0]
    entry.resolve(
      allowOpt
        ? { outcome: { outcome: "selected", optionId: allowOpt.optionId } }
        : { outcome: { outcome: "cancelled" } },
    )
  }
  function takeDeferredAcpDecision(sessionId: string, requestId: string): AcpPermDecision | undefined {
    const queue = deferredAcpPermDecisions.get(sessionId)
    const decision = queue?.get(requestId)
    if (!queue || !decision) return undefined
    queue.delete(requestId)
    if (queue.size === 0) deferredAcpPermDecisions.delete(sessionId)
    return decision
  }
  function deferAcpDecision(sessionId: string, requestId: string, decision: AcpPermDecision): void {
    let queue = deferredAcpPermDecisions.get(sessionId)
    if (!queue) {
      queue = new Map()
      deferredAcpPermDecisions.set(sessionId, queue)
    }
    queue.set(requestId, decision)
  }
  function notifyQueue(sessionId: string): void {
    const t = queues.get(sessionId) ?? ""
    for (const fn of queueSubs) fn(sessionId, t)
  }
  function outboundState(sessionId: string): OutboundTurnState | undefined {
    return outboundTurns.get(sessionId)
  }
  function hasOutbound(sessionId: string): boolean {
    return outboundState(sessionId) !== undefined
  }
  function acceptsPromptWhileBusy(session: AgentSession): boolean {
    // This is a Silvercode transport rule, not an ACP capability. The
    // stream-json stdin adapters can accept another prompt once the
    // previous write has reached the backend; ACP remains request/response
    // single-flight until the protocol advertises otherwise.
    return !isAcpSession(session)
  }
  function canSubmitNow(handle: SessionHandle): boolean {
    if (hasOutbound(handle.id)) return false
    const status = handle.store.state.get().status
    if (status === "idle" || status === "ended") return true
    if (!acceptsPromptWhileBusy(handle.session)) return false
    return status === "thinking" || status === "tool-running"
  }
  function markOutboundSent(sessionId: string): void {
    outboundTurns.set(sessionId, { kind: "awaiting-backend-ack" })
    dQueue("outbound %s — gate armed", sessionId)
  }
  function acknowledgeOutbound(sessionId: string, reason: string): boolean {
    const state = outboundState(sessionId)
    if (state?.kind !== "awaiting-backend-ack") return false
    outboundTurns.delete(sessionId)
    dQueue("outbound %s — gate acknowledged by %s", sessionId, reason)
    return true
  }
  function clearOutboundTurn(sessionId: string, turnId: TurnId): void {
    if (!outboundTurns.delete(sessionId)) return
    dQueue("outbound %s — gate cleared for turn %s", sessionId, turnId)
  }
  function clearUnstartedOutbound(sessionId: string): void {
    const state = outboundState(sessionId)
    if (state?.kind !== "awaiting-backend-ack") return
    outboundTurns.delete(sessionId)
    dQueue("outbound %s — unstarted gate cleared", sessionId)
  }
  function clearOutbound(sessionId: string): void {
    if (!outboundTurns.delete(sessionId)) return
    dQueue("outbound %s — gate cleared", sessionId)
  }
  function isOutboundAckEvent(event: AgentEvent): boolean {
    switch (event.kind) {
      case "session-init":
      case "turn-start":
      case "text-delta":
      case "thinking-delta":
      case "tool-use":
      case "tool-result":
      case "permission-request":
      case "liveness-check":
      case "assistant-message":
      case "user-message":
      case "raw-transcript":
      case "status":
      case "plan-update":
      case "slash-commands-update":
      case "km-reference":
        return true
      case "turn-end":
      case "permission-decision":
      case "session-end":
      case "handoff":
      case "session-lifecycle":
      case "error":
        return false
    }
  }

  function dispatchUserTurn(s: SessionHandle, sessionId: string, text: string): void {
    recordUserPromptForRecall(sessionId, text)
    const ts = Date.now()
    const statusBeforeSend = s.store.state.get().status
    if (s.metadata.resumeId && s.metadata.liveStartedAt === undefined) s.metadata.liveStartedAt = ts
    const turnId = `u-${ts}-${++localUserTurnSeq}` as TurnId
    s.store.apply({
      kind: "user-message",
      sessionId: s.session.sessionId,
      turnId,
      text,
      ts,
    })
    if (statusBeforeSend === "idle" || statusBeforeSend === "ended" || !acceptsPromptWhileBusy(s.session)) {
      markOutboundSent(sessionId)
    }
    try {
      s.session.send(text)
    } catch (err) {
      clearUnstartedOutbound(sessionId)
      throw err
    }
  }
  /**
   * Flush the queue buffer to Claude as one user turn, then clear.
   *
   * Two callers, two semantics:
   *  - Auto-flush (`force=false`): no-op until the transport is sendable,
   *    and the queue editor is not actively focused.
   *  - Force-flush (`force=true`): bypasses the queue-focus guard. It
   *    still waits for the previous stdin write's backend ack so we never
   *    stack multiple unacknowledged writes.
   *
   * Always no-op if the queue is empty.
   */
  function tryFlush(sessionId: string, force = false): void {
    const s = sessions.find((h) => h.id === sessionId)
    if (!s) {
      dQueue("tryFlush %s force=%s — no handle", sessionId, force)
      return
    }
    if (force && outboundState(sessionId)?.kind === "awaiting-backend-ack") {
      dQueue("tryFlush %s force=%s — outbound awaiting backend ack, skip", sessionId, force)
      return
    }
    if (!force) {
      if (!canSubmitNow(s)) {
        const status = s.store.state.get().status
        const outbound = outboundState(sessionId)?.kind ?? "none"
        dQueue("tryFlush %s — status=%s outbound=%s, skip", sessionId, status, outbound)
        return
      }
      // Focus guard — if the user has moved the cursor INTO the queue
      // region (editing / reordering queued entries), don't yank their
      // draft mid-edit. Auto-flush will fire on the NEXT turn-end after
      // they move focus back to the command box. Explicit submit
      // (flushQueue, force=true) bypasses this. See bead
      // km-silvercode.queue-focus-flush-guard.
      const region = opts.getFocusedRegion?.()
      if (region === "queue") {
        dQueue("tryFlush %s — focus=queue, skip (auto-flush paused)", sessionId)
        return
      }
    }
    const text = queues.get(sessionId) ?? ""
    if (text.length === 0) {
      dQueue("tryFlush %s force=%s — queue empty, skip", sessionId, force)
      return
    }
    dQueue("tryFlush %s force=%s — FLUSHING %d chars", sessionId, force, text.length)
    queues.set(sessionId, "")
    notifyQueue(sessionId)
    dispatchUserTurn(s, sessionId, text)
  }
  function notifyFocus(): void {
    for (const fn of focusSubs) fn(focusedId)
  }

  // ───── Background jobs ─────
  // Per-session list of background jobs. The old synthetic Ctrl-B path is
  // disabled; this storage remains for native/future backend background
  // work. Completed jobs remain in the list (so the user can inspect them
  // again) but are GC'd after BACKGROUND_JOB_TTL_MS.
  //
  // The set is keyed by sessionId so each block maintains its own
  // independent background-job list. `jobsBySession.get(id)!` is mutated
  // in place + then notifyBackground() is called — keeps the wiring
  // identical to the queue store above.
  const BACKGROUND_JOB_TTL_MS = 10 * 60 * 1000
  const jobsBySession = new Map<string, BackgroundJob[]>()
  const backgroundedTurnIds = new Map<string, Set<string>>() // sessionId → Set<turnId>
  /** Jobs that the user explicitly cancelled — drop the eventual turn-end result. */
  const cancelledJobIds = new Map<string, Set<string>>()
  /**
   * Turns the user explicitly interrupted (Esc during in-flight turn).
   * Stream events for these turnIds are dropped — they don't get mirrored
   * into background jobs, and turn-end arrives as a no-op (no synthetic
   * "completed" message is surfaced because the user already saw the
   * "interrupted" system message). Tracked per session so the same turnId
   * across sessions doesn't collide.
   */
  const interruptedTurnIds = new Map<string, Set<string>>()
  const backgroundSubs = new Set<(sessionId: string, jobs: ReadonlyArray<BackgroundJob>) => void>()

  function getJobs(sessionId: string): BackgroundJob[] {
    let list = jobsBySession.get(sessionId)
    if (!list) {
      list = []
      jobsBySession.set(sessionId, list)
    }
    return list
  }
  function notifyBackground(sessionId: string): void {
    const jobs = jobsBySession.get(sessionId) ?? []
    for (const fn of backgroundSubs) fn(sessionId, jobs)
  }
  function isBackgroundedTurn(sessionId: string, turnId: string): boolean {
    return backgroundedTurnIds.get(sessionId)?.has(turnId) === true
  }
  function markBackgrounded(sessionId: string, turnId: string): void {
    let s = backgroundedTurnIds.get(sessionId)
    if (!s) {
      s = new Set()
      backgroundedTurnIds.set(sessionId, s)
    }
    s.add(turnId)
  }
  function findActiveTurnId(handle: SessionHandle): string | null {
    const state = handle.store.state.get()
    // The most recent assistant message that hasn't ended is our active turn.
    // We scan from the end because turns are append-only.
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i]
      if (m === undefined) continue
      if (m.role !== "assistant") continue
      if (m.stopReason) continue // turn-end already arrived
      return m.id as string
    }
    return null
  }

  /**
   * Build a one-line snippet from a job's accumulated events. Prefers the
   * most recent text-delta or the assistant-message content; falls back to
   * the active tool name when no text is available yet.
   */
  function buildSnippet(events: ReadonlyArray<AgentEvent>): string {
    let text = ""
    let lastTool = ""
    for (const e of events) {
      if (e.kind === "text-delta") text += e.text
      else if (e.kind === "assistant-message") {
        for (const b of e.content) {
          if (b.type === "text") text += b.text
        }
      } else if (e.kind === "tool-use") lastTool = e.name
    }
    const trimmed = text.trim().split(/\r?\n/)[0] ?? ""
    if (trimmed.length > 0) return trimmed.slice(0, 120)
    if (lastTool) return `(running ${lastTool})`
    return "(no output yet)"
  }

  function appendBackgroundEvent(sessionId: string, turnId: string, event: AgentEvent): void {
    const list = getJobs(sessionId)
    const idx = list.findIndex((job) => job.turnId === turnId && job.status === "running")
    if (idx < 0) return
    const job = list[idx]
    if (job === undefined) return
    const events = [...job.events, event]
    const fresh = buildSnippet(events)
    // Prefer fresh content from events that arrived AFTER backgrounding;
    // fall back to the seed snippet (captured pre-backgrounding) when the
    // post-background events are still toolless / textless. This keeps the
    // SidePanel + system message useful even when a native background job
    // is already most-of-the-way through emitting text.
    const hasFresh = fresh && fresh !== "(no output yet)"
    const snippet = hasFresh ? fresh : job.snippet
    list[idx] = { ...job, events, snippet }
    notifyBackground(sessionId)
  }

  /**
   * Mark a job terminal + surface a system message in the conversation.
   * The system message is intentionally short — full output is preserved in
   * job.events for the BackgroundJobsPane / surfaceBackgroundJob flow.
   */
  function completeJob(sessionId: string, turnId: string, status: BackgroundJobStatus): void {
    const list = getJobs(sessionId)
    const idx = list.findIndex((job) => job.turnId === turnId && job.status === "running")
    if (idx < 0) return
    const job = list[idx]
    if (job === undefined) return
    const fresh = buildSnippet(job.events)
    const hasFresh = fresh && fresh !== "(no output yet)"
    const completed: BackgroundJob = {
      ...job,
      status,
      completedAt: Date.now(),
      snippet: hasFresh ? fresh : job.snippet,
    }
    list[idx] = completed
    notifyBackground(sessionId)

    // Schedule GC. The handle is a NodeJS.Timeout in node + bun (not the
    // browser DOM `number`); .unref() lets the process exit even when the
    // timer is still pending.
    const gcHandle: unknown = setTimeout(() => {
      const cur = jobsBySession.get(sessionId)
      if (!cur) return
      const filtered = cur.filter((t) => t.id !== completed.id)
      jobsBySession.set(sessionId, filtered)
      notifyBackground(sessionId)
    }, BACKGROUND_JOB_TTL_MS)
    if (gcHandle && typeof gcHandle === "object" && "unref" in gcHandle) {
      ;(gcHandle as { unref: () => void }).unref()
    }

    // Surface as a system message in the conversation. We send the text
    // through the regular user-message apply path with a `bg-` prefixed
    // turnId — SessionUpdateList recognises the prefix and renders a distinct
    // system-style row. This keeps us from having to extend AgentEvent
    // with a new kind (which would touch @km/agent-harness — out of scope
    // for this bead). See `BACKGROUND_MESSAGE_PREFIX` below.
    const handle = sessions.find((h) => h.id === sessionId)
    if (!handle) return
    const elapsedMs = (completed.completedAt ?? Date.now()) - completed.startedAt
    const elapsed = formatElapsed(elapsedMs)
    const verb = status === "cancelled" ? "cancelled" : status === "failed" ? "failed" : "completed"
    const text = `${BACKGROUND_MESSAGE_PREFIX}${verb} (${elapsed}): ${completed.snippet}`
    const sysTurnId = `bg-${completed.id}` as never
    handle.store.apply({
      kind: "user-message",
      sessionId: handle.session.sessionId,
      turnId: sysTurnId,
      text,
      ts: Date.now(),
    })
  }

  function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`
    return `${Math.round(ms / 60_000)}m`
  }

  // Default tribe backend — each controller has its own in-memory tribe so
  // sibling sessions can talk to each other. Real multi-workspace setups wire
  // to the bearly tribe daemon via SpawnSessionOptions.
  const tribe = opts.tribe ?? createInMemoryTribe()

  function makeInjectors(sessionName: string): Injector[] {
    const list: Injector[] = []
    list.push(cwdInjector())
    // Active bead injector — wraps bd data + the bd prime output so sessions
    // running under --bare still see the SessionStart context users depend on.
    //
    // Both probes are async + cached (see bd-prime.ts). The injector reads
    // the cache synchronously — if the pre-warm hasn't resolved yet the
    // injector skips this turn instead of blocking the event loop. UI
    // mount no longer pays the bd cold-start cost.
    list.push(
      activeBeadInjector(() => {
        const override = opts.getActiveBead?.() ?? {}
        if (override.beadId) return override
        return readActiveBeadPeek()
      }),
    )
    list.push({
      name: "bd-prime",
      run() {
        const out = bdPrimePeek()
        return out.length > 0 ? out : null
      },
    })
    // Channel-digest injector: surface tribe messages addressed to this
    // session as [channel from peer] reminders on the next turn.
    list.push(
      channelDigestInjector((sid) => {
        if (opts.drainChannel) return opts.drainChannel(sid)
        const maybe = (tribe as TribeBackend & { drain?: (n: string) => Array<{ from: string; text: string }> }).drain
        if (maybe) return maybe(sessionName)
        return []
      }),
    )
    return list
  }

  // Root of the silvercode host process (the km workspace). MCP servers are
  // resolved relative to this so `bun run <path>` inside the subprocess finds
  // the bin.ts files regardless of the session's own cwd.
  const workspaceRoot = opts.workspaceRoot ?? process.cwd()

  async function defaultSpawn(s: SpawnSessionOptions): Promise<AgentSession> {
    const injectors = makeInjectors(s.name)
    const mcpServers = opts.mcpServers ?? defaultMcpServers(s.name, workspaceRoot, findKmDb(s.cwd))
    // Spawn-transport agents come first (these are the legacy track
    // replacements). Each maps to its own factory:
    //   - codex-spawn       → spawnCodex (legacy stream-json codex)
    //   - claude-code-sdk   → spawnSdk (in-process Anthropic SDK)
    //   - claude-code-spawn → spawnClaude (default Claude legacy path)
    //   - undefined         → spawnClaude (default fallback)
    if (s.agent === "codex-spawn") {
      return spawnCodex({ cwd: s.cwd, injectors })
    }
    if (s.agent === "claude-code-sdk") {
      return spawnSdk({ cwd: s.cwd, model: s.model, injectors })
    }

    // ACP-transport agents — when the agent id is set and isn't one of
    // the spawn-transport ones, route through connectAcpRegistry.
    // Codex/Gemini/Copilot/Pi-acp/Claude-via-@km/claude-acp all surface
    // the same AgentSession interface, so the rest of the controller
    // (subscribe, send, close) is unchanged.
    //
    // caveats:
    // - fs handlers wire to local Bun.file read/write.
    // - injectors are NOT applied to the prompt (ACP `session/prompt` does
    //   not include silvercode's bd-prime / cwd / channel-digest text). That
    //   path is wired separately when the channel pipeline lands on the ACP
    //   transport (km-silvercode.acp-channels).
    if (s.agent && s.agent !== "claude-code-spawn") {
      const sessionScope = controllerScope.child(`acp-session-${s.id}`)
      const sessionId = s.id
      // Cast: s.agent is the canonical id (string); connectAcpRegistry
      // accepts known registry ids + any free-form id from a custom
      // ai.acp.<name> entry. Validation happens inside connectAcpRegistry
      // (throws on unknown id).
      return connectAcpRegistry(sessionScope, s.agent as AcpRegistryId, {
        cwd: s.cwd,
        sessionCwd: s.cwd,
        // Surface the resolved model so the SidePanel renders it. ACP
        // itself doesn't include a model field in its session lifecycle
        // — the agent picks per turn from the connection — but the
        // legacy `SessionState.model` consumed by silvercode UI needs
        // something to display. Empty string is fine when nothing's
        // resolved (e.g. an entry with no `--model` and no
        // `defaultModel` on the built-in agent).
        model: s.model ?? "",
        sessionConfig: s.sessionConfig,
        reasoningEffort: s.reasoningEffort,
        // ACP loadSession path: when the user passes --resume <sid>,
        // call agent.loadSession({ sessionId, ... }) instead of
        // newSession. Throws AcpResumeUnsupportedError if the agent
        // doesn't advertise loadSession capability. Per ACP registry
        // (verified 2026-04-26): codex / pi-acp / gemini / claude-code
        // all support loadSession. The bare sid is what we pass — the
        // <agent>: prefix added by silvercode on the way out has
        // already been stripped by the index.tsx --resume parser.
        resume: s.resume ? { sessionId: s.resume } : undefined,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        fsHandler: {
          async readTextFile({ path }) {
            return { content: await Bun.file(path).text() }
          },
          async writeTextFile({ path, content }) {
            await Bun.write(path, content)
            return {}
          },
        },
        /**
         * UI-driven permission handler — pushes the request onto the per-session
         * ACP permission queue and waits for `respondPermission[Option]` to
         * resolve it. The `acp-client` module already emits a `permission-request`
         * AgentEvent before calling this handler, so `session-store` has already
         * set `status = "awaiting-permission"` and the UI renders the
         * `<InlinePermissionPrompt>` above the composer.
         *
         * The handler returns a Promise that resolves only when the user
         * approves/denies via the controller's `respondPermission[Option]` methods,
         * which look up the resolver in `acpPermQueues` and call it with the
         * appropriate `RequestPermissionResponse`.
         */
        permissionHandler: async (rawReq) => {
          // Convert from SDK type to silvercode type so the rest of the
          // controller speaks the owned type surface (boundary discipline).
          const scReq = acpRequestPermissionToSilvercode(rawReq)
          const requestId = String(scReq.toolCall.toolCallId)
          // Push onto the queue. The promise resolves when the user approves
          // or denies via respondPermission / respondPermissionOption.
          const scResponse = await new Promise<RequestPermissionResponse>((resolve) => {
            let queueForSession = acpPermQueues.get(sessionId)
            if (!queueForSession) {
              queueForSession = new Map()
              acpPermQueues.set(sessionId, queueForSession)
            }
            queueForSession.set(requestId, {
              requestId,
              req: scReq,
              resolve,
            })
            const deferred = takeDeferredAcpDecision(sessionId, requestId)
            if (deferred) {
              const entry = queueForSession.get(requestId)
              if (!entry) return
              queueForSession.delete(requestId)
              if (queueForSession.size === 0) acpPermQueues.delete(sessionId)
              resolveAcpPermission(entry, deferred)
            }
          })
          // Convert silvercode response back to SDK type for the ACP wire.
          return silvercodeRequestPermissionResponseToAcp(scResponse)
        },
      })
    }
    // Default fallback: spawnClaude — the legacy `claude` stream-json
    // path. Reached when s.agent is undefined OR === "claude-code-spawn".
    // Multi-account: when an account is bound, the harness spawns claude
    // with CLAUDE_CONFIG_DIR pointing at ~/.config/claude-profiles/<name>/.
    // Undefined account → claude uses the user's main ~/.claude/.
    const configDir = s.account ? resolveAccountDir(s.account) : undefined
    return spawnClaude({
      cwd: s.cwd,
      model: s.model,
      resume: s.resume,
      bare: s.bare,
      injectors,
      mcpServers,
      configDir,
    })
  }

  const factory = opts.spawnFactory ?? defaultSpawn

  async function spawnSession(name?: string): Promise<SessionHandle> {
    if (sessions.length >= MAX_LIVE_SESSIONS) {
      throw new Error(
        `silvercode: spawn cap reached (${MAX_LIVE_SESSIONS} live sessions). Close one before spawning another.`,
      )
    }
    const id = `s${nextId}`
    const givenName = name ?? `session ${nextId}`
    nextId++
    const store = createSessionStore()
    const metadata: SessionHistoryMetadata = {
      agent: opts.agent,
      cwd: opts.cwd,
      model: opts.model,
      account: opts.account,
      resumeId: opts.resume,
      spawnedAt: Date.now(),
    }

    // --resume backfill: replay the on-disk JSONL transcript into the store
    // BEFORE spawning so the block shows prior turns immediately. Claude Code
    // will then --resume from server-side state, and new events stream in on
    // top of the replayed history.
    //
    // Only Claude Code stores transcripts at ~/.claude/projects/<cwd>/<sid>.jsonl.
    // ACP backends (codex, gemini, pi-acp, copilot) store transcripts under
    // their own homes and use a different schema; for those, loadSession on
    // the ACP server is responsible for hydrating prior turns via session
    // updates. Skip the local replay so non-Claude users don't see a
    // misleading "no transcript at ~/.claude/projects/..." error.
    const isClaudeAgent = isClaudeAgentId(opts.agent)
    const isCodexAgent = opts.agent === "codex" || opts.agent === "codex-spawn"
    // Yield to the event loop BEFORE replaying transcript so React can
    // commit an empty-session frame first. Without this yield, the
    // replay's hundreds of synchronous store.apply() calls run inline
    // before spawnSession's first `await` (line below), which blocks
    // createSilvercodeController's caller (App's first render) for
    // multiple seconds — visible as a blank screen at startup. Bead:
    // `@km/silvercode/defer-transcript-replay-blank-screen`. Empirical:
    // a heavy --resume target produced 9-second blank screens; this
    // yield lets the user see "Loading session…" within ~150 ms while
    // replay streams in incrementally.
    await Promise.resolve()
    if (opts.resume && isClaudeAgent) {
      metadata.transcriptPath = sessionJsonlPath(opts.cwd, opts.resume)
      metadata.replayStartedAt = Date.now()
      replaySessionFromDisk(store, opts.cwd, opts.resume)
      metadata.replayCompletedAt = Date.now()
      {
        const replayedMessages = store.state.get().messages
        metadata.replayMessageCount = replayedMessages.length
        metadata.replayBoundaryMessageId = replayedMessages.at(-1)?.id
      }
      recordClaudeSidechainSubagents(id, store, metadata, true)
    } else if (opts.resume && isCodexAgent) {
      // Codex stores rollouts at ~/.codex/sessions/YYYY/MM/DD/rollout-*-<sid>.jsonl
      // with a different schema than Claude's stream-json. The codex parser
      // walks them and emits canonical AgentEvents into the store so prior
      // turns appear in the block. See codex-resume.ts for the mapping table.
      metadata.transcriptPath = findCodexTranscript(opts.resume) ?? undefined
      metadata.replayStartedAt = Date.now()
      replayCodexSessionFromDisk(store, opts.resume)
      metadata.replayCompletedAt = Date.now()
      {
        const replayedMessages = store.state.get().messages
        metadata.replayMessageCount = replayedMessages.length
        metadata.replayBoundaryMessageId = replayedMessages.at(-1)?.id
      }
    }

    let session: AgentSession
    try {
      session = await Promise.resolve(
        factory({
          id,
          name: givenName,
          agent: opts.agent,
          cwd: opts.cwd,
          model: opts.model,
          reasoningEffort: opts.reasoningEffort,
          sessionConfig: opts.sessionConfig,
          resume: opts.resume,
          bare: opts.bare,
          account: opts.account,
        }),
      )
    } catch (err) {
      if (!(opts.resume && isCodexAgent)) throw err
      const message = err instanceof Error ? err.message : String(err)
      const replayOnlyMessage =
        `Live Codex resume failed: ${message}. ` +
        "Showing the recovered transcript only; start a fresh session to continue."
      store.apply({
        kind: "error",
        sessionId: opts.resume as SessionId,
        message: replayOnlyMessage,
        ts: Date.now(),
      })
      session = createReplayOnlySession(opts.resume, replayOnlyMessage)
    }

    let log: EventLog | undefined
    if (opts.logDir) log = createFileEventLog(opts.logDir)

    const unsub = session.subscribe((event: AgentEvent) => {
      // Drop stream events for an interrupted turn — the user already saw
      // the "interrupted" system message, so we don't want subsequent
      // text-deltas / tool-uses to repaint that turn after the fact. The
      // store still receives the eventual turn-end (so any downstream
      // bookkeeping settles); the messages preceding it are suppressed.
      const evTurnId = "turnId" in event ? (event.turnId as string | undefined) : undefined
      if (evTurnId && interruptedTurnIds.get(id)?.has(evTurnId)) {
        // Allow only terminal events through to keep status accounting
        // consistent. Everything else (text-delta, tool-use, etc.) is
        // dropped.
        if (event.kind !== "turn-end" && event.kind !== "session-end" && event.kind !== "session-lifecycle") {
          dBackground("interrupt-drop %s/%s event=%s", id, evTurnId, event.kind)
          return
        }
      }
      // Mirror events for any backgrounded turn into its BackgroundJob
      // event buffer. We match by turnId (events that don't carry a turnId
      // can't be associated with a specific background job and are
      // skipped). turn-end / error events also flip job status.
      const turnId = "turnId" in event ? (event.turnId as string | undefined) : undefined
      if (turnId && isBackgroundedTurn(id, turnId)) {
        dBackground("mirror %s/%s event=%s", id, turnId, event.kind)
        if (log) log.append(event)
        appendBackgroundEvent(id, turnId, event)
        if (event.kind === "turn-end") {
          // If the user already cancelled this job, suppress the surfaced
          // result message — we already showed "cancelled" — but still flip
          // the running flag so the indicator decrements.
          const cancelled = cancelledJobIds.get(id)
          const jobs = getJobs(id)
          const runningJob = jobs.find((job) => job.turnId === turnId && job.status === "running")
          if (runningJob && cancelled?.has(runningJob.id)) {
            const idx = jobs.findIndex((job) => job.id === runningJob.id)
            if (idx >= 0) {
              jobs[idx] = { ...runningJob, status: "cancelled", completedAt: Date.now() }
              notifyBackground(id)
            }
          } else {
            completeJob(id, turnId, "completed")
          }
          backgroundedTurnIds.get(id)?.delete(turnId)
          clearOutboundTurn(id, turnId as TurnId)
        } else if (event.kind === "error") {
          // Don't terminate the job on every error — the harness emits
          // recoverable errors too. Only flip if the next event is turn-end
          // (handled above). For now record the error and let turn-end take
          // over; failed terminal status is reserved for future use.
        }
        return
      }

      store.apply(event)
      if (log) log.append(event)

      // Sub-agent notification signal — emit start/complete/fail events when
      // the agent invokes the Task tool. The adapter filters non-Task
      // tool calls internally, so we forward every tool-use/tool-result
      // unconditionally. Per-session attribution flows via `sessionId`.
      if (subagentAdapter) {
        if (event.kind === "tool-use") {
          subagentAdapter.notifyTaskToolUse({
            toolUseId: event.id as unknown as string,
            toolName: event.name,
            input: event.input,
            sessionId: id,
          })
        } else if (event.kind === "tool-result") {
          subagentAdapter.notifyTaskToolResult({
            toolUseId: event.id as unknown as string,
            output: event.output,
            isError: event.is_error,
            sessionId: id,
          })
        }
      }

      let outboundAcknowledged = false
      if (isOutboundAckEvent(event)) {
        outboundAcknowledged = acknowledgeOutbound(id, event.kind)
      }
      if (event.kind === "turn-end") {
        clearOutboundTurn(id, event.turnId)
      } else if (event.kind === "session-end" || (event.kind === "session-lifecycle" && event.state === "ended")) {
        clearOutbound(id)
      } else if (event.kind === "error") {
        clearUnstartedOutbound(id)
      }

      // Flush when a pending stdin write is acknowledged by backend
      // activity, or on terminal lifecycle edges. The whole queue still
      // goes as ONE turn.
      if (outboundAcknowledged || event.kind === "turn-end" || event.kind === "session-lifecycle") {
        dQueue("subscribe %s — event=%s, calling tryFlush", id, event.kind)
        tryFlush(id)
      }

      // Mirror coarse status into the cross-agent state so peer sessions
      // see a meaningful "what is this session up to right now" hint.
      // We only flip on events that have an unambiguous meaning — fine-
      // grained spinner states stay inside the per-session SessionStore.
      if (event.kind === "session-init") {
        metadata.sessionId = event.sessionId
        metadata.model = event.model || metadata.model
        metadata.cwd = event.cwd || metadata.cwd
        metadata.sessionInitAt = event.ts
        crossAgentState.updateSessionStatus(id, "idle")
        ctrlStartupTick("session-init:received", { sessionId: id })
      } else if (event.kind === "turn-start") {
        crossAgentState.updateSessionStatus(id, "thinking")
      } else if (event.kind === "turn-end") {
        crossAgentState.updateSessionStatus(id, "idle")
        // Per-session recall probe — every Nth assistant turn-end,
        // query @bearly/recall against the most recent user prompt
        // and surface a digest as one notification event. Recall itself
        // self-rate-limits; this counter is the secondary throttle.
        // See `notification-adapters/recall.ts` for the full pipeline.
        maybeProbeRecall(id)
      } else if (event.kind === "session-end") {
        metadata.endedAt = event.ts
        crossAgentState.updateSessionStatus(id, "ended")
      } else if (event.kind === "session-lifecycle" && event.state === "ended") {
        metadata.endedAt = event.ts
        crossAgentState.updateSessionStatus(id, "ended")
      }

      if (isClaudeAgent) {
        recordClaudeSidechainSubagents(
          id,
          store,
          metadata,
          event.kind === "session-init" || event.kind === "tool-result" || event.kind === "turn-end",
        )
      }
    })

    // Per-session coordinator-mcp — in-process server bound to this
    // session's identity. Mutating tools (claim/release/handoff) are
    // attributed to `id` automatically; the agent never spells its own
    // identity in tool args. State is the controller-shared store.
    const coordinatorMcp = createCoordinatorMcpServer(crossAgentState, id)
    crossAgentState.addSession({
      sessionId: id,
      name: givenName,
      model: opts.model,
      status: "spawning",
      startedAt: Date.now(),
    })

    const handle: SessionHandle = {
      id,
      name: givenName,
      store,
      session,
      unsubscribe: unsub,
      log,
      account: opts.account,
      coordinatorMcp,
      metadata,
      resumeId: opts.resume,
    }

    // Welcome UI — rendered as a React component (see Welcome.tsx) when the
    // message list is empty. That lets it read claudeCodeVersion / model /
    // apiKeySource live from the store after session-init arrives, instead
    // of baking a synthesized turn at spawn time (when those fields aren't
    // yet known).

    sessions.push(handle)
    if (!focusedId) {
      focusedId = id
      notifyFocus()
    }
    notifySessions()
    return handle
  }

  // Pre-warm the bd-prime + active-bead caches asynchronously. These
  // probes shell out to `bd` (multi-second cold-start when Dolt isn't
  // running) and used to live in `makeInjectors` as sync execSyncs —
  // which blocked silvery's render flush until they resolved. Now they
  // run in the background; the injectors read the cache synchronously
  // when a user submits a turn (and skip if not yet warm).
  void bdPrimeOutputAsync(opts.cwd)
    .then((out) => ctrlStartupTick("controller:create:bdPrimeWarm", { bytes: out.length }))
    .catch(() => {
      /* swallowed inside bd-prime.ts */
    })
  void readActiveBeadAsync(opts.cwd)
    .then((s) => ctrlStartupTick("controller:create:bdActiveWarm", { hasBead: Boolean(s.beadId) }))
    .catch(() => {
      /* swallowed inside bd-prime.ts */
    })

  ctrlStartupTick("controller:create:beforeInitialSpawn", { sessions: opts.initialSessions })
  // Eagerly spawn the requested number of initial sessions.
  for (let i = 0; i < opts.initialSessions; i++) {
    void spawnSession()
      .then(() => {
        // Successful spawn clears any prior spawn-error banner.
        setSpawnError(null)
        return
      })
      .catch((err: unknown) => {
        // Surface spawn failures both to stderr (for users running
        // outside alt-screen) and to the in-UI banner (for users inside
        // alt-screen, where stderr is invisible). The spawn can fail
        // because of:
        //   - AcpResumeUnsupportedError (the agent doesn't advertise
        //     loadSession in its initialize response)
        //   - The agent's loadSession returned an error (sid expired,
        //     session storage gone, etc.)
        //   - The ACP connection closed before initialize completed
        //   - Subprocess spawn failed (binary missing, permission denied)
        // In all cases the user wants to know — silent failure produces
        // an empty-looking session indistinguishable from a fresh start.
        // Bead: km-silvercode.spawn-error-blank-screen.
        const message = err instanceof Error ? err.message : String(err)
        const opname = opts.resume ? `resume ${opts.resume}` : "spawn session"
        const formatted = `silvercode: ${opname} failed: ${message}`
        process.stderr.write(`${formatted}\n`)
        setSpawnError(formatted)
      })
  }

  return {
    snapshot(): SessionHandle[] {
      return sessions.slice()
    },
    focusedId(): string {
      return focusedId
    },
    focus(id: string): void {
      if (id === focusedId) return
      if (!sessions.some((s) => s.id === id)) return
      focusedId = id
      notifyFocus()
    },
    subscribe(handler: (s: SessionHandle[]) => void): () => void {
      sessionSubs.add(handler)
      handler(sessions.slice())
      return () => sessionSubs.delete(handler)
    },
    onFocusChange(handler: (id: string) => void): () => void {
      focusSubs.add(handler)
      handler(focusedId)
      return () => focusSubs.delete(handler)
    },
    lastSpawnError(): string | null {
      return spawnError
    },
    onSpawnError(handler: (message: string | null) => void): () => void {
      spawnErrorSubs.add(handler)
      handler(spawnError)
      return () => spawnErrorSubs.delete(handler)
    },
    send(sessionId: string, text: string): void {
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      // Non-sendable → append to buffer and let tryFlush drain once the
      // transport is ready. The extra outbound gate covers the gap
      // between stdin write and the first provider response event, when
      // the store still reports idle but another user turn is already in
      // flight.
      if (!canSubmitNow(s)) {
        const prev = queues.get(sessionId) ?? ""
        const next = prev ? `${prev}\n\n${text}` : text
        queues.set(sessionId, next)
        notifyQueue(sessionId)
        const status = s.store.state.get().status
        const outbound = outboundState(sessionId)?.kind ?? "none"
        dQueue("send %s — queued (status=%s outbound=%s len=%d)", sessionId, status, outbound, next.length)
        return
      }
      // Idle + no hold → send immediately, but include any pending queue
      // text (edited or auto-queued earlier) as part of the same turn.
      const pending = queues.get(sessionId) ?? ""
      const combined = pending ? `${pending}\n\n${text}` : text
      queues.set(sessionId, "")
      notifyQueue(sessionId)
      dispatchUserTurn(s, sessionId, combined)
    },
    queuedText(sessionId: string): string {
      return queues.get(sessionId) ?? ""
    },
    setQueuedText(sessionId: string, text: string): void {
      if (text === (queues.get(sessionId) ?? "")) return
      queues.set(sessionId, text)
      notifyQueue(sessionId)
    },
    onQueueChange(handler: (sessionId: string, text: string) => void): () => void {
      queueSubs.add(handler)
      for (const [sid, t] of queues) handler(sid, t)
      return () => queueSubs.delete(handler)
    },
    clearQueue(sessionId: string): void {
      if (!queues.get(sessionId)) return
      queues.set(sessionId, "")
      notifyQueue(sessionId)
    },
    flushQueue(sessionId: string): void {
      // Explicit user-initiated submit — bypasses the idle gate. Claude
      // Code's CLI buffers stdin while mid-turn, so the message lands as
      // the next turn's input.
      dQueue("flushQueue %s — explicit submit", sessionId)
      tryFlush(sessionId, true)
    },
    autoFlushQueue(sessionId: string): void {
      dQueue("autoFlushQueue %s — retry normal auto-flush", sessionId)
      tryFlush(sessionId)
    },
    respondPermission(sessionId: string, requestId: string, approved: boolean): void {
      // Check ACP queue first — if there's a pending resolver for this
      // requestId, resolve it with the binary approved/cancelled outcome.
      const acpQueue = acpPermQueues.get(sessionId)
      if (acpQueue?.has(requestId)) {
        const entry = acpQueue.get(requestId)
        if (!entry) return
        acpQueue.delete(requestId)
        if (acpQueue.size === 0) acpPermQueues.delete(sessionId)
        resolveAcpPermission(entry, { approved })
        return
      }
      // Legacy stream-json path.
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      if (isAcpSession(s.session)) {
        deferAcpDecision(sessionId, requestId, { approved })
        return
      }
      s.session.respondToPermission(requestId as PermissionRequestId, approved)
    },
    respondPermissionOption(
      sessionId: string,
      requestId: string,
      optionId: PermissionOptionId,
      approved: boolean,
    ): void {
      // Route through ACP permission queue when the session has a pending
      // resolver (ACP path). Falls back to the binary respondPermission for
      // legacy sessions that don't use multi-option permissions.
      const acpQueue = acpPermQueues.get(sessionId)
      if (acpQueue?.has(requestId)) {
        const entry = acpQueue.get(requestId)
        if (!entry) return
        acpQueue.delete(requestId)
        if (acpQueue.size === 0) acpPermQueues.delete(sessionId)
        resolveAcpPermission(entry, { approved, optionId })
        return
      }
      // Fallback: legacy binary path.
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      if (isAcpSession(s.session)) {
        deferAcpDecision(sessionId, requestId, { approved, optionId })
        return
      }
      s.session.respondToPermission(requestId as PermissionRequestId, approved)
    },
    async setSessionConfigOption(sessionId: string, params: AcpSetSessionConfigOptionParams): Promise<void> {
      await setSessionConfigOption(sessionId, params)
    },
    async setReasoningEffort(sessionId: string, effort: ReasoningEffort): Promise<void> {
      await setSessionConfigOption(sessionId, {
        configId: "reasoning_effort",
        value: effort,
      })
    },
    respondAskUserQuestion(
      sessionId: string,
      toolUseId: string,
      answers: ReadonlyArray<{ question: string; label: string }>,
    ): void {
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      // Clear the UI's pendingQuestion via a synthetic tool-result event.
      // The reducer matches on toolUseId and zeroes pendingQuestion.
      s.store.apply({
        kind: "tool-result",
        sessionId: s.session.sessionId,
        id: toolUseId as never,
        output: {
          questions: answers.map((a) => ({ question: a.question, label: a.label })),
          answers: answers.reduce<Record<string, string>>((acc, a) => {
            acc[a.question] = a.label
            return acc
          }, {}),
        },
        ts: Date.now(),
      })
      // Send the answer back to the agent as a follow-up user message.
      // We can't inject a synthetic tool_result block into Claude Code's
      // CLI mid-turn — its stream-json input only accepts user / permission
      // / interrupt — so the answer arrives as a user-authored explanation
      // of what was picked. The agent reads it on the next turn and
      // continues. Multi-question form: "Q1: A1\nQ2: A2".
      const formatted = answers.map((a) => `${a.question} → ${a.label}`).join("\n")
      s.session.send(formatted)
    },
    cancelAskUserQuestion(sessionId: string, toolUseId: string): void {
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      s.store.apply({
        kind: "tool-result",
        sessionId: s.session.sessionId,
        id: toolUseId as never,
        output: { cancelled: true },
        is_error: true,
        ts: Date.now(),
      })
      // Tell the agent the user cancelled — without this it sits waiting
      // for an answer that never comes.
      s.session.send("(user cancelled the question)")
    },
    runSlashCommand(sessionId: string, text: string): void {
      // Slash commands pass through verbatim — Claude Code interprets /compact, /clear, etc.
      // Silvercode-specific commands (/handoff, /fork) are intercepted by listeners
      // registered above the controller.
      //
      // Bug fix (km-silvercode.prompt-echo-in-chat): do NOT post an optimistic
      // user-message into the store. Unlike `send()`, slash commands are
      // consumed silently — Claude Code typically renders the outcome (or
      // nothing) rather than echoing the slash text back, so an optimistic
      // echo would never get matched/replaced and would leak into chat as a
      // permanent fake user row. We also intentionally skip arming the
      // prompt-echo strip here; if a slash command unexpectedly does echo
      // back (rare), the dedup window in `applyUserMessage` handles it.
      // Slash commands that want to render confirmation (e.g. /handoff) opt
      // in explicitly via their own message-append paths.
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      s.session.send(text)
    },
    // Wrap spawnSession so user-initiated spawns also propagate spawn-error
    // banner state — clears on success, sets on failure. Mirrors the eager-
    // spawn loop's behavior so the UI banner stays in sync regardless of
    // which call path triggered the spawn.
    async spawnSession(name?: string): Promise<SessionHandle> {
      try {
        const handle = await spawnSession(name)
        setSpawnError(null)
        return handle
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setSpawnError(`silvercode: spawn session failed: ${message}`)
        throw err
      }
    },
    handoff(fromId: string, toId: string, prompt: string): void {
      const from = sessions.find((h) => h.id === fromId)
      const to = sessions.find((h) => h.id === toId)
      if (!from || !to) return
      // Emit a synthetic handoff event into both stores for auditability, then
      // seed the destination with a brief summary of the source session's
      // recent context so the agent can pick up without re-reading.
      const fromState = from.store.state.get()
      const recent = fromState.messages.slice(-3)
      const summary = recent
        .map((m) => {
          if (m.role === "user") return `USER: ${m.text}`
          const text =
            m.text ||
            m.blocks
              ?.filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("") ||
            ""
          const tools = m.toolCalls.map((c) => `  ${c.name}(${JSON.stringify(c.input).slice(0, 80)})`).join("\n")
          return `ASSISTANT: ${text}${tools ? "\n" + tools : ""}`
        })
        .join("\n\n")
      const handoffText = `[Handed off from session "${from.name}"]\n\nRecent context:\n${summary}\n\nContinue with: ${prompt}`
      to.session.send(handoffText)
      from.store.apply({
        kind: "handoff",
        from: from.id as never,
        to: to.id as never,
        context: { prompt },
        ts: Date.now(),
      })
      to.store.apply({
        kind: "handoff",
        from: from.id as never,
        to: to.id as never,
        context: { prompt },
        ts: Date.now(),
      })
    },
    async fork(fromId: string): Promise<SessionHandle> {
      const from = sessions.find((h) => h.id === fromId)
      if (!from) throw new Error(`session ${fromId} not found`)
      return spawnSession(`${from.name}-fork`)
    },
    closeAll(): void {
      // Synchronous SIGTERM to every child, then unsubscribe. Children
      // shut down gracefully in the background; we don't wait. Listen on
      // session.subscribe('session-end') if a caller needs confirmation.
      const reportCloseFailure = (s: SessionHandle, err: unknown): void => {
        const message = err instanceof Error ? err.message : String(err)
        dBackground("session close failed session=%s error=%s", s.id, message)
        s.store.apply({
          kind: "error",
          sessionId: s.id as SessionId,
          message: `session close failed: ${message}`,
          raw: err,
          ts: Date.now(),
        })
      }
      for (const s of sessions) {
        try {
          void s.session.close().catch((err: unknown) => reportCloseFailure(s, err))
        } catch (err) {
          reportCloseFailure(s, err)
        }
        s.unsubscribe()
        // Drop the session from cross-agent state too — releases any
        // claims it held so peers don't see ghost holders.
        crossAgentState.removeSession(s.id)
        // Cancel any pending ACP permission resolvers so dangling promises
        // don't leak — the session is gone, so any queued request is moot.
        const acpQueue = acpPermQueues.get(s.id)
        if (acpQueue) {
          for (const entry of acpQueue.values()) {
            entry.resolve({ outcome: { outcome: "cancelled" } })
          }
          acpPermQueues.delete(s.id)
        }
      }
      // Dispose the controller-owned scope (tears down channel-source
      // watchers, clears the channel queue) only if we created it.
      // Hosts that supplied their own scope are responsible for it.
      if (ownsScope) {
        // Fire-and-forget — Scope[Symbol.asyncDispose] returns a Promise
        // we don't await (matches the rest of closeAll's sync contract).
        void controllerScope[Symbol.asyncDispose]().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          dBackground("controller scope dispose failed: %s", message)
        })
      }
    },
    backgroundActiveJob(sessionId: string): void {
      const handle = sessions.find((h) => h.id === sessionId)
      if (!handle) return
      const status = handle.store.state.get().status
      dBackground("backgroundActiveJob %s disabled (status=%s)", sessionId, status)
    },
    interruptActiveJob(sessionId: string): void {
      const handle = sessions.find((h) => h.id === sessionId)
      if (!handle) return
      const status = handle.store.state.get().status
      if (status === "idle" || status === "ended") {
        dBackground("interruptActiveJob %s — no active job (status=%s)", sessionId, status)
        return
      }
      const turnId = findActiveTurnId(handle)
      if (!turnId) {
        dBackground("interruptActiveJob %s — no active turn id (status=%s)", sessionId, status)
        return
      }
      // Already interrupted? no-op (idempotent).
      let interrupted = interruptedTurnIds.get(sessionId)
      if (!interrupted) {
        interrupted = new Set()
        interruptedTurnIds.set(sessionId, interrupted)
      }
      if (interrupted.has(turnId)) {
        dBackground("interruptActiveJob %s/%s — already interrupted", sessionId, turnId)
        return
      }
      interrupted.add(turnId)
      dBackground("interruptActiveJob %s/%s — interrupting", sessionId, turnId)

      // Capture a snippet of the partial output so the user sees what
      // they interrupted — same convention as backgroundActiveJob.
      const state = handle.store.state.get()
      const existing = state.messages.find((m) => m.id === turnId)
      const seedSnippet = existing?.text.trim().split(/\r?\n/)[0]?.slice(0, 120) ?? "(running)"

      // Mark the foreground shell sendable via a synthetic turn-end so the
      // user can keep typing. The real turn-end will arrive later but is
      // a no-op (stopReason just gets overwritten).
      handle.store.apply({
        kind: "turn-end",
        sessionId: handle.session.sessionId,
        turnId: turnId as never,
        stopReason: "interrupted",
        ts: Date.now(),
      })

      // Surface a system message marking the interrupt. Uses the same
      // BACKGROUND_MESSAGE_PREFIX channel as background results so
      // SessionUpdateList renders it with the system treatment.
      const sysTurnId = `int-${turnId}-${Date.now()}` as never
      handle.store.apply({
        kind: "user-message",
        sessionId: handle.session.sessionId,
        turnId: sysTurnId,
        text: `${BACKGROUND_MESSAGE_PREFIX}interrupted by Esc: ${seedSnippet}`,
        ts: Date.now(),
      })
    },
    popQueueHead(sessionId: string): string {
      const text = queues.get(sessionId) ?? ""
      if (text.length === 0) return ""
      // Wire format: entries joined by `\n\n`. Pop the first entry and
      // leave the rest in the queue.
      const sepIdx = text.indexOf("\n\n")
      const head = sepIdx >= 0 ? text.slice(0, sepIdx) : text
      const rest = sepIdx >= 0 ? text.slice(sepIdx + 2) : ""
      queues.set(sessionId, rest)
      notifyQueue(sessionId)
      return head
    },
    surfaceBackgroundJob(sessionId: string, jobId: string): void {
      const handle = sessions.find((h) => h.id === sessionId)
      if (!handle) return
      const list = getJobs(sessionId)
      const job = list.find((candidate) => candidate.id === jobId)
      if (!job) return
      // v1: inject a status note into the conversation so the user sees
      // the snippet again as a reminder + receives a fresh anchor for the
      // surfaced job. The full event log is in `job.events`.
      const verb = job.status === "running" ? "still running" : job.status
      const text = `${BACKGROUND_MESSAGE_PREFIX}${verb} (shown): ${job.snippet}`
      const sysTurnId = `bg-show-${job.id}-${Date.now()}` as never
      handle.store.apply({
        kind: "user-message",
        sessionId: handle.session.sessionId,
        turnId: sysTurnId,
        text,
        ts: Date.now(),
      })
      dBackground("surfaceBackgroundJob %s/%s — surfaced", sessionId, jobId)
    },
    cancelBackgroundJob(sessionId: string, jobId: string): void {
      const list = getJobs(sessionId)
      const idx = list.findIndex((t) => t.id === jobId)
      if (idx < 0) return
      const job = list[idx]
      if (job === undefined) return
      // Already terminal? no-op.
      if (job.status !== "running") return
      // Record the cancellation so the eventual turn-end is treated as a
      // no-op (don't surface "completed" after the user already saw
      // "cancelled"). The underlying subprocess turn keeps running because
      // AgentSession does not yet expose per-turn cancellation —
      // `session.close()` would kill the WHOLE session and lose all other
      // state. Tracked upstream in km-agent-harness.per-turn-abort.
      let cancelled = cancelledJobIds.get(sessionId)
      if (!cancelled) {
        cancelled = new Set()
        cancelledJobIds.set(sessionId, cancelled)
      }
      cancelled.add(job.id)
      list[idx] = { ...job, status: "cancelled", completedAt: Date.now() }
      notifyBackground(sessionId)
      // Surface a short cancellation message in the conversation.
      const handle = sessions.find((h) => h.id === sessionId)
      if (handle) {
        const sysTurnId = `bg-cancel-${job.id}` as never
        handle.store.apply({
          kind: "user-message",
          sessionId: handle.session.sessionId,
          turnId: sysTurnId,
          text: `${BACKGROUND_MESSAGE_PREFIX}cancelled: ${job.snippet}`,
          ts: Date.now(),
        })
      }
      dBackground("cancelBackgroundJob %s/%s", sessionId, jobId)
    },
    backgroundJobs(sessionId: string): ReadonlyArray<BackgroundJob> {
      return jobsBySession.get(sessionId) ?? []
    },
    onBackgroundJobsChange(handler: (sessionId: string, jobs: ReadonlyArray<BackgroundJob>) => void): () => void {
      backgroundSubs.add(handler)
      // Replay current state for every session so the subscriber sees an
      // initial snapshot.
      for (const [sid, jobs] of jobsBySession) handler(sid, jobs)
      return () => backgroundSubs.delete(handler)
    },
    channelQueue,
    notificationStream,
    notificationMuteState,
    crossAgentState,
  }
}
