---
id: "@km/all/fix-sweep-vendor-fuzz"
aliases:
  - km-all.fix-sweep-vendor-fuzz
  - km-all-fix-sweep-vendor-fuzz
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:09Z
closed_at: 2026-04-27T05:10:10Z
close_reason: "All 14 child beads closed. Vendor: 49→0 failures (12040 tests
  pass). Fuzz: 5→0 failures (722 tests pass). Major fixes shipped: silvery
  clearExcessArea hasPrevBuffer guard (single root cause for
  incremental-mismatch + fuzz seed=1337), scrollTo same-intent recovery + iter
  cap, hybrid-output phase 3 wired with design constants, Bun.gc(true) memory
  fix, MCP plugin lease tracking on Bun, scope.test.ts AsyncDisposableStack
  rewrite, ag-react dev exports, handleTabCycling fix, useAgNode test
  corrections, termless matcher delegation, vendor/termless gitlink unblock."
started_at: 2026-04-26T23:22:40Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-vendor-fuzz
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T16:26:13Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [epic] Fix sweep — 49 vendor + 5 fuzz test failures + hybrid-output phase 3 @km/all #epic #P1 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

Tracking epic for the remaining failures from @km/all/fix-sweep-0426 scope B (vendor + fuzz). Supervisor redesign (scope A) is intentionally postponed — tracked separately.

## Vendor failures (49 across 19 files)

### vendor/silvery (15 + 4 + 5 + 5 + 6 + 3 = 38 tests across 13 files)

**Cluster A — scope (15 tests, 1 file)**
- vendor/silvery/tests/features/scope.test.ts — likely one shared root cause

**Cluster B — EditContext export (4 tests, 2 files)**
- vendor/silvery/tests/features/click-to-position.test.tsx — Cannot find package '@silvery/ag-react/ui/components/EditContextDisplay'
- vendor/silvery/tests/features/use-ag-node.test.tsx (3 tests)

**Cluster C — listview (5 tests, 2 files)**
- listview-scroll-overshoot.test.tsx (2)
- listview-scrollcap-tall-items.test.tsx (3)

**Cluster D — feature regressions (5 tests, 4 files)**
- pipeline-bugfixes.test.tsx (2)
- box-in-text-warning.test.tsx (1)
- text-frame.test.tsx (1)
- inline-scrollback-promotion.test.tsx (1)

**Cluster E — hooks/memory/perf (6 tests, 3 files)**
- hooks/useBoxMetrics.test.tsx (4)
- memory/memory.test.tsx (1)
- perf/termless-memleak-harness.test.tsx (1)

**Cluster F — examples (3 tests, 2 files)**
- examples/ai-chat.test.tsx (2)
- examples/aichat-inline-bugs.test.tsx (1)

### vendor/termless (5 tests, 2 files) — Cluster G
- packages/viterm/tests/matchers.test.ts (4)
- tests/integration.test.ts (1)
- Common error: `toHaveText expects an AutoLocator, got object` — matcher API shape mismatch

### vendor/flexily (2 tests, 1 file) — Cluster H
- tests/silvercode-gutter-bug.test.ts (NARROW + WIDE)

### vendor/bearly (2 tests, 2 files) — Cluster I
- packages/daemon-spine/tests/parser.test.ts
- plugins/mcp/tests/mcp-plugin.test.ts

## Fuzz failures (5 across 3 files) — Cluster J

- apps/@km/tui/tests/navigation-fuzz.fuzz.ts (4: comprehensive, basic, zoom, view-mode)
- apps/@km/tui/tests/render-fuzz.fuzz.ts (1: scrolling-tiny seed=42)
- vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx (1: 4 invariants)

## Hybrid-output Phase 3

- Wire SILVERY_HYBRID_OUTPUT=1 flag through output-phase.ts to invoke analyzer + estimator per-row
- Reconcile cost-estimator constants (recovered original 12/10/2/8/2 vs implemented 8/6/2/6/2)
- Currently dormant — implementation present but not invoked

## Remaining silvery known limit

- 1 P3+ open under @km/silvery/known-limits

## Excluded

- @km/silvercode/supervisor-strong (scope A) — POSTPONED per user direction (other fixes in flight)

## /complete acceptance

- bun run test:vendor → 0 failures (was 49)
- bun vitest run --project fuzz → 0 failures (was 5)
- @km/silvery/hybrid-output-phase3 closed with constants reconciled
- @km/silvery/known-limits has 0 open children