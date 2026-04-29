---
id: "@km/_orphan/flexx-stacks"
aliases:
  - km-flexx-stacks
created_at: 2026-01-31T22:29:53Z
closed_at: 2026-01-31T22:35:39Z
---

# [x] Consolidate duplicate _traversalStack arrays @km/_orphan #task #P3 @claude:b8b4780b

## Summary
Both layout-zero.ts (module-level _traversalStack) and node-zero.ts (static Node._traversalStack) have their own traversal stack arrays. These could be consolidated to reduce memory overhead and code duplication.

## Current State
- layout-zero.ts:135: let _traversalStack: Node[] = []
- node-zero.ts:463: private static _traversalStack: Node[] = []

## Consideration
Low priority - the current implementation works correctly and the memory overhead is minimal. Could consolidate in a future cleanup pass.

## Context
Identified during GPT-5.2 code review session (Jan 2026).