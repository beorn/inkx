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

Current rough assessment (2026-05-07): roughly 80-85% of the way to the chat-domain quality plateau. This is L4.5-ish: the vocabulary and state model are much cleaner, the latest prompt/session/subagent regressions have focused tests, and the worst production renderer-owned projection rules are now isolated behind chat-domain helpers. The production transcript path still has a compatibility projection instead of fully rendering from `ChatTree`.

- Prompt/send lifecycle: 7.5/10. The controller now has an outbound turn gate for the gap between local user-message dispatch and provider `turn-start`, with regression tests for the "prompt leaks into history / thinking never ends" failure mode.
- Provider turn lifecycle and stuck-thinking handling: 7/10. ACP has a centralized turn-start/turn-end path and watchdog/self-heal coverage, but equivalent behavior still needs to stay explicit across Codex/session-load/streaming adapters.
- Transcript projection and session lifecycle placement: 7.5/10. `session.resumed` placement, notification interleaving, grouping, and padding are now in `chat/session-update-projection.ts` with pure tests, but the output is still a compatibility transcript list rather than the final `ChatTree`.
- Subagent/activity model: 8/10. The drawer now derives from projected subagent activity plus chat notifications, duplicate Task/Agent labels with distinct tool ids no longer collapse, and missing observed subagents surface as diagnostics. Transcript, drawer, lifecycle markers, and summaries are still not all produced from one `ChatTree`.
- UI rendering components: 7.5/10. Visual regressions are covered better than before, and `SessionUpdateList` no longer owns the main projection/filter rules, but it still renders the compatibility projection directly.
- Terminology/cohesion: 7/10. The worst misleading names have been removed, but compatibility vocabulary still exists: `SessionState`, `MessageEntry`, `MessageOp`, `Chat.Turn.*`, `ChatLeaf`/`ChatNode`, activity runs, message/span summaries, and legacy render item names.

Remaining L5 gaps:

- `SessionUpdateList` still owns rendering and renderer-specific title/tool presentation; the projection logic is extracted but not yet the canonical `ChatTree`.
- Notification filtering moved out of `ChatPane`, but it is still a compatibility helper over `MessageEntry[]` / `NotificationStreamEntry[]`, not normalized `ChatNotification` events in `ChatSession`.
- Session lifecycle placement is extracted and tested, but still targets the compatibility transcript projection rather than `ChatLifecycleEvent` leaves in `ChatTree`.
- Prompt queue state still lives as controller-local queue machinery rather than a `ChatPromptQueue` owned by `ChatSession`.
- Ctrl-B background tasks and Esc interruption are controller-owned runtime maps; they need canonical chat-domain events/state for foreground/background/interrupted turn projection.
- Terminology is still mixed at the compatibility boundary: `MessageEntry`, `MessageOp`, `Chat.Turn.*`, `ChatLeaf`, `ChatNode`, activities, summaries, and spans need clearer ownership.
- We need real JSONL replay fixtures in tests, not just synthetic event-shape tests.
- A provider/model can still emit one Agent/Task lifecycle event while assistant prose claims four subagents. Silvercode now diagnoses that mismatch; L5 should fail loudly in replay/dev paths and avoid inventing missing subagent sessions unless a provider exposes real repair/list semantics.

Target shape: put the original chat-domain model back at the center and make rendering consume it:

`AgentEvent / raw notification input -> ChatEvent -> ChatSession -> ChatTree -> UI`

Expanded pipeline:

`AgentEvent / raw notification input -> normalize -> ChatEvent -> apply -> ChatSession -> projectChatTranscript(...) -> ChatTree -> UI`

Use `ChatTree` for the projected render data. `projectChatTranscript(...)` is the projection operation; do not introduce `ChatProjection` as a new durable domain noun unless the data shape intentionally changes.

The plateau shape is where the drawer, transcript, notifications, lifecycle markers, and summaries all project from the same chat session state. The subagent drawer and compatibility transcript projection are now on that path in part; the rest of production chat still needs the L5 migration.

The plateau is not another round of per-component compensation. The plateau is where the next screenshot-class bug has one obvious owner: event normalization, chat-domain state/projection, or rendering.

Acceptance direction:

