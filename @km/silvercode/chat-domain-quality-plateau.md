---
aliases:
  - km-silvercode.chat-domain-quality-plateau
  - km-silvercode-chat-domain-quality-plateau
created_at: 2026-05-07T05:32:11.697Z
---

# Raise chat model/event/UI code to quality plateau #epic #P1

The chat code is below the quality plateau because the domain model, event flow, UI components, and terminology around transcript/activity/agents/subagents/notifications are not yet one coherent system.

Observed symptoms from the recent agent-drawer/transcript work:

- Subagents are represented simultaneously as Task/Agent tool calls, notification events, drawer rows, and transcript activity; fixes require knowing which projection is currently feeding the UI.
- Completed subagents disappeared from the drawer because the source meant "unresolved tool calls", while the UI needed "subagents in the current turn".
- Same-session subagent completion notifications duplicated the transcript tool row.
- Agent tool prompts could appear as assistant narration even though they are tool input.
- The `session.resumed` marker could appear after live prompt/output when resume bookkeeping did not identify the last loaded message in the current in-memory list.
- Tool-result timestamps/durations are not carried into the transcript model, so per-agent elapsed time cannot be shown honestly.
- Naming overlaps: agent/session/subagent/Task/Agent tool/notification/activity/work detail/drawer agent.

Current rough assessment (2026-05-07): roughly 85-88% of the way to the chat-domain quality plateau. This is L4.6-ish: the vocabulary-first cutover is in code, the state model is much cleaner, the latest prompt/session/subagent regressions have focused tests, and the worst production renderer-owned projection rules are now isolated behind chat-domain helpers. The production transcript path still has a compatibility projection instead of fully rendering from `ChatTree`.

- Prompt/send lifecycle: 7.5/10. The controller now has an outbound turn gate for the gap between local user-message dispatch and agent `turn-start`, with regression tests for the "prompt leaks into history / thinking never ends" failure mode.
- Agent turn lifecycle and stuck-thinking handling: 7/10. ACP has a centralized turn-start/turn-end path and watchdog/self-heal coverage, but equivalent behavior still needs to stay explicit across Codex/session-load/streaming adapters.
- Transcript projection and session lifecycle placement: 7.5/10. `session.resumed` placement, notification interleaving, grouping, and padding are now in `chat/session-update-projection.ts` with pure tests, but the output is still a compatibility transcript list rather than the final `ChatTree`.
- Subagent/activity model: 8/10. The drawer now derives from projected subagent activity plus chat notifications, duplicate Task/Agent labels with distinct tool ids no longer collapse, and assistant narration is left as transcript prose instead of being parsed into drawer state. Transcript, drawer, lifecycle markers, and summaries are still not all produced from one `ChatTree`.
- UI rendering components: 7.5/10. Visual regressions are covered better than before, and `SessionUpdateList` no longer owns the main projection/filter rules, but it still renders the compatibility projection directly.
- Terminology/cohesion: 8/10. The vocabulary-first cutover removed the most misleading names from implementation code: content units are `ChatBlock`s, plan items are `ChatPlanStep`s, pre-normalization stream items are `ChannelNotification`s, and the chat UI namespace is `Chat.Pane/Header/Session/Composer`. Compatibility vocabulary still exists at older boundaries: `SessionState`, `MessageEntry`, `MessageOp`, `ChatLeaf`/`ChatNode`, activity runs, message/span summaries, and legacy render item names.

Remaining L5 gaps:

- `SessionUpdateList` still owns rendering and renderer-specific title/tool presentation; the projection logic is extracted but not yet the canonical `ChatTree`.
- Notification filtering moved out of `ChatPane`, but it is still a compatibility helper over legacy transcript entries and channel notifications, not normalized `ChatNotification` events in `ChatSession`.
- Session lifecycle placement is extracted and tested, but still targets the compatibility transcript projection rather than `ChatLifecycleEvent` leaves in `ChatTree`.
- Prompt queue state still lives as controller-local queue machinery rather than a `ChatPromptQueue` owned by `ChatShell` / `ChatSession`.
- Ctrl-B backgrounding and Esc interruption are controller-owned runtime maps; they need canonical chat-domain events/state for `ChatJob` foreground/background/interrupted projection.
- Terminology is still mixed at the compatibility boundary: `MessageEntry`, `MessageOp`, `ChatLeaf`, `ChatNode`, activities, summaries, and spans need clearer ownership.
- We need real JSONL replay fixtures in tests, not just synthetic event-shape tests.
- An agent/model can still emit one Agent/Task lifecycle event while assistant prose claims four subagents. Silvercode preserves the prose as transcript text and keeps drawer state tied to structured lifecycle events; L5 should avoid inventing missing subagent sessions unless an agent exposes real repair/list semantics.

