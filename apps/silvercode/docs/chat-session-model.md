# Silvercode Chat Session Model

Silvercode separates agent/runtime facts from canonical chat-domain state, shell control state, and derived render projection.

The chat pipeline is:

```text
AgentEvent / ChannelNotification / ProtocolNotification
  -> normalize
  -> ChatEvent
  -> apply(ChatEvent)
  -> ChatSession

ChatSession -> ChatShell
ChatSession -> projectChatTree(...)
ChatSession + ChatShell + ChatTree -> Chat.Pane
```

## Layers

An agent backend (`AgentBackend`) is a selectable, runnable source of agent work. A backend opens an agent connection (`AgentConnection`) for one live session. Backend-specific parsers and normalizers may exist, but `Adapter` is not a chat-domain noun.

An agent event (`AgentEvent`) is the cross-backend runtime event after backend-specific parsing. It carries evidence from Claude, Codex, ACP, OpenCode, or another integration, but source ids remain provenance rather than chat-domain identity.

A protocol notification (`ProtocolNotification`) is a transport/protocol notification such as an ACP or JSON-RPC notification. Use protocol-specific names such as `AcpSessionUpdate` only for exact wire shapes.

A channel notification (`ChannelNotification`) is side-channel input from sources such as subagent lifecycle, CI, tribe, filewatch, or recall. It is not a transcript row. After normalization admits it into chat-domain state, it becomes a chat notification (`ChatNotification`).

A chat event (`ChatEvent`) is the canonical chronological fact accepted by chat-domain state. It has a Silvercode `id`, `type`, `channel`, `sessionId`, optional `jobId`, `payload`, and `rawRefs`.

A chat session (`ChatSession`) is the accumulated read model over chat events: messages, blocks, tools, jobs, job activity, plan, prompt queue, permissions, notifications, channels, lifecycle state, and projection state.

A chat shell (`ChatShell`) is the continuous interactive control surface for a chat session. It owns the composer, prompt queue controls, foreground job slot, background job table, active selection, and job-control commands. The shell persists while jobs start and end.

A chat tree (`ChatTree`) is derived presentation state built from a chat session. Projection is the process that creates the tree; the tree is the render data.

UI components render the session, shell, and tree. They do not infer agent semantics, lifecycle placement, notification ownership, or subagent identity directly from raw events.

## Naming Prefixes

Use `Agent*` for cross-backend runtime surfaces: `AgentBackend`, `AgentConnection`, `AgentEvent`, `AgentCapabilities`, and `AgentProvenance`.

Use protocol-specific prefixes only for exact protocol shapes: `AcpContentBlock`, `AcpToolCall`, `AcpPlanEntry`, `ClaudeEvent`, `CodexEvent`, or `OpenCodeEvent`. Do not force non-ACP integrations into `Acp*` names.

Use `Chat*` for Silvercode-owned chat-domain state, control, and projection: `ChatEvent`, `ChatSession`, `ChatShell`, `ChatJob`, `ChatPrompt`, `ChatBlock`, `ChatTool`, `ChatPlan`, `ChatPlanStep`, `ChatSpan`, `ChatNotification`, and `ChatTree`.

Use `Backend` for selectable/runnable sources of agent work, `Connection` for one live session, `Parser` for bytes-to-source-shape conversion, and `Normalizer` for source-shape-to-domain conversion. Avoid `Adapter` as a domain noun.

When external identity must survive inside the chat domain, keep it as provenance in `rawRefs` or an explicitly source-specific field. Do not give a domain object an `Agent*`, `Acp*`, `Claude*`, or `Codex*` name just because that source emitted the original fact.

## UI Namespace

Flat `ChatX` names are domain/model types. Dotted `Chat.X` names are UI components.

The target pane composition is:

```tsx
<Chat.Pane>
  <Chat.Header />
  <Chat.Session />
  <Chat.Composer />
</Chat.Pane>
```

`Chat.Pane` is one visible chat frame. `Chat.Header` renders pane chrome and session controls. `Chat.Session` renders the `ChatSession` content and activity projection. `Chat.Composer` renders prompt input and prompt-queue controls.