- Define canonical chat-domain terms around the existing model: event, message, message part, tool, session, chat notification, activity, subagent activity, subagent session, chat span, lifecycle event, prompt draft, prompt, prompt queue, and chat tree.
- Ensure the pipeline has one clear shape: `AgentEvent` / raw notification input -> `ChatEvent` -> `ChatSession` -> `ChatTree` -> UI.
- Make the agents drawer read subagent activity for the current span/session, not notification-block leftovers.
- Make prompt queue, background task, and interruption state read from the chat-domain model rather than controller-only maps or synthetic user messages.
- Preserve completed current-turn subagents without surfacing every historical subagent from the session.
- Carry enough lifecycle metadata to show real subagent/tool durations, or explicitly record why a provider cannot supply them.
- Keep chat notifications distinct from transcript-owned same-session activity.
- Rename types/helpers so terms match the domain; avoid ambiguous names like work detail when the object is specifically subagent activity or background shell activity.
- Add regression coverage for the recent bugs before refactoring each area.

Refactor path to L5:

Existing execution beads under `@km/silvercode/parity-claude` are the active L5 phase beads. This epic is the canonical chat-domain dashboard; keep it updated as those child beads close.

1. `@km/silvercode/parity-claude/l5-fixture-inventory`: freeze real JSONL/replay fixtures and fail loudly for unknown event shapes.
2. `@km/silvercode/parity-claude/l5-canonical-event-contract`: make every transcript-affecting fact a `ChatEvent` with an explicit channel and owner.
3. `@km/silvercode/parity-claude/l5-reactive-chat-session-store`: make `ChatSession.tree` live projected state, not a debug comparison artifact.
4. `@km/silvercode/parity-claude/l5-project-transcript-rules`: centralize grouping, summaries, widths, disclosure, lifecycle placement, and channel filtering in `projectChatTranscript(...)`.
5. `@km/silvercode/parity-claude/l5-control-event-state-routing`: route permission, queue, plan, title, status, usage, hook, file snapshot, and recap records into owner state or Debug/error leaves.
6. `@km/silvercode/parity-claude/l5-chatblock-cutover`: make `ChatPane` render from projected `ChatTree` leaves instead of legacy `MessageEntry[]` classification.
7. `@km/silvercode/parity-claude/l5-legacy-quarantine`: delete the old renderer-owned classification path or quarantine it behind a named adapter that emits `ChatEvent`s.
8. `@km/silvercode/parity-claude/l5-visual-replay-parity`: prove same-or-better scanability against real Claude Code screenshot/session fixtures.

Phase order follows the refactor rule: update the bead/docs first, absorb behavior into the new event/session/tree path, purge old renderer-owned classification, remove old paths, then fix call sites/tests. Do not add compatibility shims that let new transcript behavior bypass `ChatEvent -> ChatSession -> ChatTree`.

Immediate implementation slice:

1. Extract `SessionUpdateList` projection logic into a tested `chat/projection` module.
   - Inputs: `MessageEntry[]`, session metadata, notifications, queue/activity state.
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
5. Rename legacy local projection names after extraction.
   - Legacy local names such as `Item`, `RenderItem`, and `NotificationItem` stay removed from `SessionUpdateList`; use transcript-specific names such as `TranscriptItem`, `TranscriptRenderItem`, and `ChatNotificationGroup`.
   - Decide whether `ChatLeaf` / `ChatNode` remains the long-term model or is replaced by the extracted projection.

Prompt/background implementation slice:

1. Promote the controller prompt queue to `ChatPromptQueue`.
   - `ChatPrompt` owns one queued/submitting/agent-queued prompt.
   - The composer may still render an editable text region, but edits update prompt objects rather than an opaque joined string.
   - A prompt leaves `ChatPromptQueue` when it commits as a user `ChatMessage`, is cancelled, or permanently fails.
2. Normalize queue operations into `ChatEvent` records.
   - Local queue edits become queue-domain events.
   - Provider-owned queued prompt records become `agent-queued` only when the provider exposes queue identity/capabilities.
   - stdin buffering, RPC waiters, and transcript attachments do not count as provider queue ownership by themselves.
3. Model foreground/background/interrupted state in chat-domain terms.
   - Ctrl-B / trailing `&` turns the active foreground turn into a background activity; it is not a subagent and not another prompt queue operation.
   - Esc interruption closes the foreground projection and marks later events for that provider turn as abandoned unless the provider confirms abort.
   - Background completion/cancellation/interruption render as chat-domain lifecycle/activity leaves, not synthetic user messages.
4. Keep provider turn ids as provenance.
   - Use `rawRefs` or explicit provider-specific metadata.
   - Do not make provider `turnId` the canonical chat span key.
