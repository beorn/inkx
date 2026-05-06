---
aliases:
  - km-cli.bulk-multi-id-or-where
  - km-cli-bulk-multi-id-or-where
created_at: 2026-05-06T06:27:59.749Z
_stub: true
closed_at: 2026-05-06T07:58:20.624Z
closeReason: "Shipped: 3 commits 4ccd90320+7e864140e+653c31afe. Bulk semantics
  on lifecycle (close/drop/claim/release/reopen) + mutations (set/clear/move).
  Lifecycle: variadic [ids...] OR --where '<query>' selector (mutually
  exclusive); shared runLifecycleBulk core; --dry-run previews validation
  rejections. Set/clear: --where adds bulk via query DSL. Move: multi-source
  [args...] (last positional is target) + --where; rename mode rejects
  multi-source by construction (target is unique canonical id). 21 new tests: 9
  L4/L5 property pinning B1-B4 invariants across 50+ random sequences (2 seeds),
  12 subprocess action-handler integration."
---

