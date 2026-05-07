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
- The Session resumed divider could appear after live prompt/output when replayBoundaryMessageId is missing and replayMessageCount is not a usable boundary for the current in-memory message list.
- Tool-result timestamps/durations are not carried into the transcript model, so per-agent elapsed time cannot be shown honestly.
- Naming overlaps: agent/session/subagent/Task/Agent tool/notification/activity/work detail/drawer agent.

Current rough assessment (2026-05-07): roughly 65-70% of the way to the chat-domain quality plateau.

- Prompt/send lifecycle: 7.5/10. The controller now has an outbound turn gate for the gap between local user-message dispatch and provider `turn-start`, with regression tests for the "prompt leaks into history / thinking never ends" failure mode.
- Provider turn lifecycle and stuck-thinking handling: 7/10. ACP has a centralized turn-start/turn-end path and watchdog/self-heal coverage, but equivalent behavior still needs to stay explicit across Codex/session-load/streaming adapters.
- Transcript projection and replay boundaries: 6/10. Recent replay-boundary bugs are covered, but the rules still live in the legacy renderer/filter path.
- Subagent/activity model: 6/10. `SubagentActivity` and `BackgroundShellActivity` exist, but they are still inferred from both tool calls and notification text instead of flowing as first-class projected chat-domain events.
- UI rendering components: 7/10. Visual regressions are covered better than before, but `SessionUpdateList` still owns projection, grouping, filtering, replay-boundary placement, and rendering.
- Terminology/cohesion: 5/10. There are still overlapping concepts and names: `SessionState`/`MessageEntry`, `chat-model.ts`, `chat/types.ts`, `ChatLeaf`/`ChatNode`, activity snapshots, notification rows, agents/subagents/Task tools.

Target shape: put the original chat-domain model back at the center and make rendering consume it:

`AgentEvent / NotificationStreamEntry -> ChatEvent -> ChatSession -> ChatProjection -> UI`

The plateau is not another round of per-component compensation. The plateau is where the next screenshot-class bug has one obvious owner: event normalization, chat-domain state/projection, or rendering.

Acceptance direction:

- Define canonical chat-domain concepts around the existing model: `ChatEvent`, `ChatMessage`, `ChatMessagePart`, `ChatTool`, `ChatSession`, `NotificationObservation`, `SubagentActivity`, `ReplayBoundary`.
- Ensure the pipeline has one clear shape: `AgentEvent` / `NotificationStreamEntry` -> `ChatEvent` -> `ChatSession` -> `ChatProjection` -> UI.
- Make the agents drawer read SubagentActivity for the current turn/session, not notification-block leftovers.
- Preserve completed current-turn subagents without surfacing every historical subagent from the session.
- Carry enough lifecycle metadata to show real subagent/tool durations, or explicitly record why a provider cannot supply them.
- Keep notification observations distinct from transcript-owned same-session activity.
- Rename types/helpers so terms match the domain; avoid ambiguous names like WorkDetail when the object is specifically SubagentActivity or BackgroundShellActivity.
- Add regression coverage for the recent bugs before refactoring each area.

First implementation slice:

1. Extract `SessionUpdateList` projection logic into a tested `chat/projection` module.
   - Inputs: `MessageEntry[]`, session metadata, notification observations, queue/activity state.
   - Output: typed `ChatRenderItem[]` with explicit variants for user prompt, assistant text, tool activity, subagent activity, notification observation, replay boundary, lifecycle marker, padding/activity tail.
   - No React components in this module.
2. Move replay-boundary placement into that projection module.
   - Covered cases: loaded replay boundary, missing `replayBoundaryMessageId`, live prompt submitted during replay, boundary timestamp sorting after live rows.
3. Move same-session notification filtering into projection.
   - Same-session subagent starts/progress are not transcript rows outside Debug.
   - Same-session completion notifications are hidden when the matching tool result is already transcript-owned.
   - Notification-only terminal completions remain visible as history.
4. Make the agents drawer consume the same projected `SubagentActivity` source as transcript activity.
   - The drawer keeps completed current-turn subagents.
   - It does not surface every historical subagent from the session.
   - Tool-derived and notification-derived lifecycle rows merge by tool id where possible.
5. Rename legacy local projection names after extraction.
   - `Item`, `RenderItem`, `NotificationItem`, and similar generic names become domain-specific names.
   - Decide whether `ChatLeaf` / `ChatNode` remains the long-term model or is replaced by the extracted projection.

Regression checklist for this slice:

