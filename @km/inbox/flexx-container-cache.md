---
id: "@km/_orphan/flexx-container-cache"
aliases:
  - km-flexx-container-cache
created_at: 2026-01-30T17:49:09Z
closed_at: 2026-01-30T17:50:58Z
---

# [x] [flexx] Cache measured results for container nodes @km/_orphan #feature #P1

## Summary
Currently only leaf nodes with measureFunc have cached results. Container nodes recompute sizes on every query, even when constraints match.

## Implementation
Add constraint-keyed cache for container measured size:
- Key: (availWidth, availHeight, widthMode, heightMode, direction)
- Store: {width, height, baseline}
- Location: On node (like current _m0-_m3 cache)

## Cache Key Canonicalization
- Normalize NaN/undefined to sentinel values
- Consider quantizing floats to reduce key variations
- Hash key for fast comparison

## Expected Impact
Container subtrees won't be re-measured when constraints match. Major reduction in recursive calls.