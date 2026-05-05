# Silvercode Chat Session Model

Silvercode separates provider facts from presentation grouping.

## Canonical Session State

The canonical state is an ordered session stream:

- `MessageEntry` for user, assistant, and system text/content.
- `MessageOp` for text, thinking, raw payloads, and tool calls.
- `AgentPlan` for the current session-scoped plan.
- Permission, usage, lifecycle, ambient, and error updates as session-level records.

Provider ids stay provider-specific. Claude message/jsonl UUIDs are message provenance. Codex `turn_id`, when present, is provider provenance. ACP does not define a canonical turn id. New canonical model fields should not use `turnId`.

## Silvercode Chat Turns

`Chat.Turn.*` is UI vocabulary. A Silvercode chat turn is an idle-delimited presentation group, not one prompt plus one response.

A turn can contain multiple prompts, assistant messages, tool/activity spans, plan updates, permission requests, notifications, and summary/stat rows. Entries inside a turn are peers ordered by stream time; the UI may place nearby activity after narration for readability, but that does not imply prompt ownership.

Use `turnKey` only as a UI projection key. It is derived from canonical entry ids and can change if projection rules change.

## Plans

`AgentPlan` is session-scoped:

- Claude `TodoWrite` snapshots normalize to `source: "claude-todowrite"`.
- ACP `sessionUpdate: "plan"` normalizes to `source: "acp-plan"`.
- Codex `plan_update` / `plan_delta` normalizes to `source: "codex-plan"` when entries are present.

The old `state.todos` surface is a compatibility projection from `state.plan.entries`. New UI should read `state.plan`.

The active plan renders above the composer as an in-session drawer. The side panel may show a count, but it is not the primary plan surface.
