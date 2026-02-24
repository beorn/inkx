# Lesson: Performance Optimization

**Keywords**: performance, profiling, resolveNode, name index, deep research, board load, event loop

## Current State

The km TUI loads a 333k-node Asana vault (72 markdown files, 587k lines) in under 1 second wall time. Cursor navigation takes 1-2ms. Fold/unfold operations complete within 55ms. No operation exceeds 500ms.

The biggest single fix was a 40x speedup (6447ms to 159ms in tests, ~700ms wall time) achieved by replacing per-call SQL queries in `resolveNode` with an in-memory name index.

### Remaining bottlenecks

- **Unfold at root**: ~150ms for unfold_all, ~462ms worst case (zoom-out after unfold). Acceptable but not instant.
- **Flexx layout at scale**: For boards with 3900+ components, Flexx layout takes ~746ms (87% of mount time, ~190µs/node). Typical visible viewports (48 cards) are fine at ~140ms.
- **useContentRect overhead**: Layout feedback hooks add ~45% to mount time via re-render cascade (e.g., 140ms → 203ms for 6×8 cards).

## Root Cause: Death by a Thousand SQL Queries

The original performance problem was straightforward: every `@mention` in a card's text called `resolveNode`, which executed 6+ SQL queries per call (prefix match, name match, path match, block_id match, etc.). A board with hundreds of `@mentions` across its cards would fire thousands of SQL queries during React rendering, blocking the main thread for seconds.

The `SigilText` component (responsible for rendering `@mentions` and `#tags`) was the hot path. Each sigil link resolution triggered a full `resolveNode` call to determine the link target's color and display name. For a vault with 256k nodes, each query was expensive.

Five specific bugs were found and fixed:

1. **Empty string full table scan**: `resolveNode('')` triggered `SELECT * FROM nodes WHERE id LIKE '%'`, returning 256k nodes. Fixed with an empty string guard.
2. **Wikilink suffix leak**: Wikilink targets leaked `]]` suffix into queries, causing malformed SQL.
3. **Short query suffix scans**: Short query strings triggered expensive `LIKE` suffix scans against the full table.
4. **Per-render SQL in SigilText**: Every `@mention` did 6+ SQL queries. Fixed by switching to `resolveByName()` with an O(1) in-memory name index.
5. **Stale resolve cache**: `resolveCache` was module-scoped, not database-aware. Results from one repo leaked into another. Fixed with WeakRef-based DB tracking.

### The in-memory name index

The fix is a `Map<string, string>` built once at repo load time, mapping lowercase node names to node IDs. `resolveByName()` does a single map lookup instead of 6 SQL queries. The index is built as a progress step during repo loading and invalidated on mutations.

Key files:
- `packages/km-storage/src/db-queries/smart-resolver.ts` -- `resolveNode()` and `resolveByName()`
- `packages/km-storage/src/db.ts` -- `getNameIndex()` and `clearNameIndex()`
- `packages/km-storage/src/repo.ts` -- index lifecycle management

## Timeline of Fixes

Performance work spanned Feb 22-24, 2026, across ~6 sessions and 20+ commits. Key milestones:

**Phase 1: UI-layer optimizations (Feb 22)**
- SQLite WAL mode + covering indexes, query coalescing, cursor prefetch
- Batch child count queries, per-column memoization
- Non-blocking zoom loading, board-wide fold/unfold
- Progressive fold disclosure, adaptive preload depth

**Phase 2: Render pipeline fixes (Feb 23)**
- Two-phase zoom (skeleton paints before heavy computation)
- Progressive column reveal via state-based setTimeout chain
- Fixed 10s event loop blocks from `countDescendantsAtDepth` walking 118k nodes
- Folded children cap, per-node Jotai atoms, VirtualList auto-sizing
- inkx Box/Text overhead reduction, content-phase skip fix

**Phase 3: Storage-layer breakthrough (Feb 24)**
- In-memory name index: 40x speedup on board load
- Resolve guard fixes (empty string, suffix leak, short query, stale cache)
- Component timing hooks and event loop block detection instrumentation

Most of the Phase 1 and Phase 2 optimizations improved perceived performance (skeleton screens, progressive reveal) or fixed specific pathological cases (118k-node recursive walks). The actual root cause -- thousands of SQL queries during render -- was only found in Phase 3 when instrumentation revealed `resolveNode` as the dominant cost.

## What Did Not Work

### Theorizing without profiling

Multiple sessions shipped "performance fixes" that addressed symptoms rather than root causes. Examples:
- Progressive column reveal masked the slow render but actually made total startup 8x slower (6.4s vs 0.8s) due to event loop idle time between ticks.
- SQLite WAL mode improved write concurrency but had negligible effect on read-heavy board loads.
- Cursor prefetching optimized a path that was already fast (1-2ms).

These fixes were not useless -- progressive reveal genuinely improves perceived performance -- but they were applied without measuring the actual bottleneck. Each session picked a plausible theory and implemented it without profiling first.

### Deep research overuse

Approximately 10+ deep research queries (O3 Deep Research at $1.38-$1.91 each) were spent on performance-related questions during this period, totaling roughly $15-17. Topics included:

