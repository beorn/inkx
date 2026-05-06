---
mentions:
  - km
  - claude
id: "@km/rev-code-0203/2-convert-getters-to-plain-properties-in-repo-ts"
aliases:
  - km-rev-code-0203.2
  - km-rev-code-0203-2
  - "@km/rev-code-0203/2"
created_at: 2026-02-03T13:47:56Z
closed_at: 2026-02-03T14:20:10Z
assignee: claude:b3478afd
---

# [x] Convert getters to plain properties in repo.ts @km/rev-code-0203 #task #P3 @claude:b3478afd

## Problem

Per docs/principles.md, getters should be plain properties. repo.ts and fake-repo.ts have 40+ getter methods that could be plain properties or direct field access.

## Files

- packages/@km/storage/src/repo.ts
- packages/@km/storage/src/fake-repo.ts

## Approach

1. Audit all getters in repo.ts and fake-repo.ts
2. Convert simple getters (no computation) to plain properties
3. For computed getters, evaluate if they can be cached properties updated on mutation
4. Update all call sites (should be transparent if using property access already)

