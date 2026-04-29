---
id: "@km/beorn-test/ai"
aliases:
  - km-beorn-test.ai
  - km-beorn-test-ai
created_at: 2026-02-03T12:51:16Z
closed_at: 2026-02-04T11:27:28Z
---

# [x] vitestx: AI mode LLM integration @km/beorn-test #feature #P3

LLM picks actions instead of random. Custom picker that calls LLM API to choose next action based on current state. Includes directed exploration (user hints like 'explore boundary conditions'). Depends on cli modes.