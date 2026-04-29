---
id: "@km/silvery/wide-char-incr-render"
aliases:
  - km-silvery.wide-char-incr-render
  - km-silvery-wide-char-incr-render
created_by: claude:cc081a9a
created_at: 2026-04-26T20:48:25Z
closed_at: 2026-04-26T22:43:14Z
close_reason: Closed
---

# [x] Wide-char incremental render duplicates new emoji when prev frame had wide char in same vicinity @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

## Symptom

When a board card row contains a wide character (emoji like 🛒, 🇯🇵, ✈️) and the user navigates such that the row content changes — replacing one wide char with another at a slightly different column — silvery's incremental output phase produces a duplicated render vs the fresh buffer.

Concrete failure (`apps/km-tui/tests/card-rendering.slow.test.ts:1189` "wide chars with extensive navigation"):

- Previous frame breadcrumb: `📁 board > Tasks > Buy groceries 🛒` (🛒 wide=true at col 34, cont at col 35)
- Next frame breadcrumb: `📁 board > Goals > Learn Japanese 🇯🇵` (🇯🇵 wide=true at col 35, cont at col 36)
- Incremental output emits 🇯🇵 at col 34 (where 🛒 was), then 🇯🇵 again at col 35 — ending with `🇯🇵🇯🇵` while fresh has just one 🇯🇵.

STRICT_OUTPUT diagnostic:
```
prev='🛒'(w=true,c=false) next=' ' incr=' 🇯🇵' fresh=' 🇯🇵'
col 35: prev=''(w=false,c=true) next='🇯🇵' incr='🇯🇵' fresh=' ' wide=true cont=false
```

## Root cause hypothesis

silvery output-phase wide-char invalidation: when a wide char at col N in the previous buffer is replaced (by space + new char shifted by 1), the diff/output algorithm writes the new wide char at the OLD wide char's column AND at its proper new column. The continuation cell at col N+1 doesn't get properly cleared/synced, leading to a phantom duplicate.

## Repro

bun vitest run --project=slow apps/@km/tui/tests/card-rendering.slow.test.ts -t "emoji content garble"

Test exists; failing currently. SILVERY_STRICT_OUTPUT catches the mismatch.

## Where to look

vendor/silvery/packages/ag-term/src/pipeline/output*.ts — the diff phase that compares prev buffer to next buffer and emits ANSI runs. Specifically the wide-char + continuation-cell handling when a wide char at column N is replaced by a non-wide char (or by a wide char shifted by 1).

## Acceptance

- card-rendering.slow.test.ts emoji navigation test passes
- No regression in other wide-char tests
- Document fix + invariant in vendor/silvery/packages/ag-term/src/pipeline/LESSONS.md

## Notes

Surfaced 2026-04-26 during @km/all/fix-sweep-card-borders investigation. Distinct cluster from the body-card border / date-badge issues fixed in that bead.