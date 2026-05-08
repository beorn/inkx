---
aliases:
  - km-silvercode.chat-lifecycle-projection-l5
  - km-silvercode-chat-lifecycle-projection-l5
created_at: 2026-05-07T20:06:42.805Z
dependencies:
  - issue_id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau/chat-lifecycle-projection-l5"
    depends_on_id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau/vocabulary-first"
    type: blocked-by
    created_at: 2026-05-07T20:11:16Z
    created_by: codex
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau/vocabulary-first"
---

# L5: make Silvercode chat lifecycle/projection bugs impossible #P0

Get Silvercode chat lifecycle/projection to L5 for the recurring stuck-thinking, leaked prompt echo, missing subagent, duplicate activity summary, notification duplication, and lifecycle-marker ordering bug class. Vocabulary changes happen first, then code migration follows the stable target terms. The target design is one ownership path: `AgentEvent` / `ChannelNotification` / `ProtocolNotification` -> `ChatEvent` -> `ChatSession` -> `ChatTree` -> `Chat.Pane`. Agent/source quirks end at normalization; render components do not infer source, session, activity, notification, or lifecycle semantics from compatibility transcript entries, status fields, channel notifications, protocol notifications, or raw agent events.

Seeded from 2026-05-07 /big after fixes 14b1668ca and 13e5e351b. Current state is roughly L3 with L2/L3 guards; target is L5: old workaround paths deleted, invariant/property/replay tests cover the class.

## Problem

Silvercode has the right target model on paper, but the implementation still has parallel ownership paths:

- agent backends and protocol glue can still settle or echo lifecycle facts incorrectly before chat normalization owns them;
- `SessionStore.state.messages` / `MessageEntry` is still treated as a render model in legacy UI paths;
- `SessionUpdateList` synthesizes live activity rows from `status + inFlightTool`;
- notification filtering and subagent activity merging still have side-channel heuristics;
- lifecycle markers, activity summaries, drawer rows, and transcript rows can be projected by different code paths.

This is why the same class keeps reappearing as different symptoms: stuck thinking, prompt echoes under history, missing subagents, duplicate `Using tools...` rows, notification duplication, and session-resumed marker ordering bugs.

## Target Shape

One ownership path:

```text
AgentEvent / ChannelNotification / ProtocolNotification
  -> ChatEvent
  -> ChatSession
  -> ChatTree
  -> Chat.Pane
```

Agent/source quirks end at normalization. `ChatSession` owns durable state. `ChatTree` owns visible projection, grouping, lifecycle placement, channels, and summaries. Components render `ChatTree` and do not infer source/session/activity semantics from compatibility transcript entries, status fields, `ChannelNotification`, `ProtocolNotification`, or `AgentEvent`.

## Vocabulary Baseline

This bead depends on the vocabulary-first phase in `@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau/vocabulary-first`.

- `ChatBlock` is the typed content unit. Do not add new `ChatMessagePart` surfaces.
- `ChatPlanStep` is one ordered item in a `ChatPlan`. Do not add `ChatPlanEntry` or `ChatPlanTask`.
- `ChannelNotification` is pre-normalization side-channel input. `ChatNotification` is the normalized chat-domain fact.
- `ProtocolNotification` is protocol/transport mechanics. Use `Acp*`, `Claude*`, or `Codex*` only for exact source shapes.
- `AgentBackend` is a selectable/runnable agent source. `AgentConnection` is one live session. Translation pieces are parsers or normalizers, not domain adapters.
- `Chat.Pane` is the visible UI frame. It contains `Chat.Header`, `Chat.Session`, and `Chat.Composer`.

## Non-Negotiable Invariants

- Source `tool_use` / intermediate stop reasons cannot close a Silvercode-owned running job/span.
- Live ACP/Claude user-message echoes cannot become transcript user messages while a local prompt is agent-owned.
- `ChatMessage`, `ChatTool`, `ChatPermission`, `ChatJob`, `ChatSpan`, and `ChatSubagentActivity` lifecycles have closed transition tables.
- `ChatToolId` is unique per session: one start, zero or one terminal result.
- Tool completions without known starts become diagnostics/debug facts, not normal activity.
- One visible activity summary owner per span. A synthetic live tail cannot render when real running tool activity exists.
- Subagent drawer rows are derived from tool/activity lifecycle facts; notifications may annotate but cannot invent canonical identity.
- Assistant narration remains transcript prose; it cannot change subagent drawer cardinality or fabricate rows.
- Background jobs do not keep the foreground `ChatSpan` open.
- Interrupted/abandoned output routes to debug/provenance unless the adapter confirms it is still owned by active chat state.
- Every visible non-debug leaf has an owning `ChatEvent` or an approved keyed synthesis rule.

## Must Cover These Regressions

