---
mentions:
  - km
id: "@km/inbox/lzsi"
aliases:
  - km-lzsi
  - "@km/_orphan/lzsi"
created_at: 2026-01-19T15:06:05Z
closed_at: 2026-01-19T15:15:24Z
---

# [x] Research and port from reference flexbox implementation @km/_orphan #task #P1

## Summary

Before implementing flexx from scratch, research and directly port from an existing reference implementation.

## Candidates

1. **Planning-nl/flexbox.js** - Pure JS implementation
- GitHub: https://github.com/Planning-nl/flexbox.js/
- ~1500 LOC, Apache 2.0 license
5. **dead/typeflex** - TypeScript port of Yoga
- GitHub: https://github.com/dead/typeflex
- Complete Yoga port, but larger (~8000 LOC)
9. **kmagiera/css-layout** - Facebook's original pre-Yoga implementation
- GitHub: https://github.com/kmagiera/css-layout
- Pure JS, but deprecated

## Approach

1. Clone the best candidate locally
2. Study the flex grow/shrink distribution algorithm
3. Port directly with minimal changes
4. Adapt API to match Yoga interface for inkz compatibility
5. Add tests comparing against Yoga output

## Why This Matters

- From-scratch implementations have subtle bugs
- Reference implementations have been battle-tested
- Porting is faster and more reliable than recreating

## Blocks

- flexx-base (main flexx implementation bead)

