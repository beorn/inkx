---
id: "@km/tui/reconcile-perf"
aliases:
  - km-tui.reconcile-perf
  - km-tui-reconcile-perf
created_by: claude:ceb7c9cb
created_at: 2026-03-29T01:58:29Z
closed_at: 2026-03-29T02:07:02Z
close_reason: "Fixed 3 N+1 query patterns in evaluateAddRule: (1) board dedup
  getChildren loop replaced with single SQL query, (2) per-node getEmbedPath
  tree walks replaced with batch file ancestor cache, (3) onNodeChanged now
  caches getNodesWithRule result across loop iterations. Also deduplicated a
  redundant getChildren(sectionId) call. All 4821 fast tests pass."
---

# [x] Investigate sync/reconciliation speed regression @km/tui #bug #P2 @claude:ceb7c9cb

## Problem

User reports km sync feels slower at reconciling. Hypothesis: some code path changed from batch SQL to per-node queries.

## Context

The slate-interfaces refactor (@km/core/slate-interfaces) changed ONLY import names in @km/storage — no logic changes. But other recent commits may have introduced slower patterns:

- `e0edcff3` fix(storage): resolve ambiguous links to first match instead of null
- `8c7dae28` fix(storage): buildEmbedChild should not copy source content  
- `b4cfb23e` refactor(storage): unify embed child creation with buildEmbedChild()
- `dd2f8761` refactor!: remove type:"embed" from BlockType

## Investigation Plan

1. Profile with `LOGLEVEL=debug bun km sync` — identify which phase is slow
2. Check if any reconciliation loop now does N+1 queries (getNode per child instead of batch)
3. Check if db-rules.ts embed handling added extra queries per node
4. Compare with `git bisect` if profiling doesn't pinpoint

## What to Look For

- `repo.getNode()` calls inside loops (should be batch: `repo.getNodes(ids)`)
- `repo.getChildren()` called per-card during rendering (should be cached or lazy)
- db-rules embed resolution doing extra SQL per node

## /complete
- Profile identifies the slow path
- Fix brings reconciliation back to expected speed