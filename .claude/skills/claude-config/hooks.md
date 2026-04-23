# Authoring Hook Listeners

Pluggable Claude Code hook listeners dispatched by bearly's router (`vendor/bearly/tools/lib/hooks/`). A listener is a single TypeScript file that reacts to normalized lifecycle events — `session_start`, `pre_tool_use`, `stop`, and friends — without touching `settings.json` or any other integration's code. The router loads every file in `~/.claude/hooks.d/` (user-global) and `<project>/.claude/hooks.d/` (project-local), filters by event/source, runs each handler with a timeout + error boundary, and reports per-listener status.

This doc is the how-to. For the *why* (problem, architecture, design decisions), see [`docs/design/hook-router.md`](../../../docs/design/hook-router.md).

## When to use

- Add a new Claude Code integration (telemetry, dashboard push, Slack notify, kanban bridge, log scraper) without editing a shared config file.
- Observe lifecycle events for debugging (log every tool invocation, record session durations, count prompts).
- Forward events to an external system (Cline Kanban, a metrics server, a message bus).
- Experiment locally — drop a file in `~/.claude/hooks.d/`, hit save, done.

Not for: vetoing tool calls (listeners are observers, not middleware), cross-listener state (each dispatch is a fresh process in v1), or work that must complete before the session continues on slow paths (use `ingest`, not `notify`, and keep under 5s).

## Quickstart

```ts
// ~/.claude/hooks.d/my-listener.ts
export default {
  name: "my-listener",
  events: ["session_start", "stop"],
  async handle(ctx) {
    console.error(`[my-listener] ${ctx.event} from ${ctx.source}`)
  },
}
```

Five lines, no imports required. Drop the file, fire an event, done.

## Event vocabulary

| Event | Fires on |
|---|---|
| `session_start` | Session initialization |
| `session_end` | Session teardown |
| `user_prompt_submit` | User pressed enter on a prompt |
| `pre_tool_use` | About to run a tool |
| `post_tool_use` | Tool finished successfully |
| `post_tool_use_failure` | Tool returned an error |
| `stop` | Assistant finished responding |
| `subagent_stop` | A spawned sub-agent finished |
| `notification` | Generic notification (subtype via `notificationType`) |
| `permission_request` | Agent is blocked pending user approval |

Vocabulary is source-agnostic: the same names are used by `claude`, `codex`, `gemini`, `opencode`, `km`, or any future source. Filter with `sources: ["claude"]` if your handler assumes a specific agent.

## Listener interface

```ts
{
  name: string                          // required — shown in dispatch logs
  events?: readonly HookEvent[]         // default: all events
  sources?: readonly HookSource[]       // default: all sources
  timeoutMs?: number                    // default: 5000 (ingest) / 100 (notify)
  handle(ctx: ListenerContext): Promise<void> | void  // required
}
```

Export via `export default { ... }` or `export const listener = { ... }`. Canonical types live at [`vendor/bearly/tools/lib/hooks/types.ts`](../../../vendor/bearly/tools/lib/hooks/types.ts).

## Context fields

Everything on `ListenerContext`:

| Field | Type | Notes |
|---|---|---|
| `event` | `HookEvent` | Normalized event name |
| `source` | `HookSource` | `claude`, `codex`, `gemini`, `opencode`, `km`, or any string |
| `now` | `Date` | Dispatch timestamp |
| `sessionId` | `string?` | Agent session id if provided |
| `projectPath` | `string?` | Project root for project-local listeners |
| `activityText` | `string?` | Short summary of current activity |
| `toolName` | `string?` | Tool being invoked (on `pre_tool_use` / `post_tool_use`) |
| `finalMessage` | `string?` | Assistant's last message (on `stop`) |
| `hookEventName` | `string?` | Original Claude Code event name (e.g. `PreToolUse`) |
| `notificationType` | `string?` | Notification subtype (`permission_prompt`, `idle`, …) |
| `metadata` | `unknown` | Arbitrary JSON payload from the caller |

All enrichment fields are optional — callers only populate what's meaningful for the event.

## Invocation modes

The router exposes two flavours via `tribe hook`:

| Mode | Default timeout | Error behaviour | Use for |
|---|---|---|---|
| `ingest` | 5000 ms | Errors surface in `RouterResult`; exit 0 | `session_start`, `session_end`, `user_prompt_submit`, `stop` — post-event work |
| `notify` | 100 ms | Never throws; failures swallowed into result | `pre_tool_use`, `notification` — must not block the agent |