Target shape: put the original chat-domain model back at the center and make rendering consume it:

```text
AgentEvent / ChannelNotification / ProtocolNotification -> ChatEvent -> ChatSession
ChatSession -> ChatShell
ChatSession -> ChatTree
ChatShell + ChatTree -> UI
```

Expanded pipeline:

```text
AgentEvent / ChannelNotification / ProtocolNotification -> normalize -> ChatEvent -> apply -> ChatSession
ChatSession -> ChatShell
ChatSession -> projectChatTree(...) -> ChatTree
ChatShell + ChatTree -> UI
```

Use `ChatTree` for the projected render data. `projectChatTree(...)` is the projection operation; do not introduce `ChatProjection` as a new durable domain noun unless the data shape intentionally changes.

The plateau shape is where the drawer, transcript, notifications, lifecycle markers, and summaries all project from the same chat session state. The subagent drawer and compatibility transcript projection are now on that path in part; the rest of production chat still needs the L5 migration.

The plateau is not another round of per-component compensation. The plateau is where the next screenshot-class bug has one obvious owner: event normalization, chat-domain state/projection, or rendering.

Acceptance direction:

- Define canonical chat-domain terms at the start of the refactor: event, message, block, tool, shell, job, session, chat notification, activity, subagent activity, subagent session, chat span, lifecycle event, prompt draft, prompt, prompt queue, and chat tree.
- Ensure the pipeline has one clear shape: `AgentEvent` / `ChannelNotification` / `ProtocolNotification` -> `ChatEvent` -> `ChatSession`, then `ChatShell` + `ChatTree` -> UI.
- Make the agents drawer read subagent activity for the current span/session, not notification-block leftovers.
- Make prompt queue, job control, and interruption state read from the chat-domain model rather than controller-only maps or synthetic user messages.
- Preserve completed current-turn subagents without surfacing every historical subagent from the session.
- Carry enough lifecycle metadata to show real subagent/tool durations, or explicitly record why an agent cannot supply them.
- Keep chat notifications distinct from transcript-owned same-session activity.
- Rename types/helpers so terms match the domain; avoid ambiguous names like work detail when the object is specifically subagent activity or background shell activity.
- Add regression coverage for the recent bugs before refactoring each area.

Refactor path to L5:

This epic is the canonical chat-domain dashboard. Vocabulary changes happen first so every later phase migrates against one stable language.

0. `@km/silvercode/chat-domain-quality-plateau/vocabulary-first`: done; target vocabulary and replacement map are locked into code and docs before the remaining migration phases.
1. `@km/silvercode/parity-claude/l5-fixture-inventory`: freeze real JSONL/replay fixtures and fail loudly for unknown event shapes.
2. `@km/silvercode/parity-claude/l5-canonical-event-contract`: make every transcript-affecting fact a `ChatEvent` with an explicit channel and owner.
3. `@km/silvercode/parity-claude/l5-reactive-chat-session-store`: make `ChatSession.tree` live projected state, not a debug comparison artifact.
4. `@km/silvercode/parity-claude/l5-project-transcript-rules`: centralize grouping, summaries, widths, disclosure, lifecycle placement, and channel filtering in `projectChatTree(...)`.
5. `@km/silvercode/parity-claude/l5-control-event-state-routing`: route permission, queue, plan, title, status, usage, hook, file snapshot, and recap records into owner state or Debug/error leaves.
6. `@km/silvercode/parity-claude/l5-chatblock-cutover`: make `Chat.Pane` render from projected `ChatTree` leaves instead of legacy message-entry classification.
7. `@km/silvercode/parity-claude/l5-legacy-quarantine`: delete the old renderer-owned classification path or quarantine it behind a normalizer that emits `ChatEvent`s.
8. `@km/silvercode/parity-claude/l5-visual-replay-parity`: prove same-or-better scanability against real Claude Code screenshot/session fixtures.

