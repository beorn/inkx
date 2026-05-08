# Silvercode Agent Host Domain Model

Silvercode models an agent conversation as a durable Thread with one or more
provider SessionBindings over time. Runtime work happens in Turns. Provider
events normalize into Silvercode-owned domain facts, and projection turns those
facts into a ChatTree and ChatTrack view for the UI.

```text
Provider bytes / protocol notifications / side signals
  -> parser
  -> AgentSignal | ProtocolNotification
  -> normalizer
  -> ThreadEvent
  -> apply(ThreadEvent)
  -> ThreadState

ThreadState
  -> projectChatTree(...)
  -> ChatTree + ChatTrack[]
  -> Chat.Pane
```

The durable model and UI projection are deliberately separate:

- Thread is the user-facing workstream.
- SessionBinding is the provider attachment for a live or historical session.
- Turn is the accepted runtime lifecycle around submitted work.
- Message is transcript prose.
- Block is typed message/tool content.
- Thought is model private-work content rendered by Silvercode.
- Track is a projection/filter over the thread timeline.
- Job is user-controllable work that may attach to foreground or background.
- SubagentRun is child-agent work with parent provenance.

## Domain Inventory

| Object              | Scope                 | Owns                                                                                                         |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AgentBackend`      | Runtime               | Selectable/runnable provider implementation and capabilities.                                                |
| `AgentConnection`   | Runtime               | One live transport/process/server connection.                                                                |
| `Thread`            | Product               | Durable conversation/workstream identity, title, local UI state, messages, plans, jobs, and binding history. |
| `SessionBinding`    | Runtime + persistence | Provider session/process/server identity attached to a Thread.                                               |
| `Turn`              | Runtime               | Submitted work lifecycle, cancel/drain/result, late-event policy, and queue ownership.                       |
| `TurnInput`         | Runtime               | User text, attachments, mentions, mode, provenance, and enqueue policy.                                      |
| `TurnEvent`         | Runtime stream        | Normalized streaming/progress event emitted during a Turn.                                                   |
| `TurnResult`        | Runtime result        | Terminal outcome: completed, cancelled, failed, or lost.                                                     |
| `Message`           | Transcript            | User or assistant prose plus ordered Block ids.                                                              |
| `Block`             | Content               | Text, Thought, image, audio, resource, diff, terminal, or tool-reference content.                            |
| `Thought`           | Content               | Silvercode's domain/UI name for model private-work content.                                                  |
| `ToolCall`          | Activity              | Tool lifecycle, permission waits, output blocks, and provider ids as provenance.                             |
| `PermissionRequest` | Control               | User decision required by a ToolCall, Turn, or SubagentRun.                                                  |
| `Plan`              | Work state            | Ordered PlanSteps from provider or local planning sources.                                                   |
| `PlanStep`          | Work state            | One provider-normalized step with stable lifecycle.                                                          |
| `Job`               | Control               | User-controllable work that can be foreground, background, cancelled, or abandoned.                          |
| `SubagentRun`       | Child work            | Child agent execution, parent Thread/Turn/ToolCall ids, transcript link, and delivery policy.                |
| `Mention`           | Prompt context        | Typed context insertion handle resolved into prompt blocks/resources.                                        |
| `TrafficLog`        | Debug evidence        | Raw provider frames plus normalized events for replay and audit.                                             |
| `ChatTree`          | Projection            | Ordered render tree derived from ThreadState.                                                                |
| `ChatTrack`         | Projection            | Named visibility/filter projection over ChatTree leaves.                                                     |

## Naming Prefixes

Use `Agent*` for cross-backend runtime surfaces: `AgentBackend`,
`AgentConnection`, `AgentSignal`, `AgentCapabilities`, and
`AgentProvenance`.

Use protocol-specific prefixes only for exact wire/source shapes:
`AcpContentBlock`, `AcpToolCall`, `ClaudeEvent`, `CodexEvent`, or
`OpenCodeEvent`. Do not force non-ACP integrations into `Acp*` names.

Use unprefixed domain nouns for Silvercode-owned concepts when the package or
module already establishes the domain: `Thread`, `Turn`, `Message`, `Block`,
`Thought`, `Track`, `PlanStep`, `ToolCall`, `PermissionRequest`, `Job`,
`SubagentRun`, and `TrafficLog`.

Use `Chat*` for render projection types: `ChatTree`, `ChatTrack`,
`ChatLeaf`, `ChatBlock`, and component props that are intentionally tied to
the chat UI. Dotted `Chat.X` names are UI components.

Use `Backend` for selectable/runnable sources of agent work, `Connection` for
one live provider attachment, `Parser` for bytes-to-source-shape conversion,
and `Normalizer` for source-shape-to-domain conversion. Avoid `Adapter` as a
domain noun unless the code is a mechanical compatibility shim.

External identity remains provenance. Provider ids live in `rawRefs` or
source-specific metadata; they do not become Silvercode domain ids just
because a provider emitted the original fact.

## UI Namespace

The target pane composition is:

```tsx
<Chat.Pane>
  <Chat.Header />
  <Chat.Session />
  <Chat.Composer />