- `f9eb64dc-d982-4a46-9a8e-da5fd882ac5f`: `use 4 subagents to sleep 20s` shows the structured subagent activities Claude actually emitted, preserves assistant prose as transcript text, and returns idle.
- Claude `stop_reason: "tool_use"` does not resolve ACP prompt or emit terminal turn completion.
- Live Claude/ACP user-message echoes do not leak subagent prompts into transcript.
- Same-session subagent notifications do not duplicate tool-owned Agent rows.
- `Using 4 tools...` cannot coexist with a synthetic `Using 1 tool...` row for the same current work.
- Session resumed marker stays before live prompt/activity rows.
- Late tool results after synthetic close/interruption do not re-stick status.
- Codex aggregate/streamed/interleaved tool activity projects through the same owner path.

## Implementation Plan

1. Move live activity tail synthesis into the chat-domain projection.
   - Input: `ChatSession + ChatShell/ChatSpan` state.
   - Output: keyed `ChatTree` leaf / approved synthesis node.
   - Delete component-local synthesis from `SessionUpdateList`.

2. Make the visible chat session render `ChatTree` instead of compatibility transcript entries as its source of truth.
   - Preserve visual behavior by adapting existing rows to leaves.
   - Keep legacy projection only behind temporary compatibility tests while migrating.
   - Delete `session-update-projection.ts` paths that duplicate `ChatTree` responsibilities.

3. Centralize notification admission.
   - Normalize `ChannelNotification` into `ChatEvent` or debug-only diagnostics before UI rendering.
   - Remove render-time notification/subagent filtering that re-implements merge rules.

4. Make subagent activity a chat-domain derived model only.
   - One row per tool-derived activity id.
   - Notifications annotate/settle only when explicit identity matches.
   - Narration claims stay transcript prose and never repair, invent, or diagnose missing lifecycle rows.

5. Close the state machines.
   - Add pure transition helpers for message/tool/job/span/permission.
   - Illegal transitions throw in strict/test mode and surface one diagnostic in relaxed mode.
   - Public status is derived from owned lifecycle facts, not last writer wins.

6. Harden provider normalization.
   - Claude: `tool_use` stop reason is nonterminal.
   - ACP: active prompt `user_message_chunk` is ignored or provenance-only.
   - Codex: `turn_id` is provenance, not `ChatSpan.key`.
   - OpenCode/Kilo: session/message/update streams normalize into the same contract.

7. Delete old workaround paths.
   - No component should read `AgentEvent`, `ProtocolNotification`, or `ChannelNotification` for visible chat semantics.
   - No component should synthesize activity summaries from `status + inFlightTool`.
   - No separate subagent drawer projection from compatibility transcript entries once `ChatTree` owns it.

8. Add enforcement.
   - Test helper `assertChatInvariants(session, tree)`.
   - Grep/lint gate for banned raw render-path imports/usages outside adapter/test allowlists.
   - Strict mode enabled in unit, replay, and CI tests.

## Test Plan

- Contract tests: `AgentEvent -> ChatEvent` for Claude, ACP, Codex, OpenCode/Kilo shapes.
- Transition tests: legal/illegal message, tool, permission, job, span transitions.
- Projection tests: `ChatEvent -> ChatSession -> ChatTree` for streaming, aggregate, tool-heavy, subagent, notification, resume, background, interruption scenarios.
- Replay fixtures: small anonymized real JSONL/NDJSON fixtures for the regressions above.
- Property/metamorphic tests:
  - split vs aggregate assistant messages produce equivalent final tree;
  - status/liveness/debug noise insertion does not change visible non-debug leaves;
  - delayed terminal events do not duplicate summaries or resurrect idle work;
  - invalid orphan/duplicate lifecycle events become diagnostics without mutating normal transcript.
- Visual/snapshot tests:
  - no duplicate `Using tools...` rows;
  - subagent drawer cardinality matches lifecycle count;
  - resumed marker ordering is stable;
  - stuck-thinking scenarios return idle or show a concrete diagnostic.

## Acceptance Checklist

- [ ] Live activity tail is projected from canonical chat state, not `SessionUpdateList` local synthesis.
- [ ] `Chat.Session` consumes `ChatTree` or a `ChatTree`-derived render model.
- [ ] Notification admission and filtering happen before projection, not in render components.
- [ ] Subagent drawer consumes canonical subagent activity state only.
- [ ] Legacy message-entry render/projection paths are deleted or quarantined behind explicit compatibility code.
- [ ] Strict chat invariant helper exists and is used by unit/replay tests.
- [ ] Replay fixtures cover Claude subagents, ACP prompt lifecycle, Codex interleaving, resume markers, and duplicate summaries.
- [ ] Property/metamorphic tests cover harmless reordering/splitting/noise insertion.
- [ ] Lint/grep gate prevents new raw render-path lifecycle/projection inference.
- [ ] Focused tests plus `bash packages/km-infra/scripts/typecheck/check.sh` pass.
- [ ] Close reason cites commits, tests, replay fixture counts, and deleted workaround paths.
