---
id: "@km/tui/lazy-load"
aliases:
  - km-tui.lazy-load
  - km-tui-lazy-load
created_by: claude:28b14b32
created_at: 2026-02-23T16:43:26Z
closed_at: 2026-03-10T17:53:36Z
close_reason: "Implemented preloadDepth in storage layer. Default Infinity (no
  behavior change). When finite: directory walk stops at depth limit, records
  unexplored dirs with readdir child counts. Repo exposes expandDirectory() for
  on-demand expansion and expandAll() async generator for background indexing.
  10 tests in preload-depth.test.ts. All 4221 tests pass."
---

# [x] km view: lazy loading for very large drives @km/tui #feature #P2 @claude:55df8ef1

Point km view at any drive without choking. Faster startup for large directories.

## Design: preloadDepth + Background Indexing

**preloadDepth** (default: Infinity — current behavior, zero breaking changes):
- Walk to preloadDepth eagerly at startup. Discover files, parse markdown, resolve links.
- This is what renders immediately.

**Background phase** (when preloadDepth < Infinity):
- After initial render, continue loading remaining directories in background during idle time.
- Links resolve progressively — unresolved refs "light up" as their targets load.
- Search works on loaded content, gets progressively more complete.
- Once background completes, full search and all links resolved.

## Architecture Changes

1. **Storage (discovery.ts)**: Add preloadDepth to DiscoveryOptions. scanDirectory() tracks current depth. Beyond preloadDepth, directories are marked "unexplored" with a shallow readdir count (no stat). New expandDirectory(path, db) function discovers a single directory subtree incrementally.

2. **Storage (repo.ts)**: Add preloadDepth to CreateRepoOptions. Repo exposes expandDirectory() for on-demand expansion + getUnexploredDirs() for background loader. Repo exposes backgroundLoadRemaining() that progressively expands all unexplored dirs.

3. **TUI**: Unexplored directories show dimmed "~N items" indicator. Expanding triggers expandDirectory() + re-render. Background loader calls backgroundLoadRemaining() after first render.

4. **Search**: Searches whatever is in the db. Partial during background loading, complete after. No special handling needed — SQLite FTS just works on available data.

## Key: No Breaking Changes
- preloadDepth defaults to Infinity = current behavior
- All existing code paths unchanged
- Feature is opt-in via config or CLI flag