5. Keep evergreen design docs separate from implementation status.
   - `apps/silvercode/docs/chat-session-model.md` and `apps/silvercode/docs/prompt-background-state-machines.md` describe the desired model in present tense.
   - Implementation status and remaining work stay in this bead and the L5 child beads.

Regression checklist for this slice:

- `apps/silvercode/tests/content-layout.test.tsx`: `session.resumed` marker stays before live prompts/activity in all resume cases.
- `apps/silvercode/tests/notification-block.test.tsx`: subagent drawer, same-session notification filtering, completion dedupe, no-description suppression.
- `apps/silvercode/tests/queue-batching.test.tsx`: second prompt before provider `turn-start` queues; explicit queue flush does not bypass an unstarted outbound turn.
- `apps/silvercode/tests/visual/prompt-submit-latency.test.tsx`: Enter clears composer before backend dispatch blocks the UI.
- New prompt queue tests: queued prompts are `ChatPromptQueue.prompts`, edits preserve prompt ids, committed prompts leave the queue, and provider queue ids are recorded only when explicit provider capabilities exist.
- New background/interruption tests: Ctrl-B records background activity without creating a subagent, Esc interruption records interruption without backgrounding, and late events for interrupted provider turns do not become normal transcript rows.
- New projection contract tests under `apps/silvercode/tests/chat-projection*.test.ts`: cover the same behaviors without rendering React.

Close criteria:

- `SessionUpdateList` no longer decides session lifecycle marker placement, same-session notification ownership, or subagent/tool activity identity.
- There is one documented projection path from provider events and chat notifications to `ChatTree`.
- Prompt queue, background task, and interruption state are represented in `ChatSession`/`ChatTree` rather than only controller-local maps or synthetic user messages.
- Drawer and transcript derive subagent activity from the same domain projection, not separate component-local filters.
- Provider-specific gaps are explicitly represented in metadata. If a provider cannot supply subagent/tool start/end time, the model records that absence instead of guessing duration.
- Focused silvercode tests pass for projection, queue, notification-block, content-layout, and prompt-submit latency.

Vocabulary audit (2026-05-07):

Term definitions use plain domain language first. CapCase names below are implementation mappings, not the definitions.

Canonical terms to use:

- agent event (`AgentEvent`): provider-neutral runtime event emitted by `agent-harness`. It is not a render model and not a chat transcript row.
- chat event (`ChatEvent`): canonical chat-domain event after provider/raw input normalization. This is the event log Silvercode projects from.
- chat message (`ChatMessage`): durable transcript message in the chat-domain model. It owns role, part ids, and source event ids; it is not a renderer row.
- chat message part (`ChatMessagePart`): typed content inside a chat message: text, reasoning, attachment, or tool reference.
- prompt draft (`ChatPromptDraft`): ephemeral prompt text in the composer. It becomes a prompt only when the user submits or explicitly queues it.
- prompt (`ChatPrompt`): user-authored input unit that has not yet been committed to transcript history. It should map closely to the agent prompt payload. It may be queued or already submitted to the backend but still editable/cancellable if it has not become a chat message.
- prompt queue (`ChatPromptQueue`): ordered collection of pre-transcript prompts: queued, submitted, editable, or cancellable prompts that are still not history. This replaces the overly generic `ChatQueue` when the queue is specifically the user's prompt queue.
- tool (`ChatTool`): chat-domain record for a tool lifecycle derived from tool-related chat events.
- chat session (`ChatSession`): read model over chat events: messages, message parts, tools, plan, prompt queue, permissions, channels, lifecycle state, and projection state.
- chat tree (`ChatTree`): derived render tree over a chat session. Projection is the process that creates it; the tree is the current presentation data shape.
- chat span (`ChatSpan`): silvercode-domain idle-delimited activity span. A span starts when both user and agent are idle and new user/agent activity appears; it ends when both are idle again. It is not the same thing as a provider/harness `turnId`.
- lifecycle event (`ChatLifecycleEvent`): session lifecycle fact such as `session.started`, `session.resumed`, `session.ended`, or `session.interrupted`. This replaces separate resume marker nouns. Do not add `session.recovered`; recovery is an implementation outcome and should surface as `error.raised` plus a later `session.started` or `session.resumed` when appropriate.
- activity (`Activity`): one nested work unit inside a chat span, such as reasoning, tool execution, shell/background work, permission wait, or subagent work. An activity is not a group of other activities; it is the work unit produced by one or more lower-level chat events.
- summary: derived/collapsed projection text or metadata about another term. A summary is not a work unit and should not be a generic standalone domain object.
- message summary (`ChatMessageSummary`): derived summary for one chat message, including the activities attached to that message when needed.
- span summary (`ChatSpanSummary`): derived summary for one chat span, including cross-message activity when needed.
- subagent activity (`SubagentActivity`): activity for a Task/Agent-style local agent running under the current session.
- subagent session (`SubagentSession`): navigable local-agent session with its own session id, stream, load semantics, and selectable view. Do not use it for a mere Task tool row or notification.
- chat notification (`ChatNotification`): normalized notification admitted into the chat domain. Current raw-stream code may still use `NotificationStreamEntry`, but that is an implementation name, not a target domain noun.

