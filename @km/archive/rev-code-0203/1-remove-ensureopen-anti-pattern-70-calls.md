---
mentions:
  - km
  - claude
id: "@km/rev-code-0203/1-remove-ensureopen-anti-pattern-70-calls"
aliases:
  - km-rev-code-0203.1
  - km-rev-code-0203-1
  - "@km/rev-code-0203/1"
created_at: 2026-02-03T13:47:54Z
closed_at: 2026-02-03T14:20:08Z
assignee: claude:b3478afd
---

# [x] Remove ensureOpen() anti-pattern (70+ calls) @km/rev-code-0203 #task #P2 @claude:b3478afd

## Problem

`ensureOpen()` is called 70+ times across repo.ts, data-store.ts, file-tree.ts. Per docs/principles.md, lower layers should throw naturally on closed state rather than requiring guard calls at every site.

## Files

- packages/@km/storage/src/repo.ts - majority of calls
- packages/@km/storage/src/internal/data-store.ts
- packages/@km/storage/src/internal/file-tree.ts

## Approach

1. Make the underlying storage throw a clear error when accessed after close
2. Remove all ensureOpen() guard calls
3. Keep a single close() method that invalidates the state
4. Update tests that rely on ensureOpen() behavior

