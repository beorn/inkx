---
id: "@km/rev-0203/1-clean-up-unused-exports-from-knip-117-exports-132-"
aliases:
  - km-rev-0203.1
  - km-rev-0203-1
  - "@km/rev-0203/1"
created_at: 2026-02-03T15:13:09Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Clean up unused exports from knip (117 exports, 132 types) @km/rev-0203 #task #P3 @claude:da8e4a66

knip reports 117 unused exports and 132 unused types across the codebase.

Run: bun lint:unused
Filter: focus on packages/ first, then apps/

Approach: Use /code clean or manual cleanup. Remove unused exports,
update index.ts re-exports. Run bun run test:fast after each batch.

See /tmp/knip-output.txt from review session for full list.