Component files export direct names and props:

```text
components/chat/
  Pane.tsx             -> Pane, PaneProps
  Header.tsx           -> Header, HeaderProps
  Session.tsx          -> Session, SessionProps
  Composer.tsx         -> Composer, ComposerProps
```

The namespace export is a direct map:

```ts
export const Chat = { Pane, Header, Session, Composer } as const
```

Do not use the UI namespace to disguise mismatched component names.

## Identity

Use `id` for durable domain objects owned by the model: `ChatEventId`, `ChatMessageId`, `ChatBlockId`, `ChatToolId`, `ChatJobId`, `ChatPlanStepId`, `ChatPromptId`, `ChatPermissionId`, and `ChatNotificationId`.

Use `key` or a more specific key name for derived projection identity. A `ChatSpan` uses `key`/`spanKey` because it is rebuilt from idle boundaries and stream order. A key can change when projection rules change.

Keep agent ids source-specific:

- Claude message/jsonl UUIDs are message/event provenance.
- Codex `turn_id`, when present, is Codex lifecycle provenance.
- ACP has session updates and messages, but no wire-level canonical chat span.
- OpenCode/ACP-style integrations are session/message/update streams unless the source proves a stronger id.

Canonical model fields do not use generic `turnId`. Prefer `rawRefs` for agent provenance. Use explicit fields such as `agentTurnId`, `agentMessageId`, or `agentEventId` only in source-specific payloads that genuinely need queryable provenance.

## Blocks

A chat block (`ChatBlock`) is a typed content unit inside a prompt, message, or tool output. It is the chat-domain counterpart to protocol content units such as ACP `ContentBlock`, but it is owned by Silvercode and may include Silvercode-specific variants.

Core block variants are:

- `ChatTextBlock`
- `ChatReasoningBlock`
- `ChatImageBlock`
- `ChatAudioBlock`
- `ChatResourceBlock`
- `ChatResourceLinkBlock`
- `ChatDiffBlock`
- `ChatTerminalBlock`
- `ChatToolRefBlock`

A chat message (`ChatMessage`) is the transcript container. It owns role, lifecycle, source event ids, and ordered `ChatBlock` ids. A message is not a render row and not a content block.

Tool output belongs to `ChatTool`. If a tool produces user-visible content, the tool owns output blocks and projection decides where those blocks render.

## Job Control

A chat job (`ChatJob`) is user-controllable agent work that can occupy the shell foreground, move to the background, complete, fail, cancel, or have late output abandoned after interruption.

Foreground/background is an attachment relationship owned by `ChatShell`, not a separate kind of work and not duplicated as durable job state:

```text
ChatShell
  foregroundJobId: ChatJobId | null
  backgroundJobIds: ChatJobId[]

ChatJob
  execution: queued | running | waiting | completed | failed | cancelling | cancelled
  output: owned | abandoned
```

The shell is continuous. Jobs are time-bounded. A job starts when a prompt submission, restored live run, or agent-originated event creates a controllable unit of work. A job ends when it completes, fails, or is cancelled. A job becomes `abandoned` when Silvercode stops treating later output as owned chat transcript because the foreground was interrupted and the agent could not confirm precise cancellation.

`bg` detaches the current foreground job without stopping it. Background jobs can be surfaced for inspection, but they do not reattach to the shell foreground. `Esc` interrupts the foreground job; it does not background it.

A job contains activity. Activity is nested work inside a job: reasoning, tool execution, shell command, permission wait, or subagent work. A background job is not a subagent unless the job itself contains subagent work.

## Activity

A chat activity (`ChatActivity`) is a time-bounded unit of work inside a chat job or chat span. Activities can have child activities when nested work needs hierarchy. Spans do not nest; hierarchy inside a span belongs to activities.

Use `Run` only for a specific execution subtype that owns durable execution state, such as `ChatSubagentRun` or `ChatShellCommandRun`. Do not introduce a generic `ChatRun` when `ChatJob`, `ChatActivity`, or `ChatTool` already owns the lifecycle.

