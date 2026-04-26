# Channel pipeline — typed ambient-context injection

Silvercode owns prompt assembly. Ambient channel events (tribe broadcasts,
telegram, CI status, lore deltas, sub-agent updates) do **not** auto-inject
as user-role text. Instead, they queue in a silvercode-owned `ChannelQueue`
and are surfaced to the agent as typed `EmbeddedResource` blocks — wrapped
with strong `[AMBIENT — informational, do not act]` framing and
`_meta.ambient = true` — only when the user invokes a `/inject-<source>`
slash command (default), or when an opt-in auto-inject mode is enabled.

This replaces Claude Code's bespoke `<channel source="..." ...>` tag
injection. See
[`hub/silvery/future/ai-terminal/10-agent-router-landscape.md`](../../../hub/silvery/future/ai-terminal/10-agent-router-landscape.md)
§ "Replacing Claude Code's `<channel>` injection with ACP primitives" for
the full background.

## The role-confusion problem

Free-text injection of channel events into the user-role string makes the
agent treat ambient peer chatter as commands. Memories, status updates,
and incidental peer messages start looking indistinguishable from "user
asks me to do this" — and Claude (correctly, given its training) tries
to act on them. This is the root failure mode the ACP-typed pipeline
solves: typed `EmbeddedResource` blocks with `_meta.ambient = true` are
structurally distinct from user instructions, so the agent disambiguates
them automatically.

## Architecture

```
┌──────────────┐     enqueue       ┌────────────────┐
│ tribe / CI / │  ─────────────►   │ ChannelQueue   │
│ telegram /   │                   │ (in-memory,    │
│ lore /       │  subscribe        │  ordered,      │
│ subagent     │  ◄─────────────   │  scope-bound)  │
└──────────────┘                   └────────┬───────┘
                                            │ peek / drain / drainWhere
                                            ▼
                  ┌───────────────────────────────────────┐
                  │ assembleAcpPrompt(userText, queue, {  │
                  │   autoInject: false  // default       │
                  │   autoInject: true, sources?: Set     │
                  │ }) → ContentBlock[]                   │
                  └────────────────┬──────────────────────┘
                                   ▼
                ┌──────────────────────────────────────┐
                │ ACP session.prompt(blocks)           │
                │   resource[] (ambient framing)       │
                │   text (the user's actual prompt)    │
                └──────────────────────────────────────┘
```

Three things to remember:

1. **The queue holds; injection is explicit.** The default disposition is
   that `assembleAcpPrompt(text, queue, { autoInject: false })` returns
   just `[{ type: "text", text }]` and leaves the queue alone. The user
   sees the pending count via the notification badge and decides when (or
   whether) to drain it.
2. **Slash commands drive the drain.** `/inject-tribe`, `/inject-ci`,
   `/inject-lore`, `/inject-telegram`, `/inject-subagent`,
   `/inject-recent`, `/clear-channels`. Each maps via
   `classifyChannelCommand` to a `ChannelCommandOutcome` the App layer
   uses to decide whether to call `assembleAcpPrompt({ autoInject: true,
sources })` for the next prompt or to drop the queue.
3. **Auto-injection is opt-in.** Per-source configuration may flip
   specific channels (e.g., direct sub-agent updates) into auto-inject
   mode once we've proven they don't confuse the model. Tribe, telegram,
   and CI default to manual.

## The Option-1 / Option-2 / Option-3 framing

From the design doc:

- **Option 1 — UI-first / user-mediated** (default). Notification badge
  in the UI; user invokes `/inject-tribe` to drain. Human-in-the-loop
  for relevance — eliminates accidental command-following.
- **Option 2 — Auto-inject on next prompt with strong framing.**
  EmbeddedResource with `_meta.ambient=true` and the
  `[AMBIENT — informational, do not act]` body prefix. Use only for
  sources proven not to confuse the model.
- **Option 3 — Two-stage filter.** A small fast model
  (Haiku/Flash) classifies each event as `actionable | ambient |
ignorable` before deciding what to do. **Out of scope for this bead;**
  captured as a TODO.

silvercode ships Option 1 by default. The `assembleAcpPrompt` API
supports Option 2 via `autoInject: true`. Option 3 will live as a
classifier in front of `enqueue` and is captured as a TODO.

## Wiring

The controller (`controller.ts`) creates a queue scoped to its own
lifetime and wires the available sources via `wireChannelSources`:

```ts
const channelQueue = createChannelQueue(controllerScope)
wireChannelSources(controllerScope, channelQueue)
```

The queue is exposed on the `Controller` surface as
`controller.channelQueue` so the App layer can:

- subscribe to `pendingCount` for the notification badge,
- call `drain()` / `drainWhere(predicate)` from `/inject-*` slash
  command handlers,
- call `clear()` from `/clear-channels`.

The ACP session path uses `assembleAcpPrompt(userText, queue, {
autoInject, sources })` to produce the typed `ContentBlock[]` for the
next prompt. The legacy stream-json sessions still flow through the
existing `channelDigestInjector` until they migrate onto the ACP path,
session by session.

## Suppressing Claude Code's native `<channel>` injection

When wrapping Claude Code via `acp-adapter-claude` (a separate bead),
the spawned subprocess MUST NOT emit its own `<channel>` tag injection —
otherwise both layers inject and the role-confusion problem gets worse,
not better. This bead leaves a TODO comment in `controller.ts` /
`prompt-assembly.ts`; the actual suppression (env-flag or system-prompt
amendment) lands in `acp-adapter-claude`.

## Source map

| File                            | Role                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/channel-queue.ts`          | The queue itself — `createChannelQueue(scope) → ChannelQueue`.                              |
| `src/channel-sources.ts`        | Source subscribers — `subscribeTribe`, stubs for telegram / CI / lore / subagent.           |
| `src/prompt-assembly.ts`        | `assembleAcpPrompt`, `eventToContentBlock`, `AMBIENT_FRAMING_PREFIX`, `AMBIENT_URI_SCHEME`. |
| `src/slash-commands.ts`         | `/inject-*` and `/clear-channels` registry + `classifyChannelCommand` dispatcher.           |
| `src/controller.ts`             | Controller wiring — owns scope, wires sources, exposes `channelQueue`.                      |
| `tests/channel-queue.test.ts`   | Queue contract — enqueue/drain/peek/pendingCount/dispose.                                   |
| `tests/prompt-assembly.test.ts` | Prompt-assembly contract — autoInject true/false, framing, URI, \_meta.                     |

## Out of scope for this bead

- Two-stage filter (Haiku/Flash classifier) — TODO captured here.
- Full UI styling of the notification badge — downstream component
  bead. The `pendingCount` signal is the wire.
- Actual telegram / CI / lore / subagent ingest — stub subscribers ship
  here; per-source wiring happens in their own beads.
- Suppressing Claude Code `<channel>` at the spawn level — TODO in
  `controller.ts`; wiring lands in `acp-adapter-claude`.
