---
aliases:
  - km-silvery.listview-index-scroll-baseline
  - km-silvery-listview-index-scroll-baseline
created_at: 2026-05-05T23:22:43.570Z
_stub: true
---

Implemented narrow baseline fix: index virtualization now uses layout scrollState.offset as rowsAboveViewport only when row-space scroll owns the viewport; cursor bootstrap keeps virtualizer row baseline. Added regression coverage in vendor/silvery/tests/ui/list-view-visible-content-anchoring.test.tsx. Verification: vendor ListView focused suites 45 tests pass; vendor/silvery typecheck passes. Root npx tsc still fails on unrelated fractional mouse / km-tui typing WIP.

Follow-up after live repro: log showed renderScrollRow 463.84 while scrollRow was 474, then scrollRow rewrote to 464. Initial fix disabled visible-content anchoring while explicit row scroll owned the viewport. That policy was later superseded: active wheel/trackpad scroll now keeps visible-content anchoring enabled and threads the active scroll direction through anchoring, so measurement churn can preserve visible content without accepting opposite-direction corrections. Verification: focused ListView suites and vendor/silvery typecheck passed.

Follow-up: scrollbar drag from bottom should disengage follow=end. Scrollbar now marks onScrollOffsetChange calls from drag with {dragActive:true}; ListView passes rearmFollowAtEnd=false for those and clears followActiveRef as well as pendingFollowSnapRef. Added follow=end termless regression: mousedown on bottom thumb and drag up moves away from tail. Verification: 4 focused suites 58 tests pass; vendor/silvery typecheck passes.

