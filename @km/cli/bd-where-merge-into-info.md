---
projects:
  - stats
aliases:
  - km-cli.bd-where-merge-into-info
  - km-cli-bd-where-merge-into-info
created_at: 2026-05-06T17:12:21.240Z
closed_at: 2026-05-06T18:51:35.339Z
closeReason: Shipped at bae21e27a. New --paths flag on bd info suppresses config
  + statistics, emits paths only (matches legacy bd where output). Lifted
  printPaths(resolved, configObj) helper. bd where deleted entirely. New
  apps/km-cli/tests/bd-info-paths.test.ts pins the behavior. ~30 LOC
  consolidated. 859/859 km-cli tests pass.
---

# [x] Merge bd where into bd info --paths. bd where (50 LOC) shows resolved paths only; bd info already includes config+stats including paths. Replace bd where with bd info --paths flag, drop registerBdWhere from bd.ts. Consolidates ~30 LOC and removes the overlap. #P3

