/**
 * Codex-flavoured fake session — same `AgentSession` interface as
 * `createFakeSession`, but with metadata that mirrors what `spawnCodex`
 * normally produces.
 *
 * Why this exists
 * ---------------
 * `spawnClaude`, `spawnCodex` and `spawnSdk` all return the same
 * `AgentSession` shape, so most controller tests can reuse a single fake.
 * The differences worth modelling at the test layer are:
 *
 *   - Session-id prefix (`codex-…` instead of an opaque hex string).
 *   - Default model label (`gpt-5-codex` rather than `claude-sonnet-4-6`).
 *   - Tools list shape — Codex advertises a different built-in set.
 *
 * Tests that exercise multi-backend logic (registry adapter selection,
 * agent-capabilities probe, prompt assembly per provider) should use this
 * helper so the asserted state matches what the real codex spawn surfaces.
 */

import type { AgentEvent, SessionId } from "@km/agent-harness"
import { createFakeSession, type CreateFakeSessionOptions, type ScriptedFakeSession } from "./fake-session.ts"

export type CreateFakeCodexSessionOptions = CreateFakeSessionOptions & {
  /** Override the model label. Defaults to `gpt-5-codex`. */
  model?: string
}

export function createFakeCodexSession(opts: CreateFakeCodexSessionOptions = {}): ScriptedFakeSession {
  const sessionId = (opts.sessionId ?? `codex-${Date.now()}`) as SessionId
  return createFakeSession({ sessionId })
}

/**
 * Codex-flavoured session-init event with the OpenAI-shaped defaults.
 * Use as the first event in any scripted scenario meant to model a Codex
 * subprocess.
 */
export function codexInitEvent(opts: { sessionId?: SessionId; model?: string; cwd?: string; ts?: number } = {}): AgentEvent {
  const sessionId = (opts.sessionId ?? `codex-${Date.now()}`) as SessionId
  return {
    kind: "session-init",
    sessionId,
    cwd: opts.cwd ?? "/tmp/fake",
    model: opts.model ?? "gpt-5-codex",
    mode: "auto",
    tools: ["shell", "apply_patch"],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "n/a",
    apiKeySource: "OPENAI_API_KEY",
    ts: opts.ts ?? 1000,
  }
}
