# Silvercode Chat Session Model

Silvercode separates adapter/runtime facts from canonical chat-domain events and derived transcript projection.

The active quality target is tracked in `@km/silvercode/chat-domain-quality-plateau.md`. The earlier design record is `@km/silvercode/parity-claude/chat-turn-projection-refactor.md`; that bead established that Silvercode visible groupings are idle-delimited presentation intervals, not provider turns and not one prompt plus one response.

New transcript presentation work should use this pipeline:

```text
AgentEvent / NotificationStreamEntry -> ChatEvent -> apply(ChatEvent) -> ChatSession -> ChatProjection -> UI
```

Per the refactor workflow, migrate legacy vocabulary before implementing new presentation behavior. Rename docs, tests, stories, fixtures, and touched source first; then route behavior through `apps/silvercode/src/chat/types.ts`, ChatEvent normalization, ChatSession state, projection, channels, and render leaves/items.

## Layers

`AgentEvent` is the adapter/runtime boundary from `agent-harness`. It is provider-neutral, but it still carries legacy adapter vocabulary such as `turnId`. Treat those fields as adapter evidence and provenance, not canonical chat-domain identity.

`NotificationStreamEntry` is raw side-channel input. A notification only becomes part of the chat-domain projection after normalization decides it is a `NotificationObservation` rather than duplicate same-session activity or debug-only material.

`ChatEvent` is the canonical chronological fact accepted by chat-domain state. It has a Silvercode `id`, `type`, `channel`, `sessionId`, `payload`, and `rawRefs`. Provider ids belong in explicit provenance fields or `rawRefs`; they do not become generic chat ids.

`ChatSession` is the accumulated read model over `ChatEvent`s: messages, message parts, tools, plan, prompt queue, permissions, channels, replay/lifecycle state, and projection state.

`ChatProjection` is derived presentation state. It may contain `ChatInterval`s, render items, or a render tree, but those objects can be rebuilt from canonical session events and projection rules.

`UI` renders the projection. React components should not infer provider semantics, replay boundaries, notification ownership, or subagent identity directly from raw events.

## Current Compatibility Boundary

`MessageEntry` and `MessageOp` are current implementation names used by the legacy harness/session-store path. They are compatibility surfaces, not the target vocabulary for new transcript presentation. New work should migrate toward `ChatEvent`, `ChatMessage`, `ChatMessagePart`, `ChatTool`, `ChatSession`, `ChatProjection`, and typed render leaves/items.

The old path is still user-visible in places. Fixes may temporarily touch it, but new behavior should either happen on the ChatEvent path or be isolated behind a named adapter that emits ChatEvents.

## Identity

Use `id` for durable domain objects owned by the model: `ChatEventId`, `ChatMessageId`, `ChatMessagePartId`, `ChatToolId`, `ChatPlanTaskId`, `ChatPromptId`, and `ChatPermissionId`.

Use `key` or a more specific key name for derived projection identity. A `ChatInterval` should use `key`/`intervalKey` because it is rebuilt from idle boundaries and stream order. A key can change when projection rules change.

Keep provider ids source-specific:

- Claude message/jsonl UUIDs are message/event provenance.
- Codex `turn_id`, when present, is provider provenance for Codex task lifecycle records.
- ACP has session updates and messages, but no wire-level canonical turn object.
- OpenCode/ACP-style integrations should be treated as session/message/update streams unless the adapter proves a stronger id.

New canonical model fields should not use `turnId`. Prefer `rawRefs` for provider provenance. Use an explicit field such as `providerTurnId`, `providerMessageId`, or `providerEventId` only in adapter-specific payloads that genuinely need queryable provider provenance. Legacy `AgentEvent.turnId` may feed normalization, status repair, and compatibility reducers, but it must not leak as canonical chat-domain identity.

## Silvercode Chat Intervals

`ChatInterval` is the Silvercode-domain name for an idle-delimited activity group. Legacy `Chat.Turn.*`, `ChatTurn`, and `turnKey` vocabulary may remain in compatibility code, but new data-model work should use interval vocabulary.

A `ChatInterval` can contain multiple prompts, assistant messages, tool/activity spans, plan updates, permission requests, notifications, and summary/stat blocks. Blocks inside an interval are peers ordered by stream time; the UI may place nearby activity after narration for readability, but that does not imply prompt ownership.

Use `key`/`intervalKey` only as projection identity. It is minted by the chat-interval projection when an idle-to-active transition opens a new interval. It may be seeded from the first canonical `ChatEventId` in the interval or a stable projection ordinal, but it must not be Codex `turn_id`, Claude message ids, ACP message ids, or legacy harness `AgentEvent.turnId`.

An interval starts when both user and agent are idle and a new user or agent activity event appears. It remains open while either side is active: queued/submitted prompt activity, provider-owned queued work, thinking, streaming text, tool execution, permission waits, plan updates tied to current work, or subagent activity. It ends only when both sides are idle again.

Example interleaving inside one `ChatInterval`:

```text
prompt 1
assistant response chunk 1
prompt 2
assistant response chunk 2
tool activity
assistant response chunk 3
prompt 3
new assistant activity
```

Do not model this as `prompt -> response`. The prompt, assistant chunks, tools, and later prompts are ordered activity inside an interval.

## Prompt Lifecycle

`ComposerDraft` is ephemeral text in the input component.

`ChatPrompt` is pre-transcript user input that Silvercode still owns. It can be edited or cancelled while local. Submitting to the backend may change its lifecycle state, but does not by itself make it a transcript message.

`ChatPromptQueue` is the ordered visible set of pre-transcript prompts. Prefer this name over generic `ChatQueue` when the state is specifically queued user prompts.

`AgentPromptQueue` is optional provider-owned state. Only use it when a provider exposes real list/edit/cancel semantics for accepted-but-not-yet-processed prompts. Do not infer a semantic provider queue from stdin buffering, ACP waiter promises, or stream timing.

Prompt lifecycle states:

1. `draft`: user is typing in the composer.
2. `queued`: Silvercode owns a `ChatPrompt`; editable/cancellable.
3. `submitting`: Silvercode is handing the prompt to the agent.
4. `agent-queued` (optional): backend accepted the prompt into a real provider queue and exposed an id/capabilities.
5. `committed`: prompt is now a user `ChatMessage`; remove the `ChatPrompt`.
6. `cancelled`: prompt is removed without transcript history.
7. `failed`: send failed before commitment; either return to `queued` with an error or remove with visible failure.

Once a prompt becomes a user `ChatMessage`, editing is transcript editing, not prompt queue editing.

## Blocks and Channels

`ChatPane` is the session pane. `ChatBlock` is UI vocabulary for a rendered transcript block; it is not the canonical data model. In data, use `ChatNode`; nodes with children are `ChatElement`s, and renderable leaves are `ChatLeaf`s.

Channels are filters and routing metadata on leaves, not grouping nodes in the tree. Notifications use the `notification` channel and `notification` leaf type. Debug records use the `debug` channel. Older background-context wording should be treated as notification-channel work unless a doc is describing old provider bytes verbatim.

## Plans

`AgentPlan` is session-scoped:

- Claude `TodoWrite` snapshots normalize to `source: "claude-todowrite"`.
- ACP `sessionUpdate: "plan"` normalizes to `source: "acp-plan"`.
- Codex `plan_update` / `plan_delta` normalizes to `source: "codex-plan"` when plan tasks are present.

The old `state.todos` surface is a legacy projection from `state.plan.entries`. New UI should read `state.plan`.

The active plan renders above the composer as an in-session drawer. The side panel may show a count, but it is not the primary plan surface.