Phase order follows the refactor rule: update the bead/docs first, absorb behavior into the new event/session/tree path, purge old renderer-owned classification, remove old paths, then fix call sites/tests. Do not add compatibility shims that let new transcript behavior bypass `ChatEvent -> ChatSession -> ChatTree`.

Immediate implementation slice:

1. Extract compatibility projection logic into a tested `chat/projection` module.
   - Inputs: legacy transcript entries, session metadata, channel notifications, queue/activity state.
   - Output: typed `ChatTree`. Projection is the process; the tree is the current render data shape.
   - No React components in this module.
2. Move session lifecycle marker placement into that projection module.
   - Covered cases: `session.resumed`, missing loaded-message anchor, live prompt submitted during resume loading, loaded-message timestamp sorting after live rows.
3. Move same-session notification filtering into projection.
   - Same-session subagent starts/progress are not transcript rows outside Debug.
   - Same-session completion notifications are hidden when the matching tool result is already transcript-owned.
   - Notification-only terminal completions remain visible as history.
4. Make the agents drawer consume the same projected subagent activity source as transcript activity.
   - The drawer keeps completed current-turn subagents.
   - It does not surface every historical subagent from the session.
   - Tool-derived and notification-derived lifecycle rows merge by tool id where possible.
5. Apply the vocabulary-first replacement map after extraction.
   - Replace content-unit names with `ChatBlock`.
   - Replace plan item names with `ChatPlanStep`.
   - Replace raw notification item names with `ChannelNotification` before normalization and `ChatNotification` after admission.
   - Keep compatibility names only inside explicitly named compatibility modules until they are deleted.

Prompt/job-control implementation slice:

1. Promote the controller prompt queue to `ChatPromptQueue`.
   - `ChatPrompt` owns one queued/submitting/agent-queued prompt.
   - The composer may still render an editable text region, but edits update prompt objects rather than an opaque joined string.
   - A prompt leaves `ChatPromptQueue` when it commits as a user `ChatMessage`, is cancelled, or permanently fails.
2. Normalize queue operations into `ChatEvent` records.
   - Local queue edits become queue-domain events.
   - Prefer explicit prompt event families (`prompt.queued`, `prompt.updated`, `prompt.submitting`, `prompt.agentQueued`, `prompt.committed`, `prompt.cancelled`, `prompt.failed`) over a generic `queue.updated` bucket.
   - Agent-owned queued prompt records become `agent-queued` only when the agent exposes queue identity/capabilities.
   - stdin buffering, RPC waiters, and transcript attachments do not count as agent queue ownership by themselves.
3. Model foreground/background/interrupted state as `ChatShell` / `ChatJob` state.
   - `ChatShell` is continuous and owns `foregroundJobId`, `backgroundJobIds`, composer state, prompt queue controls, and job-control commands.
   - `ChatJob` is the time-bounded control handle for agent work. It owns execution state; the shell owns foreground/background attachment.
   - `ChatEvent` records that belong to controllable work carry a `ChatJobId`, with agent turn/message ids kept as provenance.
   - Ctrl-B / trailing `&` backgrounds the current foreground job; it is not a subagent and not another prompt queue operation.
   - `fg` reattaches a background job to the shell foreground.
   - Esc interruption closes the foreground projection and marks later events for that agent turn as abandoned unless the agent confirms abort.
   - Background completion/cancellation/interruption render as chat-domain lifecycle/activity leaves, not synthetic user messages.
   - Backgrounding is UI detachment, not agent concurrency. Unless an agent/backend advertises real concurrent prompt-turn capability, new prompts remain in `ChatPromptQueue` until the current backend turn settles.
4. Keep agent turn ids as provenance.
   - Use `rawRefs` or explicit agent-specific metadata.
   - Do not make agent `turnId` the canonical chat span key.
5. Tighten session/projection event ownership.
   - Split generic `session.updated` usage into explicit lifecycle and info events where the model needs audited ownership.
   - Move interaction state such as selected node and raw inspector out of `ChatTree` projection data and into `ChatShell` / view state.
   - Keep `ChatTree` as the production projection target; if a flat render list is needed, make it a derived view over the tree rather than a second domain model.