- "Speeding up initial React component mount in a TUI" ($1.69)
- "Offloading SQLite & React rendering from the main thread" ($1.91)
- "Progressive mounting in React 19" ($1.51)
- "React TUI rendering performance: per-component hook overhead" ($1.55)
- "Progressive column reveal event loop blocking" ($1.44)
- "Skeleton/loading patterns gap analysis vs shadcn, bubbletea, textual" (cost unlisted)
- Multiple others on architectural approaches

The actual fix -- caching name lookups in a Map -- required zero external research. The deep research queries returned thorough analyses of React internals, concurrent rendering, worker threads, and Suspense patterns, but the bottleneck was in the storage layer, not the rendering layer. The research correctly identified that `resolveNode` was expensive, but the sessions that read the research outputs kept looking for rendering-layer solutions.

### Fixing without measuring

Several commits shipped performance improvements without before/after measurements. The span timing infrastructure (`km:perf:key`) existed but was not consistently used. When instrumentation was finally added (component timing hooks, event loop block detection), the actual hot path became immediately obvious.

## What Worked

### Instrumentation first

The breakthrough came from adding targeted instrumentation:

1. **Component timing hooks**: Measured per-component render time, revealing that TreeNode cards were spending most of their time in sigil resolution during render.
2. **Event loop block detection**: Identified exactly which operations blocked the main thread and for how long.
3. **Span timing on resolveNode**: Showed that each call took 5-50ms and was called hundreds of times per board render.

Once the data was visible, the fix was obvious and took under an hour to implement.

### Profiling with the actual data set

The Asana vault (72 files, 333k nodes, 256k nodes in database) was critical as a realistic benchmark. Smaller test vaults never exposed the problem because SQL query overhead is proportional to database size. The `@mention` density in Asana-imported data (every task references assignees and projects) made the per-render query explosion visible.

### Separating perceived from actual performance

Progressive column reveal, skeleton screens, and loading indicators are valuable for perceived performance -- the user sees progress instead of a frozen screen. But they do not reduce total work. Keeping these two goals distinct prevents confusing "it looks faster" with "it is faster."

Ultimately, progressive column reveal was removed entirely. Profiling showed it was the primary startup bottleneck, not a mitigation. Rendering all columns in a single frame is both faster (0.8s vs 6.4s) and uses the CPU more efficiently (142% vs 39%).

## Profiling Toolkit

Current instrumentation available for diagnosing performance issues:

| Tool | How to use | What it shows |
|------|-----------|---------------|
| Span timing | `TRACE=1 bun km view` | Per-operation timing (repo load, build state, key handling) |
| Component timing | Built into TreeNode render | Per-card render time, hook overhead |
| Event loop monitor | `useEventLoopMonitor()` | Main thread blocks > threshold |
| inkx instrumentation | `INKX_INSTRUMENT=1` | Skip/render counts, pipeline phase timing |
| inkx strict mode | `INKX_STRICT=1` | Incremental vs fresh render comparison |
| React DevTools | `DEBUG_DEVTOOLS=1 bun km view` | Flame graph of component mount/update |
| Debug logging | `DEBUG=inkx:* DEBUG_LOG=/tmp/inkx.log` | Detailed render pipeline trace |
| Pipeline phase timing | `globalThis.__inkx_last_pipeline` | Per-phase breakdown (measure, layout, content, output) |
| Wall-clock mount | `time bun km view --repo <path>` | End-to-end startup time including all layers |

## Lessons

### 1. Profile before fixing

Measure the actual bottleneck before writing optimization code. Five minutes of instrumentation beats four sessions of theorizing. The performance toolkit above exists for a reason -- use it at the start of any performance investigation, not after shipping three rounds of speculative fixes.

### 2. Measure after fixing

Every performance change should include before/after numbers from the same benchmark. "It feels faster" is not evidence. The 40x speedup was verifiable: 6447ms to 159ms in the same test, measured by the same span timer.

### 3. One session with instrumentation > four sessions guessing

The pattern across this optimization effort was: sessions 1-4 picked plausible theories and implemented them; session 5-6 added instrumentation and found the actual problem. The instrumentation sessions were more productive than all previous sessions combined.

### 4. Deep research is expensive per insight

At $1.38-$1.91 per query, deep research should be reserved for genuinely novel architectural questions. "Why is my app slow?" is not a deep research question -- it is a profiling question. Use deep research for design decisions that require surveying external prior art (e.g., "how do other frameworks handle progressive mounting?"), not for diagnosis.

### 5. The hot path is often in a different layer than you expect

The performance problem presented as slow React rendering (visible as UI freezes), but the root cause was in the storage layer (SQL queries during render). When profiling, check all layers of the stack, not just the layer where symptoms appear.

### 6. Perceived performance can be worse than actual performance

Progressive column reveal was intended to improve perceived performance by showing columns one at a time. Profiling revealed it was actually the **primary startup bottleneck**: each column reveal cycle added a setTimeout(0) + startTransition, causing 6+ event loop ticks with idle gaps between them. With 6 columns at ~600ms render each, the total was 6.4s at 39% CPU utilization.

Removing progressive reveal and rendering all columns in a single frame reduced startup from 6.4s to 0.8s (8x speedup), with CPU utilization jumping from 39% to 142%. The single-frame render is both faster (less total work due to fewer React reconciliation passes) and better for CPU utilization (no idle gaps between ticks).

The lesson: progressive/staggered rendering patterns that yield to the event loop can make things slower, not faster, when the per-chunk render time is long and the idle time between chunks is significant. Measure both perceived and actual performance — they can diverge in unexpected directions.
