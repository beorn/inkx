---
id: "@km/silvery/column-resize-incremental-mismatch"
aliases:
  - km-silvery.column-resize-incremental-mismatch
  - km-silvery-column-resize-incremental-mismatch
created_by: claude:da9990c5
created_at: 2026-04-28T19:00:51Z
---

# [ ] Strict-mode incremental-vs-fresh mismatch on column-height resize after card-overflow fix @km/silvery #bug #P2

blocks:: [[@km/silvery]], [[@km/tui/focused-card-overflow]]

Triggered by @km/tui fix for focused-card overflow (CardColumn.tsx columnHeight-aware expandedRowBudget). Resizing the terminal now changes columnHeight → baseMax → card render output, exposing a latent dirty-flag-propagation gap in vendor/silvery/packages/ag-term/src/pipeline/render-sink.ts:226.

Symptom: apps/@km/tui/tests/resize-garble.slow.test.ts:200 'zoom in then zoom out roundtrip' fails under SILVERY_STRICT=1 with an incremental-vs-fresh cell mismatch at (41, 2) — column header area. Pixel content is correct under SILVERY_STRICT=0; only the strict invariant is violated.

Pipeline-level fix required (silvery agent only — never edit pipeline files directly per CLAUDE.md).

Reproduce:
  SILVERY_STRICT=1 bun vitest run --project slow apps/@km/tui/tests/resize-garble.slow.test.ts -t 'zoom in then zoom out'