6. Keep evergreen design docs separate from implementation status.
   - `apps/silvercode/docs/chat-session-model.md` and `apps/silvercode/docs/chat-state-machines.md` describe the desired model in present tense.
   - Implementation status and remaining work stay in this bead and the L5 child beads.

Regression checklist for this slice:

- `apps/silvercode/tests/content-layout.test.tsx`: `session.resumed` marker stays before live prompts/activity in all resume cases.
- `apps/silvercode/tests/notification-block.test.tsx`: subagent drawer, same-session notification filtering, completion dedupe, no-description suppression.
- `apps/silvercode/tests/queue-batching.test.tsx`: second prompt before agent `turn-start` queues; explicit queue flush does not bypass an unstarted outbound turn.
- `apps/silvercode/tests/visual/prompt-submit-latency.test.tsx`: Enter clears composer before backend dispatch blocks the UI.
- New prompt queue tests: queued prompts are `ChatPromptQueue.prompts`, edits preserve prompt ids, committed prompts leave the queue, and agent queue ids are recorded only when explicit agent capabilities exist.
- New job-control tests: Ctrl-B backgrounds a `ChatJob` without creating a subagent, `fg` reattaches a background job, Esc interruption records interruption without backgrounding, and late events for interrupted agent turns do not become normal transcript rows.
- New projection contract tests under `apps/silvercode/tests/chat-projection*.test.ts`: cover the same behaviors without rendering React.

Close criteria:

- `SessionUpdateList` no longer decides session lifecycle marker placement, same-session notification ownership, or subagent/tool activity identity.
- There is one documented projection path from agent events and chat notifications to `ChatTree`.
- Prompt queue, job control, and interruption state are represented in `ChatShell` / `ChatSession` / `ChatTree` rather than only controller-local maps or synthetic user messages.
- Controllable work is correlated by `ChatJobId`; agent turn/message ids remain provenance.
- Backgrounding one job does not create fake backend concurrency and does not keep the foreground span open.
- Drawer and transcript derive subagent activity from the same domain projection, not separate component-local filters.
- Agent-specific gaps are explicitly represented in metadata. If an agent cannot supply subagent/tool start/end time, the model records that absence instead of guessing duration.
- Focused silvercode tests pass for projection, queue, notification-block, content-layout, and prompt-submit latency.

Vocabulary-first phase:

Term definitions use plain domain language first. CapCase names below are implementation mappings, not the definitions.

Canonical terms to use before code migration:

- agent backend (`AgentBackend`): selectable/runnable source of agent work.
- agent connection (`AgentConnection`): one live session opened by an agent backend.
- agent event (`AgentEvent`): cross-backend runtime event after backend-specific parsing. It is not a render model and not a chat transcript row.
- protocol notification (`ProtocolNotification`): protocol/transport notification such as ACP or JSON-RPC. Use source prefixes such as `Acp*`, `Claude*`, or `Codex*` only for exact source shapes.
- channel notification (`ChannelNotification`): side-channel input before chat normalization.
- chat event (`ChatEvent`): canonical chat-domain event after normalization. Events that belong to controllable work carry a `ChatJobId`.
- chat message (`ChatMessage`): durable transcript message in the chat-domain model. It owns role, block ids, and source event ids; it is not a renderer row.
- chat block (`ChatBlock`): typed content unit inside a prompt, message, or tool output: text, reasoning, image, audio, resource, resource link, diff, terminal, or tool reference.
- prompt draft (`ChatPromptDraft`): ephemeral prompt text in the composer. It becomes a prompt only when the user submits or explicitly queues it.
- prompt (`ChatPrompt`): user-authored input unit that has not yet been committed to transcript history.
- prompt queue (`ChatPromptQueue`): ordered collection of pre-transcript prompts that are still not history.
- tool (`ChatTool`): chat-domain record for a tool lifecycle derived from tool-related chat events.
- chat session (`ChatSession`): read model over chat events: messages, blocks, tools, jobs, job activity, plan, prompt queue, permissions, notifications, channels, lifecycle state, and projection state.
- chat shell (`ChatShell`): continuous interactive control surface for a chat session. It owns composer state, prompt queue controls, foreground job slot, background job table, active selection, and job-control commands.
- chat job (`ChatJob`): user-controllable agent work. It owns execution state; foreground/background attachment lives on the chat shell.
- chat tree (`ChatTree`): derived render tree over a chat session. Projection is the process that creates it; the tree is the current presentation data shape.
- chat span (`ChatSpan`): foreground idle-delimited activity span. It is not an agent/harness turn id.
- lifecycle event (`ChatLifecycleEvent`): session lifecycle fact such as `session.started`, `session.resumed`, `session.ended`, or `session.interrupted`.
- chat activity (`ChatActivity`): one nested work unit inside a chat job or chat span, such as reasoning, tool execution, shell work, permission wait, or subagent work.
- summary: derived/collapsed projection text or metadata about another term. A summary is not a work unit and should not be a generic standalone domain object.
- message summary (`ChatMessageSummary`): derived summary for one chat message.
- span summary (`ChatSpanSummary`): derived summary for one chat span.
- subagent activity (`ChatSubagentActivity`): activity for a Task/Agent-style local agent running under the current session.
- subagent session (`ChatSubagentSession`): navigable local-agent session with its own session id, stream, load semantics, and selectable view.
- chat notification (`ChatNotification`): normalized notification admitted into the chat domain.
- plan step (`ChatPlanStep`): one ordered item in a `ChatPlan`.

