---
aliases:
  - km-cli.bd-where-merge-into-info
  - km-cli-bd-where-merge-into-info
created_at: 2026-05-06T17:12:21.240Z
---

# Merge bd where into bd info --paths. bd where (50 LOC) shows resolved paths only; bd info already includes config+stats including paths. Replace bd where with bd info --paths flag, drop registerBdWhere from bd.ts. Consolidates ~30 LOC and removes the overlap. #P3
