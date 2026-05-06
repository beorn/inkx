---
projects:
  - --parent
aliases:
  - km-cli.bd-create-thin-shim-pass2
  - km-cli-bd-create-thin-shim-pass2
created_at: 2026-05-06T17:13:21.725Z
closed_at: 2026-05-06T17:28:29.105Z
closeReason: Closing as invalid under the on-ramp reframe. bd-create's 178 LOC
  of bd-style argv translation (--path, --description, --notes, --id+--parent
  split form, canonical-id resolution via resolveBdCreateCanonicalId) is the
  legitimate cost of being bd-compatible. The shared engine (renderBeadFile,
  mutations.ts) was already lifted in Wave 6 final. Don't try to make bd-create
  thinner just for LOC reduction — bd UX needs the bd flags.
---

# [x] bd create thin-shim collapse — second pass. bd-create.ts is currently a 'fat-shim' (178 LOC) that does bd-specific argv translation (--path, --description, --notes, --id+--parent split form) + canonical-id resolution via resolveBdCreateCanonicalId (bd-create-plan.ts 112 LOC) before delegating file materialization to task new. Goal: collapse to ~80 LOC by lifting the argv-translation rules into a shared bd-argv-translate.ts util, and pruning option redefinitions that exactly match task new. #P3

