---
id: "@km/_orphan/vwzf"
aliases:
  - km-vwzf
created_at: 2026-01-26T15:45:33Z
closed_at: 2026-01-26T15:53:54Z
---

# [x] Multiple TypeScript errors in km-storage tests @km/_orphan #bug #P0

Pre-existing TypeScript errors in chaos testing infrastructure:

1. fake-repo.ts: LoadError not exported from repo.ts
2. chaos testing files (db-to-fs.slow.test.ts, fuzzer.ts, harness.ts, verifier.ts): 
   - Missing getDb function
   - Wrong number of arguments to reconcile functions
   - Database type mismatches

These were introduced around the domain objects refactor and block TypeScript strict mode.