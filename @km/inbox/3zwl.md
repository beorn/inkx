---
mentions:
  - km
id: "@km/inbox/3zwl"
aliases:
  - km-3zwl
  - "@km/_orphan/3zwl"
created_at: 2026-01-20T10:29:59Z
closed_at: 2026-01-20T13:27:23Z
---

# [x] Flexx: Extract resolveSpacing() helper @km/_orphan #task #P2

## Problem

Spacing resolution pattern is duplicated 3 times in layoutNode():

```typescript
const marginLeft = resolveValue(style.margin[0], availableWidth);
const marginTop = resolveValue(style.margin[1], availableHeight);
const marginRight = resolveValue(style.margin[2], availableWidth);
const marginBottom = resolveValue(style.margin[3], availableHeight);
```

## Location

[node.ts:650-664](vendor/beorn-flexx/src/node.ts#L650)

## Solution

Extract helper:

```typescript
function resolveSpacing(
  spacing: [Value, Value, Value, Value],
  widthAvail: number,
  heightAvail: number
): { left: number; top: number; right: number; bottom: number }
```