## Subagent Activity

Subagent work is activity for Task/Agent-style local agents spawned under a chat session. It is derived from canonical `ChatEvent` tool lifecycle facts, with channel notifications admitted only as side-channel observations that can enrich or settle known work.

One subagent activity renders as one drawer row. Identity comes from concrete tool/activity events; labels are presentation and merge hints only. Chat notifications may merge with tool-derived activity when the tool id and label agree, but reused or incorrect tool ids must not collapse distinct meaningful labels into one activity.

The drawer consumes current-session/current-span subagent activity projection state. It does not infer agent cardinality from assistant narration, notification grouping, or component-local maps. Assistant prose remains transcript prose; if Claude says "all N agents completed", that sentence renders as normal assistant text, while the drawer continues to show only the structured Task/Agent lifecycle rows Claude actually emitted.

## Chat Spans

A chat span (`ChatSpan`) is a foreground idle-delimited activity group.

A chat span can contain multiple prompts, assistant messages, blocks, tool/activity runs, plan updates, permission requests, notifications, and summaries. Content inside a span is ordered by stream time; nearby rendering does not imply prompt ownership.

Use `key`/`spanKey` only as projection identity. It is minted by the chat-span projection when an idle-to-active transition opens a new span. It may be seeded from the first canonical `ChatEventId` in the span or a stable projection ordinal, but it must not be Codex `turn_id`, Claude message ids, ACP message ids, or adapter event ids.

A chat span starts when the foreground shell is idle and a new foreground user or agent activity event appears. It remains open while foreground work is active: queued/submitted prompt activity, agent-owned queued work, the foreground job, thinking, streaming text, tool execution, permission waits, plan updates tied to current foreground work, or subagent activity. It ends when the foreground shell is idle again.

Background jobs do not keep the current foreground span open. Their later output projects through job lifecycle/activity leaves or a background surface until the job completes or the user surfaces it for inspection.

## Prompt Lifecycle

A prompt draft (`ChatPromptDraft`) is ephemeral prompt text in the input component. It is not chat-domain state until the user submits or explicitly queues it.

A prompt (`ChatPrompt`) is pre-transcript user input that Silvercode still owns. It can be edited or cancelled while local. Submitting to the backend may change its lifecycle state, but does not by itself make it a transcript message.

A prompt queue (`ChatPromptQueue`) is the ordered visible set of pre-transcript prompts. Use this term instead of a generic queue name when the state is specifically queued user prompts.

Prompt lifecycle states:

1. `draft`: user is typing in the composer.
2. `queued`: Silvercode owns a `ChatPrompt`; editable/cancellable.
3. `submitting`: Silvercode is handing the prompt to the agent.
4. `agent-queued` (optional): backend accepted the prompt into a real agent queue and exposed an id/capabilities.
5. `committed`: prompt is now a user `ChatMessage`; remove the `ChatPrompt`.
6. `cancelled`: prompt is removed without transcript history.
7. `failed`: send failed before commitment; either return to `queued` with an error or remove with visible failure.

Once a prompt becomes a user `ChatMessage`, editing is transcript editing, not prompt queue editing.

## Channels

Channels are routing metadata on chat events and projected leaves. They are not grouping nodes in the tree.

Common channels are:

- `transcript`
- `notification`
- `debug`
- `lifecycle`
- `control`

Notifications use the `notification` channel and normalize to `ChatNotification`. Debug records use the `debug` channel. Lifecycle facts use explicit lifecycle event types and project only when they help the user understand ordering or control state.

## Plans

A chat plan (`ChatPlan`) is session-scoped. It owns ordered chat plan steps (`ChatPlanStep`).

Agent-specific plan sources normalize into this domain object:

- Claude `TodoWrite` snapshots normalize to `source: "claude-todowrite"`.
- ACP plan updates normalize to `source: "acp-plan"`.
- Codex `plan_update` / `plan_delta` normalize to `source: "codex-plan"` when plan steps are present.

The active plan renders above the composer as an in-session drawer. The side panel may show a count, but it is not the primary plan surface.