Both always exit 0 — Claude Code hooks that exit non-zero can block the session. A listener that needs longer can set its own `timeoutMs`, but it must still finish before the caller's outer timeout.

## Testing a listener

Fire synthetic events from the CLI. The router loads the same files Claude Code would, so listener behaviour is observable without starting a real session:

```bash
# Fire a session_start to all listeners matching claude as source
bun vendor/bearly/tools/tribe-cli.ts hook ingest \
  --event session_start --source claude \
  --project-path "$PWD"

# Fire a pre_tool_use with enrichment
bun vendor/bearly/tools/tribe-cli.ts hook notify \
  --event pre_tool_use --source claude \
  --tool-name Bash \
  --activity-text "running tests"

# Show per-listener status (stderr)
BEARLY_HOOKS_DEBUG=1 bun vendor/bearly/tools/tribe-cli.ts hook ingest \
  --event stop --source claude
```

`BEARLY_HOOKS_DEBUG=1` (or `KM_HOOKS_DEBUG=1`) surfaces loader + dispatch diagnostics on stderr — malformed listener files, shape mismatches, timeouts, errors. Leave it unset in production; flip it on while iterating.

## Enabling a listener

- **User-global**: drop the file in `~/.claude/hooks.d/`. Runs for every project.
- **Project-local**: drop the file in `<project>/.claude/hooks.d/`. Only loaded when the dispatcher is called with `--project-path <that project>`.

Files matching `*.ts`, `*.mts`, `*.js`, `*.mjs` are loaded; dotfiles are skipped. A file that fails to load or exports the wrong shape is skipped with a stderr warning (visible under `BEARLY_HOOKS_DEBUG=1`) — one broken file does not break the rest of the tree.

User listeners load before project listeners; both sets run for a given event.

## Wiring into settings.json

Listeners only fire when `tribe hook ingest` / `notify` is invoked. That happens automatically for events already wired (`SessionStart`, `SessionEnd`, `UserPromptSubmit` via `tribe hook session-start` / `session-end` / `prompt`). For other Claude Code events, add an entry:

```jsonc
// ~/.claude/settings.json or <project>/.claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/vendor/bearly/tools/tribe-cli.ts hook ingest --event stop --source claude --project-path $CLAUDE_PROJECT_DIR"
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/vendor/bearly/tools/tribe-cli.ts hook notify --event pre_tool_use --source claude"
        }]
      }
    ]
  }
}
```

Without a settings.json entry calling the router, listeners do not fire for that event — the router is the choke point. One entry per Claude Code event is enough; listeners fan out from there.

See [`SKILL.md`](SKILL.md) for the full hook registration recipe (matchers, `$CLAUDE_PROJECT_DIR`, drift-checker requirements).

## Anti-patterns

- **Do not throw from `handle`**. The router catches it and marks the listener `error`, but it pollutes dispatch logs and costs your timeout budget. Return early or `return` a resolved promise on unexpected input.
- **Do not block**. The 100ms notify budget is tight; any network/IO work belongs on `ingest` or in a spawned detached process.
- **Do not assume optional integrations are installed**. If your listener shells out to `kanban`, `gh`, `gemini`, or any other tool, guard with a presence check and no-op if missing — your listener runs on every machine that has the file.
- **Do not log PII or secrets**. Listeners can see prompts, tool arguments, and final messages. Treat everything on `ctx` as potentially sensitive; log summaries, not payloads.
- **Do not import from `vendor/bearly/`** inside a user-global listener. Keep the plain-object form so your listener travels across machines/checkouts without path coupling. If you need types, `import type { Listener } from "@bearly/..."` once that package is published.
- **Do not rely on cross-event state** inside a single listener. Each dispatch is a fresh process in v1; persist to a file or socket if you need continuity.

## Reference

- Design + rationale: [`docs/design/hook-router.md`](../../../docs/design/hook-router.md)
- Canonical types: [`vendor/bearly/tools/lib/hooks/types.ts`](../../../vendor/bearly/tools/lib/hooks/types.ts)
- Router source: [`vendor/bearly/tools/lib/hooks/router.ts`](../../../vendor/bearly/tools/lib/hooks/router.ts)
- Loader source: [`vendor/bearly/tools/lib/hooks/loader.ts`](../../../vendor/bearly/tools/lib/hooks/loader.ts)
- Example template: [`vendor/bearly/tools/lib/hooks/listeners/example.ts`](../../../vendor/bearly/tools/lib/hooks/listeners/example.ts) — copy to `~/.claude/hooks.d/example.ts` to activate
- General Claude Code config (hooks registration, drift): [`SKILL.md`](SKILL.md)
