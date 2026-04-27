/**
 * @km/agent-harness — public API.
 *
 * Track 1: subprocess spawn of `claude --bare -p` (default).
 * Track 2: @anthropic-ai/claude-agent-sdk (API-key).
 * Track M12: `codex` CLI subprocess.
 *
 * All three expose the same AgentSession interface and emit the canonical
 * AgentEvent schema — the UI layer never branches on backend.
 */

export * from "./events.ts"
export { createStreamJsonParser, createLineSplitter } from "./parse.ts"
export type { StreamJsonParser } from "./parse.ts"
// Layer 3 transcript loop-closure (ambient-context-safety.md § 3 Layer 3).
// The parser auto-applies `quarantineLeadingRolePrefix` to every assistant
// text block; these exports let the silvercode transcript builder do the
// same when it works directly with `messages[]` arrays.
export {
  ASSISTANT_ROLE_QUARANTINE_SENTINEL,
  quarantineLeadingRolePrefix,
  startsWithRolePrefix,
} from "./transcript-loop-closure.ts"
export { spawnClaude } from "./spawn.ts"
export type { SpawnClaudeOptions, McpServerSpec } from "./spawn.ts"
export { spawnSdk } from "./sdk-adapter.ts"
export type { SpawnSdkOptions } from "./sdk-adapter.ts"
export { spawnCodex } from "./codex-spawn.ts"
export type { SpawnCodexOptions } from "./codex-spawn.ts"
export { runInjectors, activeBeadInjector, cwdInjector, channelDigestInjector } from "./injectors.ts"
export type { Injector, InjectorContext } from "./injectors.ts"
export { createFileEventLog, createMemoryEventLog } from "./event-log.ts"
export type { EventLog } from "./event-log.ts"
export { createSessionStore } from "./session-store.ts"
export type {
  SessionState,
  SessionStore,
  MessageEntry,
  MessageOp,
  ToolCallEntry,
  ToolResultEntry,
  Todo,
} from "./session-store.ts"

// ACP-shaped canonical types (silvercode's own namespace; structurally
// compatible with @agentclientprotocol/sdk at v1). See ./acp-types.ts.
export type {
  Annotations,
  AgentCapabilities,
  AudioContent,
  AvailableCommand,
  AvailableCommandInput,
  AvailableCommandsUpdate,
  BlobResourceContents,
  ClientCapabilities,
  ConfigOptionUpdate,
  Content,
  ContentBlock,
  ContentChunk,
  Cost,
  CurrentModeUpdate,
  Diff,
  EmbeddedResource,
  EmbeddedResourceResource,
  FileSystemCapabilities,
  ImageContent,
  PermissionOption,
  PermissionOptionId,
  PermissionOptionKind,
  Plan,
  PlanEntry,
  PlanEntryPriority,
  PlanEntryStatus,
  ProtocolVersion,
  RequestPermissionOutcome,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ResourceLink,
  Role,
  SelectedPermissionOutcome,
  SessionInfoUpdate,
  SessionMode,
  SessionModeId,
  SessionUpdate,
  SessionUpdateKind,
  StopReason,
  Terminal,
  TextContent,
  TextResourceContents,
  ToolCall,
  ToolCallContent,
  ToolCallId,
  ToolCallLocation,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
  UnstructuredCommandInput,
  UsageUpdate,
} from "./acp-types.ts"

// ACP boundary adapter — bidirectional conversion between silvercode types
// and the upstream @agentclientprotocol/sdk wire types. See ./acp-boundary.ts.
export {
  acpAgentCapabilitiesToSilvercode,
  acpClientCapabilitiesToSilvercode,
  acpContentBlockToSilvercode,
  acpRequestPermissionResponseToSilvercode,
  acpRequestPermissionToSilvercode,
  acpToSilvercode,
  silvercodeAgentCapabilitiesToAcp,
  silvercodeClientCapabilitiesToAcp,
  silvercodeContentBlockToAcp,
  silvercodeRequestPermissionResponseToAcp,
  silvercodeRequestPermissionToAcp,
  silvercodeToAcp,
} from "./acp-boundary.ts"

// ACP client — scope-bound ClientSideConnection factory for external ACP
// servers (Codex, Gemini CLI, GitHub Copilot CLI, pi-acp). NOT for wrapping
// Claude Code — see acp-adapter-claude bead.
export { connectAcp, connectAcpRegistry, __setAcpSpawnForTesting, AcpResumeUnsupportedError } from "./acp-client.ts"
export type {
  AcpAgentSession,
  AcpConnectOpts,
  AcpRegistryId,
  AcpSpawn,
  AcpSpawnedChild,
  FsHandler,
  PermissionHandler,
  TerminalHandler,
} from "./acp-client.ts"

// ---------------------------------------------------------------------------
// ACP fake — Layer 1 of `km-silvercode.acp-fake`. Scriptable test double that
// returns an `AgentSession` driven by a sequence of `AgentEvent`s. Drop-in
// for `spawnClaude` in tests, storybook, and adapter-replay scenarios.
// See ./fake.ts.
// ---------------------------------------------------------------------------
export { createFakeAcpSession, loadFixture } from "./fake.ts"
export type {
  FakeFixtureName,
  FakeOpts,
  ManualFakeSession,
  PermissionPolicy,
  PermissionPolicyFn,
  ScriptStep,
  ScriptedDecisions,
} from "./fake.ts"

// ---------------------------------------------------------------------------
// ACP session — silvery-house-style reactive wrapper around the legacy
// AgentSession event stream. Drains AgentEvent → signals/projections/trees
// over silvercode's canonical ACP-shaped types. Components subscribe here
// instead of pattern-matching SessionUpdate or AgentEvent variants.
// See ./acp-session.ts. Bead: km-silvercode.acp-session.
// ---------------------------------------------------------------------------
export { createAcpSession } from "./acp-session.ts"
export type {
  AcpSession,
  AcpSessionOpts,
  AcpSessionStatus,
  Message,
  PendingPermission,
  PermissionDecision,
  ReadProjection,
  ReadSignal,
} from "./acp-session.ts"

// ---------------------------------------------------------------------------
// ACP adapter — Claude Code stream-json. Convenience factory that composes
// `spawnClaude` (subprocess + stream-json parser) with `createAcpSession`
// (signals over ACP-shaped types). THIS IS THE CANONICAL CLAUDE PATH FOR
// SUBSCRIPTION-AUTH USERS — `@agentclientprotocol/claude-agent-acp` blocks
// Claude.ai subscriptions at session-init.
// See ./acp-adapter-claude.ts. Bead: km-silvercode.acp-adapter-claude.
// ---------------------------------------------------------------------------
export { spawnClaudeAcpSession } from "./acp-adapter-claude.ts"
export type { SpawnClaudeAcpOpts } from "./acp-adapter-claude.ts"