- `apps/silvercode/tests/content-layout.test.tsx`: replay boundary stays before live prompts/activity in all resume cases.
- `apps/silvercode/tests/notification-block.test.tsx`: subagent drawer, same-session notification filtering, completion dedupe, no-description suppression.
- `apps/silvercode/tests/queue-batching.test.tsx`: second prompt before provider `turn-start` queues; explicit queue flush does not bypass an unstarted outbound turn.
- `apps/silvercode/tests/visual/prompt-submit-latency.test.tsx`: Enter clears composer before backend dispatch blocks the UI.
- New projection contract tests under `apps/silvercode/tests/chat-projection*.test.ts`: cover the same behaviors without rendering React.

Close criteria:

- `SessionUpdateList` no longer decides replay-boundary placement, same-session notification ownership, or subagent/tool activity identity.
- There is one documented projection path from provider events and notification observations to render items.
- Drawer and transcript derive subagent activity from the same domain projection, not separate component-local filters.
- Provider-specific gaps are explicitly represented in metadata. If a provider cannot supply subagent/tool start/end time, the model records that absence instead of guessing duration.
- Focused silvercode tests pass for projection, queue, notification-block, content-layout, and prompt-submit latency.

Vocabulary audit (2026-05-07):

Canonical nouns to use:

- `AgentEvent`: provider-neutral event emitted by `agent-harness`. This is not a render model and not a chat transcript row.
- `ChatEvent`: canonical chat-domain event after provider/raw input normalization. This is the event log Silvercode should project from.
- `ChatMessage`: durable transcript message in the chat-domain model. It owns role, part ids, and source event ids; it is not a renderer row.
- `ChatMessagePart`: typed content inside a `ChatMessage`: text, reasoning, attachment, or tool reference.
- `ChatPrompt`: user-authored input unit that has not yet been committed to transcript history. It should map closely to the agent prompt payload. It may be queued or already submitted to the backend but still editable/cancellable if it has not become a `ChatMessage`.
- `ChatPromptQueue`: ordered collection of pre-transcript `ChatPrompt`s: queued, submitted, editable, or cancellable prompts that are still not history. This replaces the overly generic `ChatQueue` when the queue is specifically the user's prompt queue.
- `ChatTool`: chat-domain record for a tool lifecycle derived from tool-related `ChatEvent`s.
- `ChatSession`: read model over `ChatEvent`s: messages, message parts, tools, plan, queue, permissions, channels, and projection state.
- `TurnBoundaryEvent`: if needed, a name for `turn-start` / `turn-end`-like input facts from the harness/provider. This is an event fact, not a durable `ProviderTurn` entity. ACP and some providers synthesize this boundary from prompt/request lifecycle; do not promote it to a core noun unless the provider really exposes a durable turn id with semantics we need.
- `Exchange`: presentation-only grouping used by components such as `SessionExchangeDivider`. It is an idle-delimited visual boundary, not provider state and not a core persisted/domain object.
- `SessionState`: reducer-owned harness state for one provider session. It may contain compatibility projections like `MessageEntry.text`, but it is not the final UI projection.
- `TranscriptMessage`: durable conversation content owned by the session transcript.
- `MessageOp`: ordered operation inside a harness `MessageEntry`. Keep this while it is the harness public surface; if moved into chat-domain code, prefer `TranscriptOp` or `TranscriptMessagePart` to avoid conflict with `ChatMessagePart`.
- `ToolCall`: raw/provider invocation. `ToolActivity`: chat-domain lifecycle/render concept derived from a tool call plus status/result metadata.
- `SubagentActivity`: chat-domain activity for a Task/Agent-style local agent running under the current session.
- `Subsession`: only use for a navigable local-agent session with its own session id, stream, replay/load semantics, and selectable view. Do not use it for a mere Task tool row or notification.
- `NotificationStreamEntry`: raw event admitted from a side channel.
- `NotificationObservation`: chat-domain/render concept for a notification that should appear in transcript/history.
- `ReplayBoundary`: domain marker between loaded/persisted replay and live activity.
- `SessionLifecycleMarker`: render/domain marker like "Session resumed", spawn, end, interrupt, or recover.

Naming rules:

