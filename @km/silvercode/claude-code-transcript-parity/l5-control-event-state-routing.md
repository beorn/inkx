---
id: "@km/silvercode/claude-code-transcript-parity/l5-control-event-state-routing"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-control-event-state-routing
  - km-silvercode-claude-code-transcript-parity-l5-control-event-state-routing
created_at: 2026-05-07T01:20:06.006Z
type: task
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: state-first handling for permission queue title recap hook and snapshot events #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Goal

Useful control records update owner state/UI instead of rendering as transcript noise.

## Work

- Permission mode updates change session permission-mode state/chrome.
- Queue operations reconcile with Silvercode queue state and render only when actionable/stuck/Debug-visible.
- Task reminders update plan/task state without duplicate transcript rows.
- File history snapshots are hidden by default and inspectable in Debug/history detail.
- Hook info is Debug-only unless failed/actionable; hook failures route to `error`.
- `custom-title` wins as session title; `ai-title` is stored as secondary metadata.
- Agent name/path/id render in session chrome/metadata, not transcript prose.
- `away_summary` becomes `recap.recorded` and renders as `RECAP · ...`.
- Usage/quota/status/liveness update status/sidebar state; visible rows only when useful.

## Acceptance

- Replay fixtures prove each handled control event updates its owner state.
- Handled records do not also render as ordinary assistant/user prose.
- Raw payload for every handled record remains inspectable via Debug/detail.

## Verification

- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts`

## Progress

- Permission mode raw records route to `session.updated` on `debug`, update `ChatSession.mode`, and do not render a standalone normal transcript block.
- `custom-title`, `agent-name`, and `ai-title` carry `titleSource`; custom title wins over agent/AI metadata.
- `custom-title` remains visible/status-owned so the title can be surfaced in chrome; agent/AI title metadata stays Debug/state-owned until the UI consumes it.
- Regression coverage:
  - `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-session-store.test.ts` — 8 tests passed.
