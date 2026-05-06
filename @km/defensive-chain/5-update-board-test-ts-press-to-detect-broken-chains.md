---
mentions:
  - km
  - claude
id: "@km/defensive-chain/5-update-board-test-ts-press-to-detect-broken-chains"
aliases:
  - km-defensive-chain.5
  - km-defensive-chain-5
  - "@km/defensive-chain/5"
created_at: 2026-01-25T11:18:05Z
closed_at: 2026-01-25T11:42:29Z
assignee: claude
---

# [x] Update board-test.ts press() to detect broken chains @km/defensive-chain #task #P1 @claude

Remove allowNoEffect option. Throw if key has no effect AND no bell (broken chain detection).

Ergonomic bell testing API:

```typescript
expect(board.bell).toBeTrue()   // or .toBeFalse()
// Instead of: board.expect('[data-bell]').toExist()
```

Implementation: Add `bell` getter to BoardTest that returns boolean.

