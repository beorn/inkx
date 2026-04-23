# Hook Router Design

**Status**: Implemented (lives in bearly). Tracking bead: `km-infra.hook-router` (P3).

Unified Claude Code hook dispatch. Implemented in **bearly** (`vendor/bearly/tools/lib/hooks/`) — the canonical home for Claude Code coordination infrastructure alongside tribe, recall, autostart, and friends. Invoked via `tribe hook ingest` / `tribe hook notify`.

This doc captures the *why* and the *shape*. API and source live in bearly.

## Problem

Claude Code integrations (recall, tribe, bead-prime, cmux, future: kanban-bridge, GitHub-event-forward, etc.) wire their own entries in `~/.claude/settings.json`. Consequences:

- **settings.json sprawl**: multiple integrations on the same hook event = multiple shell commands queued per event. Adding or removing one requires surgical JSON edits.
- **Implicit contracts**: each integration makes its own assumptions about stdin/env/args passed by Claude Code. Nothing enforces uniformity.
- **No shared middleware**: timeouts, debug logging, rate limiting, error handling reimplemented per integration (or omitted).
- **Untestable**: hook behavior only observable by running Claude Code with side effects.
- **Brittle onboarding**: adding a new integration means updating ~7 settings.json entries; forgetting one silently breaks that event.

## Architecture

Single router + normalized event vocabulary + pluggable listeners.

### One router, two modes (exposed via `tribe hook`)

```bash
tribe hook ingest --event <event> --source <source> [flags]   # synchronous, 5s listener timeout
tribe hook notify --event <event> --source <source> [flags]   # best-effort, 100ms timeout, never throws
```

Both exit 0 regardless of listener status — non-zero exit from a Claude Code hook can block the session. Listener failures are isolated (one broken listener does not kill siblings).

Existing `tribe hook session-start` / `session-end` / `prompt` / `pre-compact` named subcommands continue to work unchanged — they dispatch directly to recall handlers. The new `ingest`/`notify` pattern is additive, for listener-based integrations.

### Normalized event vocabulary

Source-agnostic (same vocab used by Claude, Codex, Gemini, OpenCode, km-self, or any future source):

| Event | Fires on |
|---|---|
| `session_start` | Session init |
| `session_end` | Session teardown |
| `user_prompt_submit` | User pressed enter on a prompt |
| `pre_tool_use` | About to run a tool |
| `post_tool_use` | Tool finished successfully |
| `post_tool_use_failure` | Tool returned an error |
| `stop` | Assistant finished responding |
| `subagent_stop` | A spawned sub-agent finished |
| `notification` | Generic notification (with subtype) |
| `permission_request` | Agent is blocked pending user approval |

### Enrichment flags

Same vocabulary as Cline Kanban's hook protocol — interop is a first-class goal:

```
--source            claude | codex | gemini | opencode | km | ...
--activity-text     short summary
--tool-name         tool being invoked
--final-message     assistant's last message
--hook-event-name   original Claude Code event name (e.g. PreToolUse)
--notification-type permission_prompt | idle | ...
--metadata-base64   arbitrary JSON payload
--project-path      project path for loading project-local listeners
--session-id        session identifier
```

### Listener registry

Listeners live in `~/.claude/hooks.d/` (user-level) and `<project>/.claude/hooks.d/` (project-local). Each listener is a TS module that default-exports either a `defineListener({...})` call (for typed DX) or a plain object with the shape `{ name, events?, sources?, timeoutMs?, handle(ctx) }`:

```ts
// ~/.claude/hooks.d/my-listener.ts
export default {
  name: "my-listener",
  events: ["session_start", "stop"],
  sources: ["claude"],
  async handle(ctx) {
    // ctx: { event, source, activityText?, toolName?, finalMessage?, metadata?, sessionId?, projectPath?, now, ... }
    console.error(`[my-listener] ${ctx.event} from ${ctx.source}`)
  },
}
```

Plain-object form needs no imports — works out of the box. Users who want type safety can `import { defineListener } from "bearly/hook-router"` once bearly exports it on npm.

The router:
1. Loads all listener modules each invocation (fork-per-event in v1)
2. Filters by `events` and `sources`
3. Invokes each matching listener with a timeout
4. Collects results; surfaces errors via exit-code 0 + stderr-debug

### Settings.json shape (reference)

Existing integrations today (no migration required):

```
"SessionStart": [ cmd: "bun vendor/bearly/tools/tribe-cli.ts hook session-start" ]
"SessionEnd":   [ cmd: "bun vendor/bearly/tools/tribe-cli.ts hook session-end" ]
"UserPromptSubmit": [ cmd: "bun vendor/bearly/tools/tribe-cli.ts hook prompt" ]
```

