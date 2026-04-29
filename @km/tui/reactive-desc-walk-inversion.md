---
id: "@km/tui/reactive-desc-walk-inversion"
aliases:
  - km-tui.reactive-desc-walk-inversion
  - km-tui-reactive-desc-walk-inversion
created_by: Bjørn Stabell
created_at: 2026-04-18T18:46:54Z
closed_at: 2026-04-18T19:26:54Z
close_reason: "Fixed in commits 089b4629f (core inversion) + 03644e9e8
  (pro-review hardening). 2000x speedup on 100K-column cursorDescendant read
  (100,001 children() calls + 20.84ms → 0 calls + 0.01ms). 33/33 reactive-graph
  tests pass (28 original + 5 new regression tests from pro feedback). Pro
  concerns all addressed: atomicity via startBatch/endBatch, untracked internal
  reads via getActiveSub/setActiveSub, epoch counters instead of version
  self-reads, deferred bootstrap to avoid re-entrant construction. Superseded
  km-tui.board-mount-n-traversal."
---

# [x] Invert descendants(some/count) walk — O(500K) per cursor move → O(depth) @km/tui #bug #P0 @Bjørn Stabell

blocks:: [[@km/tui]]

P0 perf: cursor navigation blocks the event loop for 2s+ per keystroke on large vaults because reactive-graph.ts computes cursorDescendant/editingDescendant by DFS-walking the entire subtree from each ancestor. On a 549K-node vault with 23 columns, each cursor move invalidates all 23 columns' cursorDescendant computeds and each walks its ~100K-descendant subtree — ~2.3M getChildren calls per keystroke.

## Evidence

- Log /tmp/km.log from 2026-04-18 user repro: 2.5M km:storage:cache accesses in a 20s window at mount + 2s blocks per keypress (content render ~12ms, block ~2000ms)
- Agent a77a43e1 (worktree) instrumented computeWalkOrder (the initial suspect) and proved it's NOT the culprit — never called at mount
- Root cause identified by reading apps/@km/tui/src/state/reactive-graph.ts:105 walkDown + :190-198 the some-computed pattern
- Consumers: apps/@km/tui/src/views/TreeNode.tsx:323, :603; shared-components.tsx:74, :227; ColumnsView.tsx:110-112
- Declarations: apps/@km/tui/src/state/reactive.ts:69 (cursorDescendant), :71 (editingDescendant)
- Instrumentation already landed: commit c818dd71b (DEBUG=km:board:walk — zero overhead when off)

## Why the current code explodes

From reactive-graph.ts:190-198 for descriptor type 'some' with dir='down':
  accessor[name] = computed(() => {
    treeVersion()
    if (desc.includeSelf && (get(nodeId))[desc.key]?.()) return true
    for (const vid of walkDown(traversal, nodeId)) {
      if ((get(vid))[desc.key]?.()) return true
    }
    return false
  })

- Short-circuit only helps if cursor is in the first DFS-visited branch
- If cursor moves between sibling columns, every column's computed invalidates and re-walks
- walkDown calls traversal.children(vid) for every node → repo.getChildren → childrenCache.get → in miss case, SQL query
- Math: N columns × subtree_size = O(total_node_count) per cursor move

## Fix direction (the inversion)

For any 'some' or 'count' descriptor where dir='down' and the underlying signal (cursor, editing, ...) is SPARSE — only 0-1 nodes have it truthy at a time:

- Compute once: ancestorSet = walkUp(currentTrueNode) — O(depth) — cached in a signal
- descendantSome(X) = ancestorSet.has(X) — O(1)
- descendantCount(X) = count of trueNodes whose ancestors include X — O(1) with the right map

For dir='down' with a non-sparse signal (done tasks, tags, etc.) OR dir='down' with type='reduce' — keep walkDown (less common, and reduce is already not used in production).

For dir='up' (walkUp for excludedSigils) — already cheap, leave as-is.

## Plan

1. Microbench: apps/@km/tui/tests/reactive-graph-perf.bench.ts — synthetic column with 100K descendants, read cursorDescendant, count getChildren calls. Expect ~100K before fix, ~depth (5-ish) after.
2. Implement: refactor reactive-graph.ts 'some'/'count' + dir='down' path to use sparse-inverted ancestor set. Keep current walkDown implementation for 'reduce' and for non-sparse cases (guarded at descriptor-build time).
3. Verify: full reactive-graph.test.ts (407 lines, 16 test cases covering cursor movement, self-inclusion, multi-child, etc.) passes unchanged. Add edge-case tests: cursor on root, cursor=null, multiple true nodes (for 'count').
4. Verify: full apps/@km/tui/tests/ passes (except pre-existing omnibox 5).
5. /pro review the approach before commit.
6. Commit + push.

## Blast radius

- reactive-graph.ts: internal — the DSL (tree.descendants(s => s.cursor).some()) is unchanged
- reactive.ts: no code change; consumers keep reading cursorDescendant / editingDescendant
- All call sites in TreeNode.tsx, shared-components.tsx, ColumnsView.tsx: unchanged
- Tests in reactive-graph.test.ts: all 407 lines should pass unchanged

## Dependencies

- Instrumentation: c818dd71b (landed on main)
- Related beads: @km/tui/board-mount-n-traversal (supersedes — fold that one's findings into this P0)
- Unrelated: @km/tui/initial-column-height (closed), @km/storage/vault-node-explosion (strategy, pending user decision)