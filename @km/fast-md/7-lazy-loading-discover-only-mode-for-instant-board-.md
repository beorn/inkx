---
id: "@km/fast-md/7-lazy-loading-discover-only-mode-for-instant-board-"
aliases:
  - km-fast-md.7
  - km-fast-md-7
  - "@km/fast-md/7"
created_at: 2026-01-23T15:27:16Z
closed_at: 2026-01-23T15:43:48Z
---

# [x] Lazy loading - discover-only mode for instant board render @km/fast-md #task #P1

Three-phase lazy loading to render board instantly:

**Phase 1 (0-300ms): Instant Board**
- Only read file metadata (path, mtime), not content
- Create placeholder nodes with _parsed: false
- Render board with structure visible but no task details

**Phase 2 (background): Content Loading**
- Parse files in background via async generator
- Update SQLite and refresh board as files complete
- Yield to event loop every 5 files to keep UI responsive

**Phase 3 (background): Link Resolution**
- Reuse existing resolveLinksAsync() after Phase 2 completes
- No UI impact (backlinks don't affect board view)

**Implementation:**
1. Add skipContentParsing option to loadVault()
2. Create content-loader.ts with streaming parse
3. Add _parsed flag to KNode type
4. Wire into view.ts - start content loader after board renders
5. Defer task-dependent rules until Phase 2 completes

**Expected result:** First render in ~400ms instead of ~3100ms