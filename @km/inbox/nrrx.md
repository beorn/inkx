---
id: "@km/inbox/nrrx"
aliases:
  - km-nrrx
  - "@km/_orphan/nrrx"
created_at: 2026-01-20T10:30:28Z
closed_at: 2026-01-20T13:27:22Z
---

# [x] Flexx: Name EPSILON_FLOAT constant @km/_orphan #task #P3

## Problem
Magic number `0.001` appears 4 times in node.ts layoutNode() function without a named constant.

## Location
[node.ts:836](vendor/beorn-flexx/src/node.ts#L836) and 3 other places

## Solution
```typescript
const EPSILON_FLOAT = 0.001;
```
Then use it in all 4 places.