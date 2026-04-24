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
export { spawnClaude } from "./spawn.ts"
export type { SpawnClaudeOptions } from "./spawn.ts"
export { spawnSdk } from "./sdk-adapter.ts"
export type { SpawnSdkOptions } from "./sdk-adapter.ts"
export { spawnCodex } from "./codex-spawn.ts"
export type { SpawnCodexOptions } from "./codex-spawn.ts"
export {
  runInjectors,
  activeBeadInjector,
  cwdInjector,
  channelDigestInjector,
} from "./injectors.ts"
export type { Injector, InjectorContext } from "./injectors.ts"
export { createFileEventLog, createMemoryEventLog } from "./event-log.ts"
export type { EventLog } from "./event-log.ts"
export { createSessionStore } from "./session-store.ts"
export type { SessionState, SessionStore, MessageEntry, Todo } from "./session-store.ts"
