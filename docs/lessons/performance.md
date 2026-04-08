# Performance Optimization Lessons

**Keywords**: performance, profiling, resolveNode, name index, deep research, board load, event loop

## Summary

The km TUI froze for 60+ seconds when opening large vaults (2800+ nodes, 72 markdown files, 587k lines from an Asana import). Over 6+ sessions spanning roughly 12 hours of agent time, multiple optimization strategies were attempted. Approximately 10 deep research queries ($15-17 in API costs) explored React rendering, worker threads, progressive mounting, and SQLite offloading. The actual fix was ~20 lines of code: an in-memory name index cache that eliminated thousands of per-render SQL queries. The result was a 40x speedup (6447ms to 159ms in tests, under 1 second wall time).

## Current State

Cursor navigation takes 1-2ms. Fold/unfold operations complete within 55ms. No operation exceeds 500ms. The vault loads in under 1 second wall time.

### Remaining bottlenecks

- **React mount overhead**: ~1.9s for 2852 React nodes (72 visible cards at ~24 nodes/card). This is pure component creation time in React's reconciler.
- **Flexily layout at scale**: For boards with 3900+ components, layout takes ~746ms (87% of mount time, ~190us/node). Typical visible viewports (48 cards) render in ~140ms.
- **useContentRect cascade**: Layout feedback hooks add ~45% to mount time via re-render cascade (140ms to 203ms for a 6x8 card grid).
- **Unfold at root**: ~150ms for unfold_all, ~462ms worst case (zoom-out after full unfold).

## Root Cause: Death by a Thousand SQL Queries

Every `@mention` in a card's text called `resolveNode()`, which executed 6+ SQL queries per call (prefix match, name match, path match, block_id match, etc.). The `SigilText` component -- responsible for rendering `@mentions` and `#tags` -- triggered these lookups during React render. A board with hundreds of mentions across its cards fired thousands of SQL queries, blocking the main thread for seconds. Against a 256k-node database, each query was expensive.

Five specific bugs compounded the problem:

1. **Empty string full table scan**: `resolveNode('')` triggered `SELECT * FROM nodes WHERE id LIKE '%'`, returning all 256k nodes.
2. **Wikilink suffix leak**: Wikilink targets leaked `]]` suffix into queries, producing malformed SQL.
3. **Short query suffix scans**: Short query strings triggered expensive `LIKE` suffix scans against the full table.
4. **Per-render SQL in SigilText**: Every `@mention` did 6+ SQL queries per render cycle.
5. **Stale resolve cache**: The cache was module-scoped, not database-aware, so results from one repo leaked into another.

### The fix

A `Map<string, string>` built once at repo load time, mapping lowercase node names to node IDs. `resolveByName()` does a single map lookup instead of 6 SQL queries. The index is built as a progress step during repo loading and invalidated on mutations. The implementation is roughly 20 lines in `packages/km-storage/src/db.ts` (`getNameIndex()`, `clearNameIndex()`).

Key files:
- `packages/km-storage/src/db-queries/smart-resolver.ts` -- `resolveNode()` and `resolveByName()`
- `packages/km-storage/src/db.ts` -- name index lifecycle
- `packages/km-storage/src/repo.ts` -- index management during repo load

## Mistakes Made

### Theorizing without profiling

Multiple sessions shipped "performance fixes" that addressed symptoms rather than root causes:

- **Progressive column reveal** masked the slow render but made total startup 8x slower (6.4s vs 0.8s). Each column reveal cycle added a `setTimeout(0)` + `startTransition`, causing 6+ event loop ticks with idle gaps between them. At 39% CPU utilization, the CPU was mostly idle between ticks.
- **SQLite WAL mode** improved write concurrency but had negligible effect on read-heavy board loads.
- **Cursor prefetching** optimized a path that was already fast (1-2ms).
- **Batch child counts, per-column memoization, covering indexes** -- all reasonable optimizations, but none targeted the actual bottleneck.

These were not useless. Progressive reveal genuinely improves perceived performance for legitimate slow operations, and the covering indexes help elsewhere. But they were applied without measuring the actual bottleneck first. Each session picked a plausible theory and implemented it without profiling.

### Deep research overuse

Roughly 10 deep research queries (O3 Deep Research at $1.38-$1.91 each) totaled $15-17:

- "Speeding up initial React component mount in a TUI" ($1.69)
- "Offloading SQLite & React rendering from the main thread" ($1.91)
- "Progressive mounting in React 19" ($1.51)
- "React TUI rendering performance: per-component hook overhead" ($1.55)
- "Progressive column reveal event loop blocking" ($1.44)
- Several others on architectural approaches

The actual fix -- caching name lookups in a Map -- required zero external research. The deep research returned thorough analyses of React internals, concurrent rendering, worker threads, and Suspense patterns, but the bottleneck was in the storage layer, not the rendering layer. The research correctly identified `resolveNode` as expensive, but subsequent sessions kept looking for rendering-layer solutions.

**When to use deep research**: Design decisions that require surveying external prior art (e.g., "how do other frameworks handle progressive mounting?"). **Not for**: Diagnosis of "why is my app slow?" -- that is a profiling question.

### Shipping fixes without measuring

