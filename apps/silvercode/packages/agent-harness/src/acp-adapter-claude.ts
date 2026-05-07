/**
 * `spawnClaudeAcpSession(scope, opts)` — convenience wrapper that spawns the
 * official `claude` binary with stream-json I/O and exposes the result as a
 * silvercode-canonical `AcpSession` (signals over ACP-shaped types) instead
 * of the legacy turn-oriented `AgentSession`.
 *
 * # Why this is THE canonical Claude path for subscription-auth users
 *
 * Anthropic's `@agentclientprotocol/claude-agent-acp` package (v0.31.0,
 * Zed-published) explicitly **blocks** Claude.ai subscriptions at session
 * init — `dist/acp-agent.js:1360` throws "This integration does not support
 * using claude.ai subscriptions." when `account.subscriptionType` is set.
 * Anthropic's policy reserves Pro/Max subscription quota for Claude Code's
 * own interactive surfaces; programmatic Agent SDK use requires API billing.
 *
 * Spawning the `claude` binary directly inherits Claude Code's full
 * subscription auth gate:
 *
 *   1. `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max OAuth — set up by `claude login`)
 *   2. `ANTHROPIC_API_KEY` (per-token API billing — set explicitly)
 *   3. `~/.claude/auth.json` fallback (whatever `claude login` persisted)
 *
 * The underlying `spawnClaude` in `./spawn.ts` passes the parent process
 * environment through verbatim (`{ ...process.env, ...opts.env }`), so all
 * three auth paths Just Work without silvercode having to know about them.
 *
 * Therefore: for any silvercode user on a Claude Pro/Max plan, this adapter
 * is the **only** maintained ACP-shaped path. `claude-agent-acp` is for
 * API-keyed users only; the abandoned binary-wrap forks
 * (`claude-code-acp@0.1.1`, `claude-code-acp-agent@0.1.0`) are unmaintained.
 *
 * # Composition — the adapter is identity-by-composition
 *
 * The work here is small: `spawnClaude` already returns a legacy
 * `AgentSession` that emits the rich Claude-flavored `AgentEvent` union, and
 * `createAcpSession(scope, agentSession)` already drains that into the
 * silvercode-canonical signals/projections/trees over ACP-shaped types.
 *
 * `spawnClaudeAcpSession` is just `createAcpSession(scope, spawnClaude(opts))`
 * — a one-liner that ties the lifetime of the spawned subprocess to the
 * scope so disposing the scope kills the child group. Existing tests for
 * `spawnClaude` (subprocess + stream-json correctness) and `createAcpSession`
 * (event → signal mapping) carry forward; this file's job is to verify the
 * composition end-to-end and offer a single import for the common case.
 *
 * # Reference
 *
 * - Bead: `km-silvercode.acp-adapter-claude`
 * - Tracking: `km-silvercode.acp`
 * - Architecture: `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
 *   § "Recommended path — internal-first, extract later"
 */

import { Scope, disposable } from "@silvery/scope"

import type { AgentCapabilities, SessionId } from "./acp-types.ts"
import { createAcpSession, type AcpSession } from "./acp-session.ts"
import type { AgentSession } from "./events.ts"
import { spawnClaude, type SpawnClaudeOptions } from "./spawn.ts"

/**
 * Options for {@link spawnClaudeAcpSession}. Extends {@link SpawnClaudeOptions}
 * with two ACP-session-level fields (`sessionId`, `capabilities`) that get
 * forwarded into the underlying `createAcpSession(...)` call.
 *
 * Subscription-auth env vars are inherited from `process.env` automatically
 * (see {@link spawnClaude}). Override per-spawn by setting `opts.env`:
 *
 * ```ts
 * spawnClaudeAcpSession(scope, {
 *   env: { CLAUDE_CODE_OAUTH_TOKEN: someOAuthToken },
 * })
 * ```
 */
export type SpawnClaudeAcpOpts = SpawnClaudeOptions & {
  /** Override the initial session id surfaced on the ACP session signal. */
  sessionId?: SessionId
  /**
   * Pre-seed agent capabilities. Useful when callers know the subprocess will
   * advertise something specific; otherwise the ACP session populates a
   * minimal `{}` stub on the first `session-init` event.
   */
  capabilities?: AgentCapabilities
}

/**
 * Spawn a `claude` subprocess and expose it as an `AcpSession`.
 *
 * Lifetime: the spawned child is closed when `scope` disposes (signals
 * SIGTERM to the entire process group, see {@link spawnClaude} for details).
 *
 * Returns the {@link AcpSession} directly — the underlying `AgentSession`
 * is intentionally not exposed. Callers that need the legacy event surface
 * (rare; only Claude-Code-specific concerns like compaction events,
 * skill-load notifications) should call `spawnClaude` directly and pair it
 * with their own `createAcpSession(...)` call.
 */
export function spawnClaudeAcpSession(scope: Scope, opts: SpawnClaudeAcpOpts = {}): AcpSession {
  const { sessionId, capabilities, ...spawnOpts } = opts
  const agentSession: AgentSession = spawnClaude(spawnOpts)

  // Tie the subprocess lifetime to the scope. `disposable({}, fn)` runs `fn`
  // on scope dispose, before `createAcpSession`'s own cleanup runs — order
  // matches the layering: tear down the subprocess first, then drop the
  // ACP-side subscription / pending-prompt state.
  scope.use(
    disposable({}, () => {
      try {
        void agentSession.close()
      } catch {
        // Already closed — fine. `close()` is idempotent on the legacy
        // surface but the JSDoc doesn't promise that, so we trap defensively.
      }
    }),
  )

  return createAcpSession(scope, agentSession, {
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
  })
}
