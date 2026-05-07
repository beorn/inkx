---
id: "@km/silvercode/remove-legacy-design-tokens"
aliases:
  - km-silvercode.remove-legacy-design-tokens
  - km-silvercode-remove-legacy-design-tokens
created_at: 2026-05-01T05:44:33.822Z
type: task
priority: P1
---

# [/] Remove legacy design tokens from Silvercode UI

## Problem

Silvercode currently mixes legacy surface/background tokens with the Sterling `$bg-surface-*` design-token family. That makes UI choices harder to reason about and causes subtle visual drift between command boxes, user prompt bubbles, code blocks, popovers, side panels, and tool/activity rows.

Legacy examples observed in current code:

- `$surfacebg`
- `$mutedbg`
- `$bg-surface`

## Direction

Standardize Silvercode on the Sterling surface vocabulary:

- `$bg-surface-subtle` — quiet structural surfaces, dimmed panes, side panels, grouped marker columns, low-emphasis blocks.
- `$bg-surface-raised` — input/bubble/card surfaces such as the command composer and user prompt bubble.
- `$bg-surface-overlay` — popovers, menus, and surfaces that float above the transcript.
- `$bg-surface-hover` — clickable row hover state.
- `$bg-surface-default` — explicit normal surface when raw `$bg` is not appropriate.

## Acceptance Criteria

- [ ] No Silvercode source/test/story files use `$surfacebg`, `$mutedbg`, or `$bg-surface` except in migration notes or explicit compatibility tests.
- [ ] Existing UI surfaces are mapped intentionally to `$bg-surface-subtle`, `$bg-surface-raised`, `$bg-surface-overlay`, `$bg-surface-hover`, or `$bg-surface-default`.
- [ ] Code blocks, command composer, user prompt bubbles, activity summaries, side panel rows, and popovers use consistent token semantics.
- [ ] Focused visual/layout tests cover at least the command composer, user prompt bubble, markdown code block, side panel hover row, and activity summary hover/expanded row.
- [ ] Run targeted Silvercode visual/layout tests and include evidence before closing.

## Candidate Files

- `apps/silvercode/src/components/SyntaxHighlighter.tsx`
- `apps/silvercode/src/components/AvailableCommandsPalette.tsx`
- `apps/silvercode/src/components/SubagentActivityPanel.tsx`
- `apps/silvercode/src/components/PaneHeader.tsx`
- `apps/silvercode/src/components/SessionPromptComposer.tsx`
- `apps/silvercode/src/components/SessionUpdateList.tsx`
- `apps/silvercode/src/components/ChatMessageSummary.tsx`
- `apps/silvercode/src/components/SidePanel.tsx`

