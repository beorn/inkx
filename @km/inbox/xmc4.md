---
mentions:
  - km
id: "@km/inbox/xmc4"
aliases:
  - km-xmc4
  - "@km/_orphan/xmc4"
created_at: 2026-01-19T10:50:55Z
closed_at: 2026-01-19T11:05:49Z
---

# [x] Remove old CommandDef from apps/km-repl/src/commands.ts @km/_orphan #task #P2

Old CommandDef interface in apps/@km/_orphan/repl/src/commands.ts conflicts with new one in packages/@km/_orphan/commands/src/types.ts. After command system migration, old definitions should be removed to avoid confusion.

