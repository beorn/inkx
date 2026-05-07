# Silvercode Chat Session Model

Silvercode separates adapter/runtime facts from canonical chat events and transcript-tree projection.

This document describes the current session-state model. New transcript presentation work should use the `@km/silvercode/claude-code-transcript-parity` bead as the target model:

```text
AgentEvent -> ChatEvent -> apply(ChatEvent) -> ChatState -> projectChatTranscript(...) -> ChatSession.tree
```

Per the refactor workflow, migrate legacy vocabulary before implementing new presentation behavior. Rename docs, tests, stories, fixtures, and touched source first; then add `apps/silvercode/src/chat/types.ts`, ChatEvent normalization, ChatTree projection, channels, and ChatLeaf renderers.

## Canonical Session State

The canonical state is an ordered session stream:

- `MessageEntry` for user, assistant, and system text/content.
- `MessageOp` for text, thinking, raw payloads, and tool calls.
- `AgentPlan` for the current session-scoped plan.
- Permission, usage, lifecycle, notification, and error updates as session-level records.

Source ids stay source-specific. Claude message/jsonl UUIDs are message provenance. Codex `turn_id`, when present, is provider provenance. ACP does not define a canonical turn id. New canonical model fields should not use `turnId`.

`MessageEntry` and `MessageOp` are current implementation names, not the target vocabulary for new transcript presentation. New work should migrate toward `ChatMessage`, `ChatMessagePart`, `ChatEvent`, `ChatNode`, `ChatElement`, `ChatLeaf`, and `ChatTree` in a dedicated rename phase before changing renderer behavior.

## Silvercode Chat Turns

`Chat.Turn.*` is UI vocabulary. A Silvercode chat turn is an idle-delimited presentation group, not one prompt plus one response.

A turn can contain multiple prompts, assistant messages, tool/activity spans, plan updates, permission requests, notifications, and summary/stat blocks. Blocks inside a turn are peers ordered by stream time; the UI may place nearby activity after narration for readability, but that does not imply prompt ownership.

Use `turnKey` only as a UI projection key. It is derived from canonical session-event ids and can change if projection rules change.

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