Naming rules:

- Use `subagent` as one word in filenames/types/functions (`SubagentActivity`, `subagentActivityFromTool`, `SubagentActivityPanel`). Avoid mixed `Subagent`.
- Use `debug` as the channel id and "Debug" only as the UI label.
- Use `ChatEvent` / `ChatMessage` / `ChatMessagePart` for the core chat model. Do not invent parallel state nouns when the existing model already has the concept.
- Use `ChatPrompt` until the prompt is committed to transcript history. Submitting to the backend may change its status, but does not by itself turn it into a `ChatMessage`.
- Remove a `ChatPrompt` from `ChatPromptQueue` when it becomes a user `ChatMessage`, is cancelled, or fails permanently. Do not keep a prompt object around just to correlate it to transcript history.
- Use `ChatPromptQueue`, not `ChatQueue`, for queued user prompts. Reserve any generic `Queue` noun only for a truly generic infrastructure queue.
- Avoid `ProviderTurn` as a canonical type name. Use concrete event names (`turn-start`, `turn-end`, `message.started`, `message.completed`) when describing provider/harness lifecycle facts.
- Use `ChatSpan` for the silvercode idle/activity span: idle user + idle agent -> first activity starts the span; both idle again ends it.
- Use `ChatSpan.key` / `spanKey` for derived projection identity. Mint it from the idle-transition projection, such as the first canonical `ChatEventId` in the span or a stable projection ordinal. Do not use Codex `turn_id`, Claude message ids, ACP message ids, or legacy harness `AgentEvent.turnId` as the span key.
- Do not introduce `ChatSpanEvent` as a target noun. If span boundaries must be materialized, use normal `ChatEvent` types such as `span.started` and `span.ended`.
- Do not introduce `Exchange` as a target domain noun. If the UI needs a compact row, model the actual thing being summarized: a message summary or a span summary.
- Use `ChatNotification` for normalized notification facts. Keep `NotificationStreamEntry` only as a current raw-stream implementation name until it is renamed or hidden behind `rawRefs`.
- Use `Activity` only for time-bounded work/lifecycle units, not for every non-message item.
- Do not use `ActivitySummary` as a canonical noun. An activity can have a `summary` field; aggregates should be named by scope, such as message summary or span summary. If a real activity collection object is needed, name it `ActivityGroup`.
- Use `ChatTree` as the target render projection. Do not introduce `ChatRenderItem` unless we deliberately change the projection shape from tree to list.
- Do not rename provider/ACP-shaped `ToolCall` to `AgentTool`. `ToolCall` is acceptable at the boundary; the canonical chat-domain aggregate is `ChatTool`.
- Do not rename subagent activity to subagent summary unless the data only summarizes a subagent. Running/completed subagent work is activity; a navigable local agent is a subagent session.

Event terms:

- agent event: external adapter/runtime event before chat normalization.
- chat event: canonical event envelope after normalization.
- lifecycle event: optional chat event family for session lifecycle facts.

State/projection terms:

- chat session, chat tree, chat message, chat message part, tool, prompt draft, prompt, prompt queue, chat span, activity, subagent activity, subagent session, chat notification, message summary, and span summary are state/projection terms, not separate event logs.
- Summaries are projection state unless they come from provider-authored transcript content. Provider-authored recap/summary content should enter as a normal chat event and become a chat message part or explicit recap part.

Compatibility names to quarantine:

- harness session state (`SessionState`): reducer-owned harness state for one provider session. It is compatibility state, not final chat-domain state.
- legacy message entry (`MessageEntry`): legacy harness transcript entry. New code should normalize to `ChatMessage` / `ChatMessagePart`.
- message operation (`MessageOp`): legacy ordered operation inside a legacy message entry. New code should normalize to `ChatMessagePart`, `ChatTool`, or `Activity`.
- tool call (`ToolCall`): raw/provider or ACP-shaped invocation/update. Keep this at adapter/component boundaries; the canonical chat-domain aggregate is `ChatTool`.

