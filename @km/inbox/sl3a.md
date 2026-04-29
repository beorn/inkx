---
id: "@km/_orphan/sl3a"
aliases:
  - km-sl3a
created_at: 2026-01-21T22:45:58Z
closed_at: 2026-01-22T00:19:30Z
---

# [x] No tests for km-agent query functions @km/_orphan #task #P2

packages/@km/_orphan/agent/src/queries.ts and sessions.ts export public API with no tests:
- queryAgents()
- getAgent()
- querySessions()
- getSession()

These are user-facing query functions that should have test coverage.