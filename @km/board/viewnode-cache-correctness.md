---
mentions:
  - km
id: "@km/board/viewnode-cache-correctness"
aliases:
  - km-board.viewnode-cache-correctness
  - km-board-viewnode-cache-correctness
created_by: Bjørn Stabell
created_at: 2026-04-02T15:13:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-board.viewnode-cache-correctness
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-15T12:19:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] ViewNodeColumnCache: fix correctness vs explore faster derivation @km/board #task #P2

blocks:: [[@km/tui]]

## Problem

ViewNodeColumnCache caches per-column ViewNode subtrees, keyed on column node ID, invalidated by reference identity on the column's children array. This misses grandchild content changes -- editing a sub-item's content doesn't bust the column's cache, causing stale display until something forces a cache miss.

Shipped workaround (0039dcfc): bust grandparent cache on updateNode. Works but is fragile -- every future mutation path needs similar ancestor busting.

## Root Cause Analysis (from /big)

The cache invalidates on structural changes (children added/removed/reordered) but not content changes. The childrenRef identity check only detects when getChildren() returns a NEW array (busted cache). Content edits bust the card's children cache but not the column's -- so the column cache hit returns a stale ViewNode subtree.

This is a class of bugs, not a one-off: any edit to a node deeper than column's direct children is invisible until a structural change forces a cache miss.

## Options to Explore

### Option A: Make cache correctly invalidate on content changes

- Add a content hash or version per column subtree
- Bust when any descendant version changes
- Pro: keeps the cache, correct invalidation
- Con: computing subtree hash may cost as much as rebuilding

### Option B: Delete the cache entirely

- Column derivation may already be fast enough
- Pro: eliminates the bug class, simplest code
- Con: potential perf regression on large boards (1000+ cards)

### Option C: Make ViewNode derivation faster so cache is unnecessary

- Incremental/structural sharing (persistent data structures)
- Pro: fast AND correct by construction
- Con: highest implementation effort

### Option D: Finer-grained cache (per-card instead of per-column)

- Cache at card level with per-card version stamps from repo
- Pro: invalidates correctly at the right granularity
- Con: more cache entries, more bookkeeping

## Benchmarking Plan

Before deciding, measure actual derivation cost:

1. Add timing to buildViewTree / buildColumnNodeCached (with vs without cache)
2. Test on real vaults: small (~50 cards), medium (~200), large (~1000+ Asana vault)
3. Measure per-render in key handler path (board-app.ts buildActionCtx) -- runs on every keystroke
4. Measure in React render path (useColumns hook) -- runs on state changes
5. Compare: if full rebuild is <2ms on large boards, Option B wins; if >5ms, Option A or D needed

## Related

- @km/all/simplification, @km/tui/viewnode-cache (architecture review)
- @km/tui/tree-edit-nav (edit navigation uses tree traversal)
- Workaround: grandparent cache bust in repo.ts (0039dcfc)

