---
aliases:
  - km-cli.bd-create-thin-shim-pass2
  - km-cli-bd-create-thin-shim-pass2
created_at: 2026-05-06T17:13:21.725Z
---

# bd create thin-shim collapse — second pass. bd-create.ts is currently a 'fat-shim' (178 LOC) that does bd-specific argv translation (--path, --description, --notes, --id+--parent split form) + canonical-id resolution via resolveBdCreateCanonicalId (bd-create-plan.ts 112 LOC) before delegating file materialization to task new. Goal: collapse to ~80 LOC by lifting the argv-translation rules into a shared bd-argv-translate.ts util, and pruning option redefinitions that exactly match task new. #P3
