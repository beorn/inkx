# Hook Router Design

**Status**: Proposal. Tracking bead: [`km-infra.hook-router`](../../.beads/) (P3).

Unified hook dispatch for km integrations. Inspired by Cline Kanban's hook protocol. Replaces the current "each integration wires its own Claude Code hooks" model.

## Problem

km's Claude Code integrations (recall, tribe, bead-prime, cmux, future: kanban-bridge, GitHub-event-forward, etc.) each wire their own entries in `~/.claude/settings.json`. Consequences:

- **settings.json sprawl**: multiple integrations on the same hook event = multiple shell commands queued per event. Adding or removing one requires surgical JSON edits.
- **Implicit contracts**: each integration makes its own assumptions about stdin/env/args passed by Claude Code. Nothing enforces uniformity.
- **No shared middleware**: timeouts, debug logging, rate limiting, error handling reimplemented per integration (or omitted).
- **Untestable**: hook behavior only observable by running Claude Code with side effects.
- **Brittle onboarding**: adding a new integration means updating ~7 settings.json entries; forgetting one silently breaks that event.

Current surface (illustrative, from `~/.claude/settings.json`):

```
"SessionStart": [ {...recall...}, {...tribe...}, {...bead prime...} ]
"UserPromptSubmit": [ {...bearly injection...}, {...tribe...} ]
"PreToolUse": [ {...cmux claude-hook...} ]
"Stop": [ {...cmux claude-hook...} ]
...
```

Every new integration multiplies the entries.

## Proposed architecture

Single router + normalized event vocabulary + pluggable listeners.

### One router command, two modes

```bash
km hooks ingest --event <event> --source <source> [flags]   # synchronous, errors propagate
km hooks notify --event <event> --source <source> [flags]   # best-effort, never throws, returns fast
```

`notify` forks+detaches so PreToolUse etc. return within ~10ms. `ingest` waits for listeners and surfaces failures.

### Normalized event vocabulary

Mirrors Claude Code's hooks but designed to be source-agnostic (same vocab used by future Codex/Gemini/km-self sources).

| Event | Fires on |
|---|---|
| `session_start` | Claude Code session init |
| `session_end` | Claude Code session teardown |
| `user_prompt_submit` | User pressed enter on a prompt |
| `pre_tool_use` | About to run a tool |
| `post_tool_use` | Tool finished successfully |
| `post_tool_use_failure` | Tool returned an error |
| `stop` | Assistant finished responding |
| `subagent_stop` | A spawned sub-agent finished |
| `notification` | Generic notification (with subtype) |
| `permission_request` | Agent is blocked pending user approval |

### Enrichment flags

Same vocabulary as kanban's (interop + future bridge):

```
--source            claude | codex | gemini | opencode | km | ...
--activity-text     short summary
--tool-name         tool being invoked
--final-message     assistant's last message
--hook-event-name   original Claude Code event name (e.g. PreToolUse)
--notification-type permission_prompt | idle | ...
--metadata-base64   arbitrary JSON payload
```

### Listener registry

Listeners live in `~/.km/hooks.d/` (user-level) and `./km.hooks.d/` (project-level). Each listener is a TS module:

```ts
// ~/.km/hooks.d/tribe.ts
import { defineListener } from '@km/hooks';

export default defineListener({
  name: 'tribe',
  events: ['session_start', 'session_end', 'user_prompt_submit'],
  sources: ['claude'],  // optional filter
  async handle(event, ctx) {
    // ctx provides: activityText, toolName, finalMessage, metadata, sessionId, etc.
    await ctx.tribe.broadcast(...);
  },
});
```

The router:
1. Loads all listener modules at startup (cached across invocations in fork-per-event mode; warm in daemon mode)
2. On each incoming event, filters listeners by `events` and `sources`
3. Invokes each matching listener with a timeout (default 5s for `ingest`, 100ms total budget for `notify`)
4. Collects results; surfaces errors in `ingest`, drops them in `notify`

### Settings.json after migration

```
"SessionStart":     [ cmd: "km hooks ingest --event session_start --source claude" ]
"SessionEnd":       [ cmd: "km hooks ingest --event session_end --source claude" ]
"UserPromptSubmit": [ cmd: "km hooks ingest --event user_prompt_submit --source claude" ]
"PreToolUse":       [ cmd: "km hooks notify --event pre_tool_use --source claude" ]
"PostToolUse":      [ cmd: "km hooks notify --event post_tool_use --source claude" ]
...
```