Naming rules:

- `Agent*` means cross-backend runtime surface.
- `Acp*`, `Claude*`, `Codex*`, and `OpenCode*` mean exact source/protocol shape only.
- `Chat*` means Silvercode-owned chat-domain state, control, or projection.
- Use `Backend` for selectable/runnable sources of agent work, `Connection` for one live session, `Parser` for bytes-to-source-shape conversion, and `Normalizer` for source-shape-to-domain conversion. Avoid `Adapter` as a domain noun.
- Do not give a normalized domain object a source-prefixed name just because that source emitted the original fact. Preserve origin in `rawRefs` or explicit source-specific provenance fields.
- Use `ChatEvent`, `ChatMessage`, and `ChatBlock` for the core chat content model.
- Use `ChatPrompt` until the prompt is committed to transcript history. Submitting to the backend may change its status, but does not by itself turn it into a `ChatMessage`.
- Remove a `ChatPrompt` from `ChatPromptQueue` when it becomes a user `ChatMessage`, is cancelled, or fails permanently.
- Use `ChatPromptQueue`, not `ChatQueue`, for queued user prompts.
- Avoid `AgentTurn` as a canonical type name. Use concrete event names when describing agent/harness lifecycle facts.
- Use `ChatSpan` for the foreground shell idle/activity span; do not nest spans. Use child activities for nested work.
- Use `ChatSpan.key` / `spanKey` for derived projection identity. Do not use Codex `turn_id`, Claude message ids, ACP message ids, or harness `AgentEvent.turnId` as the span key.
- Do not introduce `ChatSpanEvent` as a target noun. If span boundaries must be materialized, use normal `ChatEvent` types such as `span.started` and `span.ended`.
- Do not introduce `Exchange` as a target domain noun.
- Use `ChatNotification` for normalized notification facts. Use `ChannelNotification` for pre-normalization side-channel input.
- Use `ChatActivity` only for time-bounded work/lifecycle units, not for every non-message item.
- Do not use `ActivitySummary` as a canonical noun. Name summaries by scope, such as message summary or span summary.
- Use `ChatTree` as the target render projection. Do not introduce `ChatRenderItem` unless the projection deliberately changes from tree to list.
- Do not rename source-shaped `ToolCall` to `AgentTool`. `ToolCall` is acceptable at boundaries; the chat-domain aggregate is `ChatTool`.
- Do not introduce a generic `ChatRun`. Use specific names only when a real execution object owns lifecycle state, such as `ChatSubagentRun`.

UI component namespace:

```tsx
<Chat.Pane>
  <Chat.Header />
  <Chat.Session />
  <Chat.Composer />
</Chat.Pane>
```

- `Chat.Pane`: one visible chat frame.
- `Chat.Header`: pane/session chrome and controls.
- `Chat.Session`: renders the `ChatSession` content and activity projection.
- `Chat.Composer`: prompt input and prompt-queue controls.