- Use `subagent` as one word in filenames/types/functions (`SubagentActivity`, `subagentActivityFromTool`, `SubagentExchange`). Avoid mixed `SubAgent`.
- Use `debug` as the channel id and "Debug" only as the UI label.
- Use `ChatEvent` / `ChatMessage` / `ChatMessagePart` for the core chat model. Do not invent parallel state nouns when the existing model already has the concept.
- Use `ChatPrompt` until the prompt is committed to transcript history. Submitting to the backend may change its status, but does not by itself turn it into a `ChatMessage`.
- Remove a `ChatPrompt` from `ChatPromptQueue` when it becomes a user `ChatMessage`, is cancelled, or fails permanently. Do not keep a prompt object around just to correlate it to transcript history.
- Use `ChatPromptQueue`, not `ChatQueue`, for queued user prompts. Reserve any generic `Queue` noun only for a truly generic infrastructure queue.
- Avoid `ProviderTurn` as a canonical type name. Use concrete event names (`turn-start`, `turn-end`, `message.started`, `message.completed`) or `TurnBoundaryEvent` when describing boundary facts.
- Use `Exchange` only for presentation grouping. It should not own lifecycle, persistence, queue policy, or provider semantics.
- Use `NotificationObservation` when the thing is visible/considered by chat projection; use `NotificationStreamEntry` only for the raw channel stream.
- Use `Activity` only for work/lifecycle rows, not for every non-message item.
- Use `RenderItem` only with a domain prefix (`ChatRenderItem`, `TranscriptRenderItem`). Bare `Item` / `RenderItem` is not acceptable outside tiny local render helpers.

Prompt lifecycle model:

- `ComposerDraft`: ephemeral text in the input component. This is not chat-domain state until the user submits or explicitly queues it.
- `ChatPrompt`: pre-transcript user input. It can be edited/cancelled while Silvercode still owns it. If a backend exposes real prompt queue management, it can also represent a backend-owned queued prompt, but only with a provider queue id/capability metadata.
- `ChatPromptQueue`: ordered visible set of pre-transcript prompts. It is not the transcript and should not contain generic notification/channel work.
- `PromptSubmission`: handoff attempt from Silvercode to the agent. This is a lifecycle transition, not necessarily a durable domain object.
- `AgentPromptQueue`: optional provider-owned queue if the backend exposes list/edit/cancel semantics for accepted-but-not-yet-processed prompts. Do not assume this exists just because stdin or an RPC waiter buffers something.
- `ChatMessage` with role `user`: transcript/history representation after the prompt is committed or observed. At this point the `ChatPrompt` leaves `ChatPromptQueue`; editing becomes transcript editing, not prompt queue editing.

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

Rename candidates:

- `apps/silvercode/src/chat-model.ts` should either be folded into `chat/projection` or renamed to a narrower file such as `chat/transcript-ops.ts`. The current name is too broad and overlaps with `chat/types.ts`.
- `apps/silvercode/src/chat/project-transcript.ts` currently returns a `ChatTree`; rename the file/function to match the output if that path survives: `project-render-tree.ts` / `projectChatRenderTree`, or replace it with `projectChatRenderItems`.
- `ChatQueue`, `ChatQueueItem`, and `ChatQueueItemId` should become `ChatPromptQueue`, `ChatPrompt`, and `ChatPromptId` if the state represents queued/submitted-but-not-yet-history user prompts. `ChatPrompt` exists only before transcript commitment; after that, the relevant domain object is the resulting user `ChatMessage`.
- `ChatTree`, `ChatNode`, and `ChatLeaf` should become `ChatRenderTree`, `ChatRenderNode`, and `ChatRenderLeaf` if the tree remains. If the long-term UI is a list, replace them with `ChatRenderItem`.
- `ChatSessionProjectionStore` can stay short-term, but the factory should become `createChatProjectionStore` once the store owns the canonical projection rather than only the experimental tree.
- `chat/activity-snapshot.ts` should become `chat/current-turn-activity.ts` if it continues to intentionally filter to messages after the latest user prompt. Rename `chatActivitySnapshotFromMessages` to `projectCurrentTurnActivity`.
- `SessionUpdateList` should become `ChatTranscriptList` or `TranscriptRenderList` after projection extraction. The current name is protocol-shaped and hides that it renders projected transcript, lifecycle, notification, and activity rows.
- `ActivityItem` in `SessionUpdateList` should become `LiveActivityTail`.
- `NotificationItem` should become `NotificationObservationGroup`.
- `AssistantActivitySlice` should become `AssistantToolActivitySegment` or `AssistantActivitySegment` depending on whether reasoning remains included.
- `SessionMetadataItem` should become `SessionLifecycleMarkerItem` or `ReplayBoundaryItem`; metadata is too vague for visible rows.
- `SubAgentExchange.tsx` should be renamed to `SubagentExchange.tsx` unless it becomes a navigable local-agent session view, in which case use `SubsessionExchange.tsx`.
- `TurnActivitySummary` should be reviewed after projection extraction. If it summarizes activity attached to one `ChatMessage` / assistant response, rename toward `MessageActivitySummary`; if it summarizes a visual exchange, rename toward `ExchangeActivitySummary`. Do not keep `Turn` unless the component is explicitly about harness/provider turn-boundary events.

