---
id: "@km/silvery/diff-code-accordion"
aliases:
  - km-silvery.diff-code-accordion
  - km-silvery-diff-code-accordion
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:20Z
started_at: 2026-04-26T16:27:53Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvery.diff-code-accordion
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T08:37:51Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [/] silvery primitives — Diff, Code (tree-sitter), Accordion, LineNumber @km/silvery #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvery]]

Add silvery primitives that the silvercode chat surface needs.

## Phase 1 (this bead) — Accordion, LineNumber, basic Diff (no syntax highlighting)
- <Accordion> / <Collapsible> — single-section collapsible card with header + body, focusable, keyboard expand/collapse (Enter/Space)
- <LineNumber> — render a line number in a styled gutter column
- <Diff> — unified diff rendering with +/- markers and line numbers; v0 has NO syntax highlighting (raw text)

## Phase 2 (split bead @km/silvery/code-tree-sitter)
- <Code> + tree-sitter highlighting pipeline
- <Diff> upgraded to highlight added/removed lines once <Code> ships

## Estimated LOC for Phase 1: ~400-600
## Estimated LOC for Phase 2: ~600-1000

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 0 bead 1.