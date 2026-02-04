# Sync Test Coverage Report

Generated: 2026-02-04

## Test Files Summary

| File | Tests | Description |
|------|-------|-------------|
| `watch/sync.test.ts` | 14 | Core syncFromFs, folder hierarchy, events |
| `watch/bidirectional-sync.slow.test.ts` | 8 | TUI↔FS bidirectional, race conditions |
| `sync/chaos/roundtrip.test.ts` | 24 | Content preservation through parse/serialize |
| `sync/chaos/concurrent.slow.test.ts` | 11 | Interleaved/rapid edits, conflicts |
| `sync/chaos/db-to-fs.slow.test.ts` | 11 | DB→File task updates, coalescing |
| `sync/chaos/fake-fs.test.ts` | 18 | MockFileSystem unit tests |
| `e2e/sync-safety.test.ts` | 5 | Safety: only .md files touched |
| `sync/chaos/chaos-fuzz.fuzz.ts` | — | Fuzz testing (property-based) |

**Total structured tests:** ~91

## Implementation Functions

| Function | File | Tested? | Notes |
|----------|------|---------|-------|
| `syncFromFs` | sync.ts | ✅ | Core sync, progress, 3-phase (scan/reconcile/rules) |
| `syncToFs` | sync.ts | ✅ | DB→FS write |
| `reconcileDirectory` | reconcile.ts | ✅ | Directory diff |
| `reconcileDirectoryRecursive` | reconcile.ts | ⚠️ | Used internally, not direct tests |
| `applyReconcileOps` | applier.ts | ✅ | Via sync.test.ts |
| `applyReconcileOpsAsync` | applier.ts | ❓ | Async variant — check if used |
| `handleCreate` | handlers/create-handler.ts | ✅ | Via bidirectional tests |
| `handleUpdate` | handlers/update-handler.ts | ✅ | Via db-to-fs tests |
| `handleDelete` | handlers/delete-handler.ts | ✅ | Via bidirectional tests |
| `handleRename` | handlers/delete-handler.ts | ⚠️ | Minimal coverage |
| `diffNodes` | handlers/node-differ.ts | ⚠️ | Implicit via update tests |
| `scanDirectoryRecursiveGen` | watcher.ts | ✅ | Used in syncFromFs |
| `detectCaseSensitivity` | watcher.ts | ❓ | macOS-specific path handling |
| `detectCaseCollisions` | watcher.ts | ❓ | Collision detection |
| `WriteQueue` | writequeue.ts | ✅ | Via coalescing tests |
| `WorkerWatcher` | worker-bridge.ts | ⚠️ | Integration only |
| `classifyError` | watcher.ts | ❓ | Error classification |
| `calculateBackoffDelay` | watcher.ts | ❓ | Retry logic |

## Coverage Gaps Identified

### High Priority (likely to cause bugs)

1. **`handleRename`** — File/folder renames have minimal explicit tests
   - Should test: rename preserves node IDs, updates fs_path, handles cross-directory moves

2. **`diffNodes`** — Node differ lacks direct unit tests
   - Critical for detecting what changed during file updates
   - Should test: structural key matching, ID remapping, created/updated/deleted detection

3. **Error recovery** — `classifyError`, `calculateBackoffDelay` untested
   - Affects retry behavior on transient filesystem errors

### Medium Priority

4. **Case sensitivity handling** — `detectCaseSensitivity`, `detectCaseCollisions`
   - macOS-specific edge cases (HFS+ is case-insensitive)

5. **`reconcileDirectoryRecursive`** — Only tested through higher-level sync
   - Edge cases: empty directories, deeply nested, symlinks

### Low Priority (covered implicitly)

6. **Progress callbacks** — Tested indirectly through sync.test.ts
7. **Rule evaluation phase** — Covered in separate rules tests

## Scenarios Tested ✅

- Simple file sync (create, update, delete)
- Folder hierarchy creation
- Frontmatter preservation
- Task metadata (due dates, priority, tags, mentions, projects)
- Wiki links
- Code blocks
- Unicode content
- Concurrent FS + DB edits
- Rapid edit coalescing
- Multi-file independence
- Safety: never touch non-.md files

## Scenarios Missing ❌

- **File/folder rename** (explicit tests)
- **Node differ edge cases** (empty file, all nodes deleted, type changes)
- **Error retry with backoff**
- **Case collision detection** (file.md vs FILE.md on macOS)
- **Symlink handling** (scanSymlinks function exists but not in test matrix)
- **Large file performance** (>1000 tasks in single file)
- **Cross-directory moves** (move file.md from /a to /b)

## Recommendations

1. Add `node-differ.test.ts` with direct unit tests for `diffNodes`
2. Add rename scenarios to bidirectional-sync tests
3. Add error handling unit tests in `watcher.test.ts`
4. Consider property-based testing for diffNodes (many edge case combinations)