Several commits shipped performance improvements with no before/after measurements. The span timing infrastructure (`km:perf:key`) existed but was not consistently used. When instrumentation was finally added (component timing hooks, event loop block detection), the actual hot path became immediately obvious.

## What Worked

### Instrumentation first

The breakthrough came from adding targeted instrumentation:

1. **Component timing hooks**: Measured per-component render time. Revealed that TreeNode cards spent most time in sigil resolution during render, not in layout or reconciliation.
2. **Event loop block detection**: Identified exactly which operations blocked the main thread and for how long. Showed that `countDescendantsAtDepth` walked 118k nodes on unfold.
3. **Span timing on resolveNode**: Showed each call took 5-50ms and was called hundreds of times per board render.

Once the data was visible, the fix was obvious and took under an hour to implement.

### Profiling with the actual data set

The Asana vault (72 files, 333k nodes) was critical as a realistic benchmark. Smaller test vaults never exposed the problem because SQL query overhead is proportional to database size. The `@mention` density in Asana-imported data (every task references assignees and projects) made the per-render query explosion visible.

### Separating perceived from actual performance

Progressive column reveal, skeleton screens, and loading indicators are valuable for perceived performance -- the user sees progress instead of a frozen screen. But they do not reduce total work. Keeping these two goals distinct prevents confusing "it looks faster" with "it is faster."

Removing progressive column reveal and rendering all columns in a single frame reduced startup from 6.4s to 0.8s (8x speedup). CPU utilization jumped from 39% to 142%. The single-frame render is both faster (less total work, fewer React reconciliation passes) and better for CPU utilization (no idle gaps between ticks).

## Timeline of Commits

Performance work spanned Feb 22-24, 2026. The commits tell the story:

**Feb 22 -- UI-layer optimizations (Phase 1)**: Batch preload children cache, board-wide fold + layout cache, non-blocking zoom loading, batch child counts, progressive fold disclosure, SQLite WAL + covering index + query coalescing + cursor prefetch. All reasonable. None targeted the root cause.

**Feb 23 -- Render pipeline work (Phase 2)**: Two-phase zoom with skeleton, progressive column reveal, lazy nodeIndex, fix 10s event loop blocks (`countDescendantsAtDepth` early-exit), batch preload + grandchild counts, silvery Fill single-pass rendering, FoldedChildRow + activity filter, progressive reveal on fold changes, debounced search, FoldAwareChild per-node atoms, silvery Box/Text overhead stripping. A full day of render optimization. Progressive column reveal was the primary new bottleneck.

**Feb 24 -- Storage-layer breakthrough (Phase 3)**: In-memory name index (40x speedup). Removal of progressive column reveal (8x speedup). Addition of component timing hooks and event loop diagnostics. The actual fix.

## Profiling Toolkit

Current instrumentation for diagnosing performance issues:

| Tool | Usage | What it shows |
|------|-------|---------------|
| Span timing | `TRACE=1 bun km view` | Per-operation timing (repo load, build state, key handling) |
| Component timing | Built into TreeNode render | Per-card render time, hook overhead |
| Event loop monitor | `useEventLoopMonitor()` | Main thread blocks above threshold |
| silvery instrumentation | `SILVERY_INSTRUMENT=1` | Skip/render counts, pipeline phase timing |
| silvery strict mode | `SILVERY_STRICT=1` | Incremental vs fresh render comparison |
| React DevTools | `DEBUG_DEVTOOLS=1 bun km view` | Flame graph of component mount/update |
| Debug logging | `DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log` | Detailed render pipeline trace |
| Pipeline phase timing | `DEBUG=silvery:render` or `globalThis.__silvery_last_pipeline` | Per-phase breakdown (measure, layout, content, output) |

## Key Lessons

1. **Profile before fixing.** Five minutes of instrumentation beats four sessions of theorizing. The performance toolkit above exists for a reason -- use it at the start of any performance investigation.

2. **Measure after fixing.** A fix without a benchmark is a hypothesis. The 40x speedup was verifiable: 6447ms to 159ms in the same test, same span timer. "It feels faster" is not evidence.

3. **One session with instrumentation beats four sessions guessing.** Sessions 1-4 picked plausible theories and implemented them. Sessions 5-6 added instrumentation and found the actual problem. The instrumentation sessions were more productive than all previous sessions combined.

4. **Simple caches beat complex rewrites.** A `Map<string, string>` built at load time eliminated the bottleneck. No worker threads, no architectural changes, no Suspense boundaries. The fix was 20 lines.

5. **The hot path is usually in a different layer than you expect.** The problem presented as slow React rendering (UI freezes), but the root cause was SQL queries during render. When profiling, check all layers of the stack, not just the layer where symptoms appear.

6. **Perceived performance can be worse than actual performance.** Progressive column reveal was intended to improve perceived performance. Profiling revealed it was the primary startup bottleneck: 6.4s at 39% CPU utilization. Rendering everything in one frame: 0.8s at 142% CPU. The lesson: progressive/staggered rendering that yields to the event loop can make things slower when per-chunk render time is long and idle time between chunks is significant.

7. **Deep research is expensive per insight.** At $1.50 per query, deep research should be reserved for genuinely novel architectural questions, not diagnosis. "Why is my app slow?" is a profiling question, not a research question.
