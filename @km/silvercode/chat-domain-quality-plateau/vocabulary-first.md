---
aliases:
  - km-silvercode.chat-domain-vocabulary-first
  - km-silvercode-chat-domain-vocabulary-first
created_at: 2026-05-07T20:11:16Z
type: task
priority: P0
status: wip
parent: "@km/silvercode/chat-domain-quality-plateau"
---

# [/] Phase 0: vocabulary-first chat domain refactor #P0

Lock the target chat vocabulary before code migration. Every later L5 phase uses this language; no phase should introduce new names that conflict with the model in `apps/silvercode/docs/chat-session-model.md` and `apps/silvercode/docs/chat-state-machines.md`.

## Goal

Make the naming rules boring and stable:

- `Agent*` means cross-backend runtime surface.
- `Acp*`, `Claude*`, `Codex*`, and `OpenCode*` mean exact source/protocol shape only.
- `Chat*` means Silvercode-owned chat-domain state, control, or projection.
- `Chat.X` means a UI component in the chat component namespace.

## Target Vocabulary

- `ChatBlock` replaces `ChatMessagePart`.
- `ChatPlanStep` replaces plan entry/task names in the chat domain.
- `ChannelNotification` names side-channel input before normalization.
- `ProtocolNotification` names protocol/transport notifications when the mechanism matters.
- `ChatNotification` names normalized notification facts admitted into chat-domain state.
- `AgentBackend` names selectable/runnable agent sources.
- `AgentConnection` names one live agent session.
- Parser/normalizer names replace translation-only adapter names.
- Generic `ChatRun` is not a target noun; use `ChatJob`, `ChatActivity`, `ChatTool`, or a specific subtype.

## UI Namespace

The target chat UI composition is:

```tsx
<Chat.Pane>
  <Chat.Header />
  <Chat.Session />
  <Chat.Composer />
</Chat.Pane>
```

Component files export direct names and props, then namespace them directly:

```ts
export const Chat = { Pane, Header, Session, Composer } as const
```

## Replacement Map

- `ChatMessagePart` -> `ChatBlock`
- `ChatMessagePartId` -> `ChatBlockId`
- `AgentPlanEntry` / `ChatPlanEntry` / `ChatPlanTask` -> `ChatPlanStep`
- `AgentPlanEntryId` / `ChatPlanTaskId` -> `ChatPlanStepId`
- `NotificationStreamEntry` -> `ChannelNotification` before normalization, `ChatNotification` after admission.
- `Provider*` -> `Agent*`
- selectable/runnable `*Adapter` names -> `*Backend`
- translation-only `*Adapter` names -> `*Parser` or `*Normalizer`
- `Chat.Transcript` -> `Chat.Session`
- `Chat.Turn.*` -> rendered concept names: `Chat.Message`, `Chat.Block`, `Chat.Tool`, `Chat.Activity`, `Chat.Summary`.
- `Exchange*` -> message/span/summary/activity names by actual scope.

## Definition of Done

- [x] Evergreen docs describe the target model in present tense with vocabulary-first naming.
- [x] The quality plateau bead lists Phase 0 before implementation phases.
- [x] L5 child beads reference the vocabulary baseline and use `ChatBlock`, `ChatPlanStep`, `ChannelNotification`, `ProtocolNotification`, and `Chat.Pane/Header/Session/Composer`.
- [x] Replacement-map references are explicit `old -> new` work items; current-code caveats stay out of evergreen docs.

## Complete Criteria

- `rg -n "NotificationStreamEntry|ChatMessagePart|ChatPlan(Task|Entry)|Chat\\.Transcript|Chat\\.Turn|Provider\\*" apps/silvercode/docs @km/silvercode/chat-domain-quality-plateau --glob '*.md'` returns hits only in replacement-map or compatibility sections.
- `rg -n "Chat\\.Pane|Chat\\.Header|Chat\\.Session|Chat\\.Composer|ChatBlock|ChatPlanStep|ChannelNotification|ProtocolNotification" apps/silvercode/docs @km/silvercode/chat-domain-quality-plateau --glob '*.md'` shows the target vocabulary in the evergreen docs and plateau bead.

## Notes

- Reopened by `/complete`: local acceptance appears satisfied, but `origin/main` does not yet contain the vocabulary-first bead/docs, so closure does not pass origin/main acceptance greps.
