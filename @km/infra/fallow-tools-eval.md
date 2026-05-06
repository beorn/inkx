---
mentions:
  - km
id: "@km/infra/fallow-tools-eval"
aliases:
  - aehwy
  - "@km/inbox/aehwy"
  - km-aehwy
  - "@km/_orphan/aehwy"
created_by: Bjørn Stabell
created_at: 2026-04-23T07:09:42Z
owner: bjorn@stabell.org
---

# [ ] Evaluate fallow.tools for km static analysis @km/_orphan #task #P3

Evaluate fallow.tools (https://fallow.tools/) for km: free OSS static analysis for TS/JS, plus optional paid runtime intelligence for hot paths, cold paths, and runtime-backed code decisions. Pitched on Syntax podcast #998 (Wes + Scott, 2026-04-23) as a deterministic tool to keep AI coding honest.

Check:

- Depth + signal quality vs existing knip + tsc coverage (knip already wired: package.json lint:unused + generate:knip)
- Whether runtime intelligence (paid) is worth the cost for km's workload
- Licensing implications for km / vendor publishing
- CI integration complexity

Source: Syntax #998 How to Fix Vibe Coding, captured in vault at areas/@work/Research-pipeline.md.

