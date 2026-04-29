---
id: "@km/review-chaos/9-duplicate-events-should-be-its-own-scenario-type"
aliases:
  - km-review-chaos.9
  - km-review-chaos-9
  - "@km/review-chaos/9"
created_at: 2026-01-23T09:01:38Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] DUPLICATE_EVENTS should be its own scenario type @km/review-chaos #task #P3

DUPLICATE_EVENTS scenario (scenarios.ts:135-139) reuses 'rapid_succession' type internally. For clarity, it could be its own distinct type.