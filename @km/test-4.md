---
id: "@km/test-4"
aliases:
  - km-test-4
  - "@km/_orphan/test-4"
created_at: 2026-01-27T14:25:47Z
closed_at: 2026-01-27T16:14:17Z
---

# [x] Switch to Vitest test runner @km/test-4 #epic #P2

Migrate from Bun test runner to Vitest for better streaming TAP output, rich reporters, and unified test orchestration. Research shows direct migration (changing imports) is better than writing a Vitest plugin wrapper.