Future listener-based integrations (opt-in):

```
"Stop":        [ cmd: "bun vendor/bearly/tools/tribe-cli.ts hook ingest --event stop --source claude" ]
"PreToolUse":  [ cmd: "bun vendor/bearly/tools/tribe-cli.ts hook notify --event pre_tool_use --source claude --tool-name ..." ]
```

The `ingest`/`notify` path loads listeners from `~/.claude/hooks.d/`; adding a new integration is *one file*, no settings.json edit.

## Design decisions

### Home: bearly, not km

Bearly owns Claude Code tooling (tribe, recall, autostart, worktree, llm, refactor). Putting the hook router anywhere else creates duplicate hook-dispatch territory and a second CLI surface for the same job. Bearly is also (intended to be) reusable outside km, which the router naturally is.

### Language: TypeScript

Matches bearly and km codebases, typed handler signatures, shared utility imports. Listeners are `.ts` files. Bun loads them via dynamic import.

### Dispatch model: fork-per-event (v1)

Spawn a fresh process per hook event. Simple, no state management, crash-isolated. A long-lived daemon over Unix socket (v2) is deferred — build only when cross-event state (per-session counters, rate limits, batched telemetry) has a concrete consumer.

### Failure isolation

Each listener runs with its own timeout + error boundary. A broken listener logs to stderr and drops; siblings run unaffected. `BEARLY_HOOKS_DEBUG=1` (or `KM_HOOKS_DEBUG=1`) surfaces aggregate dispatch status.

### Additive, not migratory

The new `ingest`/`notify` subcommands coexist with existing `tribe hook session-start` / `session-end` / `prompt` / `pre-compact`. Existing settings.json entries are untouched and keep working. Migration to the listener model is per-integration, opt-in, not forced.

## Composability with Cline Kanban

The kanban-bridge listener is ~50 LOC: watch events, shell out to `kanban hooks notify`:

```ts
// ~/.claude/hooks.d/kanban-bridge.ts
export default {
  name: "kanban-bridge",
  events: ["session_start", "user_prompt_submit", "stop"],
  async handle(ctx) {
    const kanbanEvent = mapToKanban(ctx.event) // session_start→to_in_progress, stop→to_review
    await Bun.spawn(["kanban", "hooks", "notify", "--event", kanbanEvent, "--source", "km", "--activity-text", ctx.activityText ?? ""]).exited
  },
}
```

km appears as a first-class runtime on any Cline Kanban board without touching km's codebase. See [`hub/km/integrations/kanban-bridge.md`](../../hub/km/integrations/kanban-bridge.md) for the full strategy.

## Out of scope

- Listener manifest / package system (listeners are just files for now)
- Remote listeners (listeners run locally only)
- Event replay / backfill
- Codex/Gemini/OpenCode adapter implementations (they can emit via `tribe hook ingest --source codex` etc.; dedicated wrappers come when there's a real consumer)
- Daemon mode (v2)
- Automatic migration of existing `~/.claude/settings.json` entries (additive only; users opt in per integration)

## Open questions

- **Listener language**: TS only, or allow shell/Python via a thin adapter? Start TS-only; add shell adapter if integrations need it.
- **Precedence**: when both user and project listeners exist, do they augment or override? Default: both run; user listeners first.
- **Veto semantics**: can listeners cancel an event (e.g. prevent a tool call)? Not in v1 — listeners are observers only. Veto would require a different contract.

## References

- Source: `vendor/bearly/tools/lib/hooks/` (bearly)
- CLI wiring: `vendor/bearly/tools/tribe-cli.ts` — `hook ingest` + `hook notify` subcommands
- Kanban hook protocol (reference spec): [`~/Bear/Journal/ref/coding-agents/kanban-hook-protocol.md`](../../../../Bear/Journal/ref/coding-agents/kanban-hook-protocol.md)
- General hook patterns: [`~/Bear/Journal/ref/patterns/agent-orchestration-hooks.md`](../../../../Bear/Journal/ref/patterns/agent-orchestration-hooks.md)
- km integration strategy: [`hub/km/integrations/kanban-bridge.md`](../../hub/km/integrations/kanban-bridge.md)

## History

Original Phase 1 landed as `packages/km-hooks/` in km commit `10c95617d` (2026-04-23). During the post-ship /big audit, bearly was discovered to already own the hook-dispatch territory (`tools/lib/tribe/hook-dispatch.ts`, `tools/tribe-cli.ts hook <event>` subcommand, wired into `~/.claude/settings.json`). Original commit reverted; router re-landed in bearly at `vendor/bearly/tools/lib/hooks/`.
