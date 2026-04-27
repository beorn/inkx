/**
 * SDK-flavoured fake session — same `AgentSession` interface as
 * `createFakeSession`, but with metadata that mirrors what `spawnSdk`
 * (the `@anthropic-ai/claude-agent-sdk` adapter) normally produces.
 *
 * The SDK path emits events with the same kinds as `spawnClaude` but the
 * defaults differ:
 *
 *   - Session-id is the SDK's own uuid format, prefixed `sdk-…` here.
 *   - `apiKeySource` is always `ANTHROPIC_API_KEY` (the SDK does not use
 *     the Claude Code OAuth token gate).
 *   - `claudeCodeVersion` is `"n/a"` — the SDK has no CLI version string.
 *
 * Tests that exercise the SDK-vs-CLI selection logic (auth detection,
 * agent-harness backend selection, model resolution) should use this
 * helper so the asserted state matches what the real SDK spawn surfaces.
 */

import type { AgentEvent, SessionId } from "@km/agent-harness"
import { createFakeSession, type CreateFakeSessionOptions, type ScriptedFakeSession } from "./fake-session.ts"

export type CreateFakeSdkSessionOptions = CreateFakeSessionOptions & {
  /** Override the model label. Defaults to `claude-sonnet-4-6`. */
  model?: string
}

export function createFakeSdkSession(opts: CreateFakeSdkSessionOptions = {}): ScriptedFakeSession {
  const sessionId = (opts.sessionId ?? `sdk-${Date.now()}`) as SessionId
  return createFakeSession({ sessionId })
}

/**
 * SDK-flavoured session-init event. Use as the first event in any scripted
 * scenario meant to model the @anthropic-ai/claude-agent-sdk subprocess
 * surface.
 */
export function sdkInitEvent(opts: { sessionId?: SessionId; model?: string; cwd?: string; ts?: number } = {}): AgentEvent {
  const sessionId = (opts.sessionId ?? `sdk-${Date.now()}`) as SessionId
  return {
    kind: "session-init",
    sessionId,
    cwd: opts.cwd ?? "/tmp/fake",
    model: opts.model ?? "claude-sonnet-4-6",
    mode: "auto",
    tools: ["Bash", "Read", "Edit"],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "n/a",
    apiKeySource: "ANTHROPIC_API_KEY",
    ts: opts.ts ?? 1000,
  }
}