Component files should export direct names and props, then namespace them directly:

```ts
export const Chat = { Pane, Header, Session, Composer } as const
```

Replacement map:

- `ChatMessagePart` -> `ChatBlock`
- `ChatMessagePartId` -> `ChatBlockId`
- `AgentPlanEntry` / `ChatPlanEntry` / `ChatPlanTask` -> `ChatPlanStep`
- `AgentPlanEntryId` / `ChatPlanTaskId` -> `ChatPlanStepId`
- `NotificationStreamEntry` -> `ChannelNotification` before normalization, `ChatNotification` after admission.
- `Provider*` -> `Agent*`
- selectable/runnable `*Adapter` names -> `*Backend`
- translation-only `*Adapter` names -> `*Parser` or `*Normalizer`
- `Chat.Transcript` -> `Chat.Session`
- `Chat.Pane` remains the top-level visible chat frame, containing `Chat.Header`, `Chat.Session`, and `Chat.Composer`.
- `Chat.Turn.*` -> names by rendered concept: `Chat.Message`, `Chat.Block`, `Chat.Tool`, `Chat.Activity`, `Chat.Summary`.
- `Exchange*` -> message/span/summary/activity names by actual scope.
- `ChatRun` -> no generic replacement; use `ChatJob`, `ChatActivity`, `ChatTool`, or a specific subtype.

Compatibility names to quarantine during implementation:

- harness session state (`SessionState`): reducer-owned harness state for one agent session. It is compatibility state, not final chat-domain state.
- legacy message entry (`MessageEntry`): legacy harness transcript entry. New code should normalize to `ChatMessage` / `ChatBlock`.
- message operation (`MessageOp`): legacy ordered operation inside a legacy message entry. New code should normalize to `ChatBlock`, `ChatTool`, or `ChatActivity`.
- tool call (`ToolCall`): raw agent or protocol-shaped invocation/update. Keep this at source/component boundaries; the canonical chat-domain aggregate is `ChatTool`.

Prompt lifecycle model:

- prompt draft (`ChatPromptDraft`): ephemeral prompt text in the input component. This is not chat-domain state until the user submits or explicitly queues it.
- prompt (`ChatPrompt`): pre-transcript user input. It can be edited/cancelled while Silvercode still owns it. If an agent exposes real prompt queue management, keep the agent queue id/capability metadata on the prompt; do not invent a separate queue noun until a real API exists.
- prompt queue (`ChatPromptQueue`): ordered visible set of pre-transcript prompts. It is not the transcript and should not contain generic notification/channel work.
- prompt submission: handoff action from Silvercode to the agent. Do not model this as a durable object; if it must be recorded, emit a chat event such as `prompt.submitted`.
- user chat message (`ChatMessage` with role `user`): transcript/history representation after the prompt is committed or observed. At this point the prompt leaves the prompt queue; editing becomes transcript editing, not prompt queue editing.

Prompt lifecycle states:

1. `draft`: user is typing in the composer.
2. `queued`: Silvercode owns a `ChatPrompt`; editable/cancellable.
3. `submitting`: Silvercode is handing the prompt to `AgentSession.send` / ACP `prompt`.
4. `agent-queued` (optional): backend accepted the prompt into a real agent queue and exposed a queue id plus edit/cancel/list capabilities.
5. `committed`: prompt is now a user `ChatMessage`; remove the `ChatPrompt`.
6. `cancelled`: prompt is removed without becoming transcript history.
7. `failed`: send failed before commitment; either return to `queued` with an error or remove with a visible failure.

Current implementation facts to preserve while refactoring:

- `controller.send` currently uses a local per-session string buffer and batches queued prompt text with blank-line separators.
- `dispatchUserTurn` currently applies a local `user-message` before calling `AgentSession.send`, then gates outbound state until agent `turn-start`; this gives responsive UI but blurs pre-transcript prompt state with committed transcript state.
- ACP `prompt()` exposes request/response plus `cancel()`, but the current harness does not expose agent queue list/edit/cancel semantics.
- `claude-acp` has a waiter queue for prompt RPC responses; that is not a semantic prompt queue.
- Claude Code transcript parsing sees `queued_command` attachments, which suggests agent-side queued prompt concepts can appear in history, but Silvercode currently treats them as raw transcript/debug material, not as a manageable queue API.

