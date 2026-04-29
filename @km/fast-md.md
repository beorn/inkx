---
id: "@km/fast-md"
aliases:
  - km-fast-md
  - "@km/_orphan/fast-md"
created_at: 2026-01-23T15:25:58Z
closed_at: 2026-01-24T17:52:08Z
assignee: "11507516"
---

# [x] Markdown parsing performance optimizations @km/fast-md #epic #P2 @11507516

Parent bead for all markdown parsing and loading speedups.

## Two-Track Approach

**Track A: Optimize parsing itself (@km/fast-md/0-content-hash-caching-skip-re-parsing-unchanged-fil through .6)**
- Content hash caching
- Module-level regex compilation  
- Fast-path wikilink detection
- Combined parseTaskMetadata regex
- Single-pass heading rules
- Worker pool parallelization

**Track B: Lazy loading architecture (@km/fast-md/7-lazy-loading-discover-only-mode-for-instant-board-)**
- Defer parsing until after board renders
- Stream content in background
- Instant board with structure-only first pass

## Priority

Start with @km/fast-md/7-lazy-loading-discover-only-mode-for-instant-board- (lazy loading) as it gives the biggest perceived speedup - instant board render. Then layer in parsing optimizations (Track A) for overall throughput.