Exactly one entry per Claude Code hook. Adding the 12th integration is a listener file, not a settings.json edit.

## Migration plan

Existing integrations migrate one at a time, behind a feature flag (`KM_HOOKS_ROUTER=1`).

1. **Ship the router + both commands**. `km hooks ingest|notify` exist, no-ops if no listeners match. Backward compatible: existing direct-hook entries still work.
2. **Migrate `bead prime`** → `~/.km/hooks.d/bead.ts`. Test in isolation. Once validated, remove direct entries from settings.json.
3. **Migrate `recall`** → `~/.km/hooks.d/recall.ts`.
4. **Migrate `tribe`** → `~/.km/hooks.d/tribe.ts` (tribe has its own daemon; listener just forwards events to it).
5. **Migrate `cmux claude-hook`** → `~/.km/hooks.d/cmux.ts`.
6. **Add new listeners as planned**: `kanban-bridge.ts`, `bead-sync.ts`, etc.

Each step is independently shippable and reversible.

## Design decisions (defaults)

### Listener language: TypeScript

Pro: matches km codebase, typed handler signatures, shared utility imports.
Con: startup cost (per-fork module load).

Mitigation: bundle listeners into a single esbuild bundle on first run; cache in `~/.km/hooks.d/.cache/` with content-hash.

### Dispatch model: fork-per-event (v1) → daemon (v2)

v1: spawn a fresh Node process per hook event. Simple, no state management, handles crashes cleanly.

v2 (future): long-lived daemon over Unix socket. Enables cross-event state (per-session counters, rate limits across events, batched telemetry). Only build when the need is concrete.

### Failure isolation

Each listener runs with its own timeout and error boundary. A broken listener logs and drops; it does NOT fail siblings. The router surfaces aggregate status via `KM_HOOKS_DEBUG=1`.

### Observability

Every invocation logs to `~/.km/hooks.log` (rotated). `KM_HOOKS_DEBUG=1` pipes to stderr. Structure:

```
[2026-04-22T18:30:15Z] event=user_prompt_submit source=claude session=abc123
  listener=bead result=ok duration=12ms
  listener=tribe result=ok duration=45ms
  listener=recall result=error duration=5000ms error="timeout"
```

## Composability with kanban

The kanban-bridge listener is ~50 LOC: watch bead state changes in its `handle`, shell out to `kanban hooks notify`:

```ts
// ~/.km/hooks.d/kanban-bridge.ts
export default defineListener({
  name: 'kanban-bridge',
  events: ['session_start', 'user_prompt_submit', 'stop'],
  async handle(event, ctx) {
    const kanbanEvent = mapToKanban(event);  // session_start→to_in_progress, stop→to_review
    await exec(`kanban hooks notify --event ${kanbanEvent} --source km --activity-text "${ctx.activityText}"`);
  },
});
```

The router IS the substrate for kanban integration — see [`hub/km/integrations/kanban-bridge.md`](../../hub/km/integrations/kanban-bridge.md).

## Out of scope for v1

- Listener manifest / package system (listeners are just files for now)
- Remote listeners (listeners run locally only)
- Event replay / backfill
- Multi-source support beyond Claude (Codex/Gemini/OpenCode adapters — add when there's a real second consumer)
- Daemon mode (v2)

## Open questions

- Listener language — TS only, or allow shell/Python via a thin adapter? Start TS-only; add shell adapter if integrations need it.
- Project-level vs user-level precedence — when both exist, does project override or augment user? Default: both run; user listeners first.
- Can listeners cancel an event? (e.g. prevent a tool call.) Not in v1 — listeners are observers only. Veto semantics would require a different contract.

## References

- Kanban hook protocol: [`~/Bear/Journal/ref/coding-agents/kanban-hook-protocol.md`](../../../../Bear/Journal/ref/coding-agents/kanban-hook-protocol.md)
- General hook patterns: [`~/Bear/Journal/ref/patterns/agent-orchestration-hooks.md`](../../../../Bear/Journal/ref/patterns/agent-orchestration-hooks.md)
- km integration strategy: [`hub/km/integrations/kanban-bridge.md`](../../hub/km/integrations/kanban-bridge.md)
- Existing hook surface: `~/.claude/settings.json` + `.claude/hooks/`
