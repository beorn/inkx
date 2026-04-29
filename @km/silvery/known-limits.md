---
id: "@km/silvery/known-limits"
aliases:
  - km-silvery.known-limits
  - km-silvery-known-limits
created_by: claude:cc081a9a
created_at: 2026-04-26T22:13:59Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.known-limits
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T15:15:04Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] Silvery known limits — sweep and fix all @km/silvery #task #P2

blocks:: [[@km/silvery]]

Tracking epic for silvery's documented .skip / TODO / 'known limitation' markers found via 2026-04-26 audit.

## Real limits (in scope for fix)

### A. Strikethrough propagation through nested Text
File: vendor/silvery/tests/features/nested-text-styles.test.tsx:80
Skipped test asserts strikethrough cell-level propagation. Underline propagates correctly (passes); strikethrough doesn't. Likely missing in attribute-merge code.

### B. Sixel PNG decoder integration
File: vendor/silvery/packages/ag-react/src/ui/image/Image.tsx:155
Image component supports Kitty graphics protocol (PNG passthrough) but Sixel only works with pre-decoded RGBA pixel data. PNG → Sixel requires a PNG decoder. Document or implement.

### C. Output hybrid pipeline phase 2 (TODO cluster)
Files:
- vendor/silvery/packages/ag-term/src/pipeline/output-density.ts:89,122
- vendor/silvery/packages/ag-term/src/pipeline/output-modes.ts:76,116,157
Multiple TODO(hybrid-output phase 2): implement markers. Phase 2 work needs scoping.

### D. verifyTerminalEquivalence inline-mode coverage
File: vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts:1428
Comment: 'verifyTerminalEquivalence (xterm/ghostty) is skipped for inline mode.' Test coverage gap for inline-mode terminal-equivalence verification.

### E. sendInput async-event tests require act() rewrite
File: vendor/silvery/tests/features/key-release.test.tsx:340,362
Two skipped tests for Kitty modifier-only key sendInput. Test infra issue: sendInput flows through async event loop (processEventBatch), React doesn't flush useSyncExternalStore updates outside act() in IS_REACT_ACT_ENVIRONMENT=true. Works in production. Need a test harness that wraps async pump in act().

## NOT bugs (intentional, kept for documentation)

- vendor/silvery/tests/features/wrap-nested-flexgrow.test.tsx:201 — documents correct CSS sizing (column→row→wrap-text without root height collapses to 1 row). Comment says 'KEEP THIS TEST SKIPPED'. Intentional pitfall documentation.
- vendor/flexily/tests/yoga-comparison.test.ts:672 — documents intentional Flexily extension over Yoga (auto-margin centering of absolute children matches CSS). Intentional difference docs.

## Acceptance
- All 5 child beads (A-E) closed or each has its own child plan
- grep '.skip' in vendor/silvery/tests excluding KEEP/intentional comments returns 0 unintentional skips