# Adapter — pi (badlogic)

silvercode consumes pi via the community **`pi-acp`** package (npm:
[`pi-acp`](https://www.npmjs.com/package/pi-acp), repo:
[svkozak/pi-acp](https://github.com/svkozak/pi-acp)). `pi-acp` spawns
`pi --mode rpc` and bridges its requests/events to ACP JSON-RPC over stdio.

## Wire spawn

Registry id: **`pi-acp`** (see `acp-client.ts#ACP_REGISTRY`).

```
npx -y pi-acp
```

silvercode reaches it via:

```ts
const session = await connectAcpRegistry(scope, "pi-acp", { cwd: process.cwd() })
```

No silvercode-side adapter code is required. The Registry table maps the id
to the spawn command; `connectAcp` handles the rest (initialize, newSession,
sessionUpdate plumbing, scope-bound lifetime).

## Authentication

`pi-acp` is auth-agnostic at its own layer — it inherits whatever the user
has configured for the underlying `pi` binary. Concretely:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, etc. — pi reads
  these from the environment exactly as it does in standalone mode.
- pi's own `~/.pi/agent/settings.json` for model selection, custom prompts,
  skills.
- pi-acp does **not** add a subscription gate of its own; whichever
  provider+model pi is configured against is what silvercode will see.

There is no `authenticate(...)` flow worth wiring for pi-acp specifically —
ACP `authMethods` from the agent will typically be empty.

## Prerequisites

`pi-acp`'s README requires `pi` to be installed and on PATH:

```bash
npm install -g @mariozechner/pi-coding-agent
```

Node 22+ is required by both `pi` and `pi-acp`. The user is responsible for
installing pi separately — `pi-acp` does not bundle it.

## Capabilities

`pi-acp` (per its README) supports:

- Streamed `agent_message_chunk` for assistant output.
- `tool_call` / `tool_call_update` mapping with **structured diffs** for
  edit operations (snapshots the file pre-edit, emits `oldText`/`newText`
  on completion).
- Tool-call **locations** for follow-along clients (resolved against
  session cwd).
- Session persistence via a `~/.pi/pi-acp/session-map.json` mapping file →
  pi's own session files in `~/.pi/agent/sessions/`. Compatible with
  ACP `session/load`.
- Slash commands (file-based + a small built-in set: `/compact`,
  `/autocompact`, `/export`, `/session`, `/name`).
- Skills surfaced as `/skill:<name>` if enabled in pi settings.
- Optional `embeddedContext` capability via
  `PI_ACP_ENABLE_EMBEDDED_CONTEXT=true`.

## Caveats

- **Single-maintainer, MVP-style**: the README explicitly says "expect some
  minor breaking changes." Last published v0.0.26 on 2026-04-18 (~8 days
  before this doc). Track upstream activity and pin the npm version when
  silvercode begins relying on specific behaviour. As of writing, `npx -y
pi-acp` always pulls the latest — that's intentional for now (matches
  the README recommendation).
- **Zed-centric development**: per the upstream README, "Development is
  centered around Zed editor support, other clients may have varying
  levels of compatibility." silvercode is one of those other clients;
  bug-for-bug parity with Zed isn't guaranteed.
- **Upstream pi-mono will not ship in-tree ACP**: badlogic explicitly
  declined ([pi-mono#836](https://github.com/badlogic/pi-mono/pull/836))
  with the recommendation that ACP support be "built externally on top of
  pi's rpc mode" — which is exactly what `pi-acp` does.

## Alternative: `@victor-software-house/pi-acp`

A fork at `@victor-software-house/pi-acp` embeds pi via the SDK
(in-process) rather than spawning a child. It exposes a richer feature
mapping (agent_thought_chunk, multi-session, configOptions for
model/thinking-level). Not currently in the silvercode registry; revisit
if the spawn-based path proves too lossy for our UI surface.

## Why no stream-json adapter

The original plan considered building a stateless mapper for
`pi --mode rpc`'s output → ACP `SessionUpdate`. Once `pi-acp@0.0.26`
landed in the Zed Registry, that work became redundant — the ecosystem
already maintains the bridge, and silvercode's job collapses to "spawn
the documented command." This file documents the choice; the
stream-json adapter is deferred indefinitely.

## Tests

The Registry entry is asserted in
`tests/registry-adapters.test.ts` (test id `pi-acp`).
