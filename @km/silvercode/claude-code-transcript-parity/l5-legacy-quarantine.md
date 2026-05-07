---
id: "@km/silvercode/claude-code-transcript-parity/l5-legacy-quarantine"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-legacy-quarantine
  - km-silvercode-claude-code-transcript-parity-l5-legacy-quarantine
created_at: 2026-05-07T01:20:10.803Z
type: task
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: delete or quarantine legacy MessageEntry routing behind ChatEvent adapters #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Goal

Remove the dual-path trap after projected ChatBlocks become primary.

## Work

- Delete old classification/render branches that compete with `ChatEvent -> ChatTree`.
- If `MessageEntry`/`MessageOp` remains for compatibility, isolate it behind a named adapter that emits ChatEvents.
- Remove direct transcript filtering by provider source, raw op kind, parser labels, or debug labels.
- Remove docs/tests/storybook examples that describe legacy `MessageEntry` as the primary transcript model.

## Acceptance

- Grep for direct UI routing by source/op-kind returns zero outside documented adapter-boundary files/tests.
- New transcript behavior cannot bypass ChatEvent -> ChatSession -> ChatTree.
- Any remaining legacy adapter has an explicit cleanup bead.

## Verification

- `rg -n "entry\\.source|op\\.kind === [\"']raw[\"']|kind === [\"']raw[\"']|source ===|muted\\.has\\(e\\.source\\)" apps/silvercode/src apps/silvercode/tests`
- `npx tsc --noEmit --pretty false`