</Chat.Pane>
```

`Chat.Pane` is one visible chat frame. `Chat.Header` renders pane chrome and
session controls. `Chat.Session` renders the ChatTree projection. `Chat.Composer`
renders prompt input, mentions, and turn controls.

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

## Identity

Use `id` for durable Silvercode-owned objects: `ThreadId`, `SessionBindingId`,
`TurnId`, `MessageId`, `BlockId`, `ToolCallId`, `PermissionRequestId`,
`PlanStepId`, `JobId`, `SubagentRunId`, `MentionId`, and `TrafficLogEntryId`.

Use `key` for derived projection identity. A `ChatLeaf` or grouping key can
change when projection rules change. It must not be a provider message id,
provider turn id, ACP request id, or parser event id.

Use explicit provider fields only when they are queryable provenance:
`providerSessionId`, `providerTurnId`, `providerMessageId`,
`providerToolCallId`, or `providerRequestId`.

## Thread And Binding

A Thread is not a provider session. It is the product workstream the user sees.
It can outlive provider processes, switch backends, resume after a crash, and
hold more than one SessionBinding over time.

```text
Thread
  bindingHistory: SessionBinding[]
  activeBindingId: SessionBindingId | null
  turns: Turn[]
  messages: Message[]
  plan: Plan | null
  jobs: Job[]
  subagents: SubagentRun[]
```

A SessionBinding records the provider attachment:

```text
SessionBinding
  id: SessionBindingId
  threadId: ThreadId
  backendId: AgentBackendId
  connectionId: AgentConnectionId | null
  providerSessionId: string | null
  state: unbound | starting | bound | draining | ended | failed | lost
```

## Turns

A Turn is one accepted unit of runtime work. It starts from a TurnInput, emits
TurnEvents while running, and resolves to one TurnResult. It is the owner of
queue position, cancellation, drain windows, and late-event disposition.

Foreground/background is an attachment relationship, not a different kind of
Turn. A running Turn may be attached to the foreground, moved into a background
Job, or abandoned after an interrupt when the provider cannot prove exact
cancellation.

## Messages And Blocks

A Message is transcript history. It owns role, lifecycle, source event ids, and
ordered Block ids. Once a local prompt commits as a user Message, editing is
transcript editing rather than turn queue editing.

A Block is a typed content unit inside a Message, prompt, or ToolCall output.
Core variants are:

- `TextBlock`
- `ThoughtBlock`
- `ImageBlock`
- `AudioBlock`
- `ResourceBlock`
- `ResourceLinkBlock`
- `DiffBlock`
- `TerminalBlock`
- `ToolRefBlock`

Tool output belongs to ToolCall. Projection decides where visible tool output
appears in ChatTree.

## Tracks

A Track is a named projection/filter over the thread timeline. It replaces the
old live-domain channel vocabulary. Tracks do not own events and are not chat
rooms. A single domain fact can project into different tracks depending on
debug visibility, disclosure, or background state.

Canonical tracks are:

- `conversation`
- `thought`
- `tool`
- `plan`
- `permission`
- `notification`
- `debug`
- `background`

Provider wire fields may still use words such as `channel`; those names stay
at the parser/protocol boundary and normalize to Track before entering the
Silvercode domain model.

## Plans

A Plan is Thread-scoped and owns ordered PlanSteps. Provider-specific plan
sources normalize into this object:

- Claude TodoWrite snapshots normalize to `source: "claude-todowrite"`.
- ACP plan updates normalize to `source: "acp-plan"`.
- Codex plan updates normalize to `source: "codex-plan"` when steps are present.

The UI renders the active Plan as first-class work state, not as generic tool
output. PlanStep status is a closed state machine.

## Mentions

A Mention is typed prompt context inserted by the composer. It is not plain text
spliced into the user role. Each Mention has durable identity, display text,
resolver provenance, and resolved content blocks/resources.

Examples:

- `file://...` for a file or selected range.
- `symbol://...` for a code symbol.
- `thread://...` for another Thread or transcript slice.
- `bead://...` for a bead reference.
- `image://...` for an attached image.

Prompt assembly resolves mentions into typed provider payloads when possible
and falls back to strongly framed text only when a backend lacks typed context.

## Jobs And Subagents

A Job is the user's control handle for work. It may wrap a foreground Turn,
background Turn, tool-driven shell command, or provider work that has detached
from the main foreground flow.

A SubagentRun is child-agent work. It has parent Thread, parent Turn, optional
parent ToolCall, optional child SessionBinding, delivery policy, and lifecycle.
Subagent completion is normalized into child-work state before projection; it is
not stuffed into parent chat as raw provider text.

## Traffic Log

The TrafficLog is first-class debug evidence. It records raw provider frames,
normalized AgentSignals/ProtocolNotifications, accepted ThreadEvents, state
transition decisions, projection inputs, and replay checkpoints.

Traffic replay must be able to scrub by Thread, SessionBinding, Turn, Track,
ToolCall, PermissionRequest, PlanStep, Job, and SubagentRun.

The current CLI/debug contract lives in
[`traffic-log-replay.md`](./traffic-log-replay.md).

## Migration Notes

Current docs use only the target vocabulary. Historical pre-L5 names are tracked
in the L5 migration beads and should not be copied into new code or evergreen
documentation. Provider raw/config names can retain provider terminology at the
parser/config boundary, but normalize before entering ThreadState.