Capability rule:

- If an agent does not expose prompt queue management, Silvercode can only edit/cancel prompts it still owns locally.
- If an agent does expose queue management, model that explicitly with backend queue ids/capabilities; do not infer it from stdin buffering, prompt promises, or waiter queues.

Span lifecycle model:

- A chat span is not a strict prompt/response pair.
- A chat span starts when the foreground shell is idle and a new foreground user or agent activity event appears.
- A chat span remains open while foreground work is active:
  - user has queued/submitted prompt activity not yet settled;
  - the foreground job is running, thinking, streaming text, running tools, awaiting permission, or processing an agent-owned queued prompt.
- Background jobs do not keep the current foreground span open; they project through job lifecycle/activity output until foregrounded again.
- A chat span ends when the foreground shell is idle again.
- Multiple prompts and partial responses can interleave inside the same chat span.
- Legacy `AgentEvent.turnId` is adapter evidence, not the canonical chat-domain turn identity.
- Codex `turn_id`, when present, is agent provenance only. Keep it in `rawRefs` or an adapter-specific `agentTurnId` field only when a feature genuinely needs queryable Codex provenance; do not promote it into `ChatSpan.key`.

Replacement implementation notes:

- `apps/silvercode/src/chat-model.ts` should either fold into chat projection or narrow to the specific legacy operation helpers it owns. The file name should not compete with the `Chat*` domain model.
- `apps/silvercode/src/chat/project-transcript.ts` should converge on the `ChatTree` projection target. If renamed, prefer `project-chat-tree.ts` / `projectChatTree`.
- Prompt queue state uses `ChatPromptQueue`, `ChatPrompt`, and `ChatPromptId`; prompt objects disappear when they commit to `ChatMessage`.
- Keep `ChatTree` as the target render projection. Tree leaves may be implementation details, but the public target noun is `ChatTree`.
- `ChatSessionProjectionStore` should become `ChatTreeStore` if it stores only the projected tree.
- Current-turn activity helpers should name their scope directly, such as `projectCurrentTurnActivity`.
- The visible UI namespace converges on `Chat.Pane`, `Chat.Header`, `Chat.Session`, and `Chat.Composer`.
- Activity summary names stay scoped: `ChatMessageSummary` or `ChatSpanSummary`, not generic `ActivitySummary`.

What happened to the clearer model:

- The clearer model exists in `apps/silvercode/src/chat/types.ts`; Phase 0 renamed its content unit to `ChatBlock` before the rest of the migration proceeds.
- It is exercised by `apps/silvercode/src/chat/store.ts`, `apps/silvercode/src/chat/project-transcript.ts`, `apps/silvercode/tests/chat-session-store.test.ts`, and `apps/silvercode/tests/chat-transcript-projection.test.ts`.
- It did not become the production renderer. The visible pane still renders the compatibility transcript path, and only shows the projected tree under Debug comparison.
- Recent screenshot fixes landed in that legacy path because it was the user-visible path. That improved behavior but added more renderer-local ownership for session lifecycle placement, notification filtering, subagent activity identity, grouping, and spacing.
- The plateau move is therefore not to invent `AgentTurn`, `Exchange`, `AgentTool`, or `ToolActivity` as new domain state. It is to finish the migration so production rendering uses `ChatEvent` -> `ChatSession` -> `ChatShell` / `ChatTree`, with dense UI collapsed through message summaries or span summaries where needed.

Progress:

- Added regression coverage for the latest screenshot cluster:
  - parallel Task/Agent lifecycle events are not dropped;
  - all-completed subagents no longer leave the drawer in an active state;
  - no-description/agentId-only subagent notifications do not leak inline;
  - live prompts submitted during resume loading stay below the `session.resumed` marker, including when loaded messages have not rendered yet;
  - completed Agent/Task transcript rows show the result text while the drawer keeps the stable task label.
