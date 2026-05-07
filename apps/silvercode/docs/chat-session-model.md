# Silvercode Chat Session Model

Silvercode separates adapter/runtime facts from canonical chat-domain events and derived transcript projection.

Transcript presentation uses this pipeline:

```text
AgentEvent / NotificationStreamEntry -> ChatEvent -> apply(ChatEvent) -> ChatSession -> ChatTree -> UI
```

## Layers

An agent event (`AgentEvent`) is the adapter/runtime layer from `agent-harness`. It is provider-neutral, but provider-shaped fields are evidence and provenance, not canonical chat-domain identity.

A raw notification entry (`NotificationStreamEntry`) is side-channel input. A notification becomes part of the chat-domain projection only after normalization decides it is a chat notification rather than duplicate same-session activity or debug-only material.

A chat event (`ChatEvent`) is the canonical chronological fact accepted by chat-domain state. It has a Silvercode `id`, `type`, `channel`, `sessionId`, `payload`, and `rawRefs`. Provider ids belong in explicit provenance fields or `rawRefs`; they do not become generic chat ids.

A chat session (`ChatSession`) is the accumulated read model over chat events: messages, message parts, tools, plan, prompt queue, permissions, channels, session lifecycle state, and projection state.

A chat tree (`ChatTree`) is derived presentation state: the current render tree built from a chat session. Projection is the process that creates the tree; it is not a separate canonical data noun.

`UI` renders the projection. React components should not infer provider semantics, session lifecycle placement, notification ownership, or subagent identity directly from raw events.

## Identity

Use `id` for durable domain objects owned by the model: `ChatEventId`, `ChatMessageId`, `ChatMessagePartId`, `ChatToolId`, `ChatPlanTaskId`, `ChatPromptId`, and `ChatPermissionId`.

Use `key` or a more specific key name for derived projection identity. A `ChatSpan` should use `key`/`spanKey` because it is rebuilt from idle boundaries and stream order. A key can change when projection rules change.

Keep provider ids source-specific:

- Claude message/jsonl UUIDs are message/event provenance.
- Codex `turn_id`, when present, is provider provenance for Codex task lifecycle records.
- ACP has session updates and messages, but no wire-level canonical turn object.
- OpenCode/ACP-style integrations should be treated as session/message/update streams unless the adapter proves a stronger id.

Canonical model fields do not use generic `turnId`. Prefer `rawRefs` for provider provenance. Use an explicit field such as `providerTurnId`, `providerMessageId`, or `providerEventId` only in adapter-specific payloads that genuinely need queryable provider provenance.

## Subagent Activity

A subagent activity is the lifecycle read model for Task/Agent-style local agents spawned under a chat session. It is derived from canonical `ChatEvent` tool lifecycle facts, with raw `NotificationStreamEntry` records admitted only as side-channel observations that can enrich or settle a known activity.

One activity renders as one drawer row. Identity comes from the concrete tool/activity event, not from labels such as `Sleep 20s #2`; labels are presentation and merge hints only. Chat notifications may merge with a tool-derived activity when the tool id and label agree, but a reused or incorrect `toolUseId` must not collapse distinct meaningful labels into one activity.

The drawer consumes current-session/current-span subagent activity projection state. It does not infer agent cardinality from assistant narration, notification grouping, or component-local maps. If assistant text claims more subagents than the lifecycle event stream contains, preserve the observed activity count and surface a diagnostic rather than inventing missing activities.

## Silvercode Chat Spans

A chat span (`ChatSpan`) is an idle-delimited activity group.

A chat span can contain multiple prompts, assistant messages, tool/activity runs, plan updates, permission requests, notifications, and summary/stat blocks. Blocks inside a span are peers ordered by stream time; the UI may place nearby activity after narration for readability, but that does not imply prompt ownership.

Use `key`/`spanKey` only as projection identity. It is minted by the chat-span projection when an idle-to-active transition opens a new span. It may be seeded from the first canonical `ChatEventId` in the span or a stable projection ordinal, but it must not be Codex `turn_id`, Claude message ids, ACP message ids, or adapter event ids.

A chat span starts when both user and agent are idle and a new user or agent activity event appears. It remains open while either side is active: queued/submitted prompt activity, provider-owned queued work, thinking, streaming text, tool execution, permission waits, plan updates tied to current work, or subagent activity. It ends only when both sides are idle again.

Example interleaving inside one chat span:

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

Do not model this as `prompt -> response`. The prompt, assistant chunks, tools, and later prompts are ordered activity inside a span.

## Prompt Lifecycle

A prompt draft (`ChatPromptDraft`) is ephemeral prompt text in the input component. It is not chat-domain state until the user submits or explicitly queues it.

A prompt (`ChatPrompt`) is pre-transcript user input that Silvercode still owns. It can be edited or cancelled while local. Submitting to the backend may change its lifecycle state, but does not by itself make it a transcript message.

A prompt queue (`ChatPromptQueue`) is the ordered visible set of pre-transcript prompts. Use this term instead of a generic queue name when the state is specifically queued user prompts.

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

The session pane (`ChatPane`) is the visible chat surface. A chat block (`ChatBlock`) is UI vocabulary for a rendered transcript block; it is not the canonical data model. In data, use `ChatNode`; nodes with children are `ChatElement`s, and renderable leaves are `ChatLeaf`s.

Channels are filters and routing metadata on leaves, not grouping nodes in the tree. Notifications use the `notification` channel and `notification` leaf type. Debug records use the `debug` channel.

## Plans

An agent plan (`AgentPlan`) is session-scoped:

- Claude `TodoWrite` snapshots normalize to `source: "claude-todowrite"`.
- ACP `sessionUpdate: "plan"` normalizes to `source: "acp-plan"`.
- Codex `plan_update` / `plan_delta` normalizes to `source: "codex-plan"` when plan tasks are present.

The active plan renders above the composer as an in-session drawer. The side panel may show a count, but it is not the primary plan surface.