Prompt lifecycle model:

- prompt draft (`ChatPromptDraft`): ephemeral prompt text in the input component. This is not chat-domain state until the user submits or explicitly queues it.
- prompt (`ChatPrompt`): pre-transcript user input. It can be edited/cancelled while Silvercode still owns it. If a backend exposes real prompt queue management, keep the provider queue id/capability metadata on the prompt; do not invent a separate queue noun until a real API exists.
- prompt queue (`ChatPromptQueue`): ordered visible set of pre-transcript prompts. It is not the transcript and should not contain generic notification/channel work.
- prompt submission: handoff action from Silvercode to the agent. Do not model this as a durable object; if it must be recorded, emit a chat event such as `prompt.submitted`.
- user chat message (`ChatMessage` with role `user`): transcript/history representation after the prompt is committed or observed. At this point the prompt leaves the prompt queue; editing becomes transcript editing, not prompt queue editing.

Prompt lifecycle states:

1. `draft`: user is typing in the composer.
2. `queued`: Silvercode owns a `ChatPrompt`; editable/cancellable.
3. `submitting`: Silvercode is handing the prompt to `AgentSession.send` / ACP `prompt`.
4. `agent-queued` (optional): backend accepted the prompt into a real provider queue and exposed a queue id plus edit/cancel/list capabilities.
5. `committed`: prompt is now a user `ChatMessage`; remove the `ChatPrompt`.
6. `cancelled`: prompt is removed without becoming transcript history.
7. `failed`: send failed before commitment; either return to `queued` with an error or remove with a visible failure.

Current implementation facts to preserve while refactoring:

- `controller.send` currently uses a local per-session string buffer and batches queued prompt text with blank-line separators.
- `dispatchUserTurn` currently applies a local `user-message` before calling `AgentSession.send`, then gates outbound state until provider `turn-start`; this gives responsive UI but blurs pre-transcript prompt state with committed transcript state.
- ACP `prompt()` exposes request/response plus `cancel()`, but the current harness does not expose provider queue list/edit/cancel semantics.
- `claude-acp` has a waiter queue for prompt RPC responses; that is not a semantic prompt queue.
- Claude Code transcript parsing sees `queued_command` attachments, which suggests provider-side queued prompt concepts can appear in history, but Silvercode currently treats them as raw transcript/debug material, not as a manageable queue API.

Capability rule:

- If a provider does not expose prompt queue management, Silvercode can only edit/cancel prompts it still owns locally.
- If a provider does expose queue management, model that explicitly with backend queue ids/capabilities; do not infer it from stdin buffering, prompt promises, or waiter queues.

Span lifecycle model:

- A chat span is not a strict prompt/response pair.
- A chat span starts when both sides are idle and a new user or agent activity event appears.
- A chat span remains open while either side is active:
  - user has queued/submitted prompt activity not yet settled;
  - agent is thinking, streaming text, running tools, awaiting permission, or processing a provider-owned queued prompt.
- A chat span ends only when both user and agent are idle again.
- Multiple prompts and partial responses can interleave inside the same chat span.
- Legacy `AgentEvent.turnId` is adapter evidence, not the canonical chat-domain turn identity.
- Codex `turn_id`, when present, is provider provenance only. Keep it in `rawRefs` or an adapter-specific `providerTurnId` field only when a feature genuinely needs queryable Codex provenance; do not promote it into `ChatSpan.key`.

Rename candidates:

