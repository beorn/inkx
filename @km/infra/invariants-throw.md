---
id: "@km/infra/invariants-throw"
aliases:
  - km-infra.invariants-throw
  - km-infra-invariants-throw
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:40Z
closed_at: 2026-04-02T22:08:56Z
---

# [x] Invariant violations must throw, not log — update code + principles.md @km/infra #task #P1 @Bjørn Stabell

Pre-release policy: all programming and data errors should throw immediately, not log. Only user-generated causes (bad input, network errors) should be logged gracefully. Update: (1) invariant checks in board-app.ts to throw instead of console.error, (2) principles.md with error handling policy, (3) logging skill docs, (4) any other steering docs that mention error handling.