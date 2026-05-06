---
mentions:
  - km
id: "@km/inbox/sync-m2"
aliases:
  - km-sync-m2
  - "@km/_orphan/sync-m2"
created_at: 2026-01-22T13:30:14Z
closed_at: 2026-01-22T17:31:09Z
---

# [x] Milestone 2: Full FS Mocking @km/_orphan #epic #P2

## Description

Add DI points for filesystem operations and create MockFileSystem for tests without /tmp.

## What's Implemented

- ✅ FileSystemOps interface (writequeue.ts:198)
- ✅ DirectoryScanner DI in reconcile.ts
- ✅ WriteQueue accepts `fs` via DI
- ✅ Unit tests use inline mockFs objects

## What's Missing

- ❌ **MockFileSystem class** - A reusable in-memory filesystem implementation
- ❌ Integration into chaos harness.ts and fuzzer.ts

## Why It Matters

Without MockFileSystem, chaos tests run ~500ms/iteration using real /tmp directories.
With MockFileSystem, expect ~10-50ms/iteration (10-50x speedup).

## Implementation Plan

1. Create MockFileSystem class implementing FileSystemOps + DirectoryScanner
2. Add in-memory file storage (Map<string, {content, mtime, stat}>)
3. Update harness.ts to use MockFileSystem
4. Update fuzzer.ts to use MockFileSystem
5. Verify chaos tests still pass but run faster