What happened to the clearer model:

- The clearer model exists in `apps/silvercode/src/chat/types.ts`: `ChatEvent`, `ChatMessage`, `ChatMessagePart`, `ChatTool`, `ChatSession`, `ChatTree`, `ChatLeaf`.
- It is exercised by `apps/silvercode/src/chat/store.ts`, `apps/silvercode/src/chat/project-transcript.ts`, `apps/silvercode/tests/chat-session-store.test.ts`, and `apps/silvercode/tests/chat-transcript-projection.test.ts`.
- It did not become the production transcript renderer. `ChatPane` still renders the legacy `SessionUpdateList` over harness `SessionState.messages` / `MessageEntry[]`, and only shows the projected `ChatBlockList` under Debug comparison.
- Recent screenshot fixes landed in that legacy path because it was the user-visible path. That improved behavior but added more renderer-local ownership for replay boundaries, notification filtering, subagent activity identity, grouping, and spacing.
- The plateau move is therefore not to invent `ProviderTurn` / `Exchange` as new domain state. It is to finish the migration so production rendering uses the existing `ChatEvent` -> `ChatSession` -> projection model, with presentation-only exchange boundaries added at the edge.

Progress:

- Added regression coverage for the latest screenshot cluster:
  - parallel Task/Agent lifecycle events are not dropped;
  - all-completed subagents no longer leave the drawer in an active state;
  - no-description/agentId-only subagent notifications do not leak inline;
  - live prompts submitted during resume replay stay below the Session resumed divider, including when replayed messages have not rendered yet;
  - completed Agent/Task transcript rows show the result text while the drawer keeps the stable task label.
- Stopped debouncing subagent lifecycle events. These are state transitions, not ambient notification noise; dropping them caused missing agents and stale active counts.
- Moved `NotificationStreamEntry` usage to the stream module instead of treating the row component as the source of the stream type.
- Renamed the shared disclosure component from `ChatEntryDisclosure` to `EntryDisclosure`; `ChatEntry*` no longer appears in Silvercode source/tests/storybook.
- Replaced ambiguous `NotificationBlockWorkDetail` terminology with `SubagentActivity` / `BackgroundShellActivity`-oriented types in the notification block path.
- Extracted current-turn agent/shell derivation to `apps/silvercode/src/chat/activity-snapshot.ts`, so the drawer reads a chat-domain activity snapshot instead of a `NotificationBlock` helper.
- Fixed the latest screenshot regressions:
  - `Session resumed` now stays above live prompts/activity even when timestamp ordering puts the replay boundary after live rows.
  - Tool-derived subagents and notification lifecycle rows merge by tool id, so the drawer does not show duplicate `Sleep #2` rows.
  - Same-session subagent starts/progress remain hidden outside Debug, but terminal completion notifications remain visible as history when no matching tool-result row exists.
  - Subagent completion notifications no longer numeric-group distinct labels like `#1`, `#3`, and `#4` into a single `(3x)` row.
  - Active status markers now share a synchronized pulse, and activity-summary live-preview tool rows render steady so only the top-level `Using tools...` row pulses inside that block.
  - Hardened subagent identity against reused/misreported `toolUseId` values: meaningful labels now win over provider ids for drawer identity, and same-session completion hiding only suppresses a notification when both the tool id and label match.
  - Subagent lifecycle observations no longer depend on ambient-notification admission: the notification stream breaker does not drop `subagent-status` events, and the agents drawer reads the unmuted journal while inline notification rows still respect source mutes.

Remaining:

- `SessionUpdateList` still has generic local names like `Item`, `RenderItem`, and `NotificationItem`; these should become transcript-specific names once the projection boundary is extracted.
- `ChatLeaf` / `ChatNode` naming still reflects the experimental projected transcript tree. Decide whether that model remains or whether the legacy `SessionUpdateList` projection subsumes it.
- The current fixes still compensate in the legacy renderer/filter path. The plateau move remains to make subagent lifecycle, replay boundaries, and notification observations first-class projected chat-domain events before they reach `ChatPane`.