- `apps/silvercode/src/chat-model.ts` should either be folded into `chat/projection` or renamed to a narrower file such as `chat/transcript-ops.ts`. The current name is too broad and overlaps with `chat/types.ts`.
- `apps/silvercode/src/chat/project-transcript.ts` currently returns a `ChatTree`; keep the output noun as `ChatTree` and rename the file/function only if needed for clarity, such as `project-chat-tree.ts` / `projectChatTree`.
- `ChatQueue`, `ChatQueueItem`, and `ChatQueueItemId` have been renamed to `ChatPromptQueue`, `ChatPrompt`, and `ChatPromptId` in canonical chat state. `ChatPrompt` exists only before transcript commitment; after that, the relevant domain object is the resulting user `ChatMessage`.
- Keep `ChatTree`, `ChatNode`, and `ChatLeaf` as the current target render projection names unless a later design deliberately changes the projection shape. Do not preemptively rename to `ChatRenderItem`.
- `ChatSessionProjectionStore` can stay short-term, but clarify whether it stores the projected `ChatTree` or a broader projection process. If it owns only the tree, prefer `ChatTreeStore`.
- `chat/activity-snapshot.ts` should become `chat/current-turn-activity.ts` if it continues to intentionally filter to messages after the latest user prompt. Rename `chatActivitySnapshotFromMessages` to `projectCurrentTurnActivity`.
- `SessionUpdateList` should become `ChatTranscriptList` or `TranscriptRenderList` after projection extraction. The current name is protocol-shaped and hides that it renders projected transcript, lifecycle, notification, and activity rows.
- `ActivityItem` in `SessionUpdateList` should become `LiveActivityTail`.
- `NotificationItem` has become `ChatNotificationGroup` in `SessionUpdateList`.
- `AssistantActivitySlice` should become `AssistantToolActivitySegment` or `AssistantActivitySegment` depending on whether reasoning remains included.
- `SessionMetadataItem` should become `ChatLifecycleItem`; metadata is too vague for visible rows.
- `SubagentActivityPanel.tsx` should be renamed away from exchange vocabulary. If it renders task/local-agent activity, use `SubagentActivityPanel` or `SubagentActivityRow`; if it becomes a navigable local-agent session view, use `SubagentSessionView`.
- `ChatActivitySpan` has been renamed to `ActivityRun`; `span` is reserved for the outer idle-delimited `ChatSpan`.
- `TurnActivitySummary` has been renamed to `ChatMessageSummary`. Use `ChatSpanSummary` only for summaries whose source is a full chat span. Do not keep `Turn`, and do not introduce `ExchangeActivitySummary` or generic `ActivitySummary`.

What happened to the clearer model:

- The clearer model exists in `apps/silvercode/src/chat/types.ts`: `ChatEvent`, `ChatMessage`, `ChatMessagePart`, `ChatTool`, `ChatSession`, `ChatTree`, `ChatLeaf`.
- It is exercised by `apps/silvercode/src/chat/store.ts`, `apps/silvercode/src/chat/project-transcript.ts`, `apps/silvercode/tests/chat-session-store.test.ts`, and `apps/silvercode/tests/chat-transcript-projection.test.ts`.
- It did not become the production transcript renderer. `ChatPane` still renders the legacy `SessionUpdateList` over harness `SessionState.messages` / `MessageEntry[]`, and only shows the projected `ChatBlockList` under Debug comparison.
- Recent screenshot fixes landed in that legacy path because it was the user-visible path. That improved behavior but added more renderer-local ownership for session lifecycle placement, notification filtering, subagent activity identity, grouping, and spacing.
- The plateau move is therefore not to invent `ProviderTurn`, `Exchange`, `AgentTool`, or `ToolActivity` as new domain state. It is to finish the migration so production rendering uses the existing `ChatEvent` -> `ChatSession` -> `ChatTree` model, with dense UI collapsed through message summaries or span summaries where needed.

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
  - raw subagent notifications are side-channel observations that can merge with a matching run but cannot collapse distinct labels when a provider reuses or misreports `toolUseId`;
  - assistant text that claims more completed agents than the lifecycle stream contains is recorded as a diagnostic, not used to invent missing drawer rows;
  - explicit user prompts such as `use 4 subagents...` also produce a visible drawer diagnostic when the observed lifecycle count is lower than requested;
  - `ChatSession` now carries `subagentActivities`, and `ChatPane` derives drawer rows from the `ChatEvent` projection plus chat notifications rather than from the legacy message snapshot.
- Fixed the latest screenshot regressions:
  - `Session resumed` now stays above live prompts/activity even when timestamp ordering puts loaded history after live rows.
  - Tool-derived subagents and notification lifecycle rows merge by tool id, so the drawer does not show duplicate `Sleep #2` rows.
  - Same-session subagent starts/progress remain hidden outside Debug, but terminal completion notifications remain visible as history when no matching tool-result row exists.
  - Subagent completion notifications no longer numeric-group distinct labels like `#1`, `#3`, and `#4` into a single `(3x)` row.
  - Active status markers now share a synchronized pulse, and chat-message-summary live-preview tool rows render steady so only the top-level `Using tools...` row pulses inside that block.
  - Hardened subagent identity against reused/misreported `toolUseId` values: meaningful labels now win over provider ids for drawer identity, and same-session completion hiding only suppresses a notification when both the tool id and label match.
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