- Stopped debouncing subagent lifecycle events. These are state transitions, not ambient notification noise; dropping them caused missing agents and stale active counts.
- Moved current raw notification stream typing to the stream module instead of treating the row component as the source of the type.
- Renamed the shared disclosure component from `ChatEntryDisclosure` to `EntryDisclosure`; `ChatEntry*` no longer appears in Silvercode source/tests/storybook.
- Replaced ambiguous `NotificationBlockWorkDetail` terminology with `SubagentActivity` / `BackgroundShellActivity`-oriented types in the notification block path.
- Extracted current-turn agent/shell derivation to `apps/silvercode/src/chat/activity-snapshot.ts`, so the drawer reads a chat-domain activity snapshot instead of a `NotificationBlock` helper.
- Added `ChatSubagentActivity` / `SubagentActivity` lifecycle projection as the drawer source for subagents:
  - canonical `ChatEvent` tool lifecycle facts now project to one run per Task/Agent tool event;
  - raw subagent notifications are side-channel observations that can merge with a matching run but cannot collapse distinct labels when an agent reuses or misreports `toolUseId`;
  - assistant text that claims completed agents remains assistant prose and is not used to invent missing drawer rows, diagnostics, or controller errors;
  - explicit user prompts such as `use 4 subagents...` do not create expected-count state unless Claude emits structured Task/Agent lifecycle events;
  - `ChatSession` now carries `subagentActivities`, and `ChatPane` derives drawer rows from the `ChatEvent` projection plus chat notifications rather than from the legacy message snapshot.
- Fixed the latest screenshot regressions:
  - `Session resumed` now stays above live prompts/activity even when timestamp ordering puts loaded history after live rows.
  - Tool-derived subagents and notification lifecycle rows merge by tool id, so the drawer does not show duplicate `Sleep #2` rows.
  - Same-session subagent starts/progress remain hidden outside Debug, but terminal completion notifications remain visible as history when no matching tool-result row exists.
  - Subagent completion notifications no longer numeric-group distinct labels like `#1`, `#3`, and `#4` into a single `(3x)` row.
  - Active status markers now share a synchronized pulse, and chat-message-summary live-preview tool rows render steady so only the top-level `Using tools...` row pulses inside that block.
  - Hardened subagent identity against reused/misreported `toolUseId` values: meaningful labels now win over agent ids for drawer identity, and same-session completion hiding only suppresses a notification when both the tool id and label match.
  - Subagent lifecycle observations no longer depend on ambient-notification admission: the notification stream breaker does not drop `subagent-status` events, and the agents drawer reads the unmuted journal while inline notification rows still respect source mutes.
- Extracted the legacy production transcript projection from `SessionUpdateList` to `apps/silvercode/src/chat/session-update-projection.ts`:
  - session lifecycle placement, notification interleaving, assistant tool-activity splitting, grouping, padding, and list epoch derivation are now pure functions;
  - `SessionUpdateList` imports typed transcript items/guards and focuses on rendering;
  - focused projection tests cover `session.resumed` before live prompts and notifications interleaving between timestamped assistant operation slices.
- Moved same-session subagent notification visibility rules out of `ChatPane` to `apps/silvercode/src/chat/notification-visibility.ts`.
- Fixed the latest subagent drawer screenshot issue where four sibling Agent/Task tool-use events with duplicate labels collapsed into one row. Tool-backed subagent activities now merge by matching tool id only; duplicate labels with distinct tool ids remain distinct.
- The agents drawer now renders diagnostic-only missing rows when a prompt/prose claim says four subagents but the event stream only contains fewer real Agent/Task lifecycle events. It still does not invent completed subagent sessions from prose.
- The command composer bottom overlay now aligns with prose rows; the extra right inset was removed from `ChatPane`.
- The welcome screen now reserves banner height during measurement and the empty `PaneGrid` pre-session branch reuses `Welcome`, reducing startup logo/content jumps and composer remounts.

Remaining:

- `SessionUpdateList` no longer uses generic local names like `Item`, `RenderItem`, and `NotificationItem`; the remaining work is cutting the extracted compatibility projection over to the canonical `ChatTree`.
- `ChatLeaf` / `ChatNode` naming still reflects the experimental projected transcript tree. Decide whether that model remains or whether the legacy `SessionUpdateList` projection subsumes it.
- The current fixes isolate the legacy renderer/filter path but do not remove it. The plateau move remains to make subagent lifecycle, session lifecycle, and notification facts first-class projected chat-domain events before they reach `ChatPane`.
