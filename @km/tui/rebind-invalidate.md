---
mentions:
  - km
id: "@km/tui/rebind-invalidate"
aliases:
  - km-tui.rebind-invalidate
  - km-tui-rebind-invalidate
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:51Z
owner: bjorn@stabell.org
---

# [ ] reactive-graph: rebind() must invalidate cached computeds @km/tui #task #P2

## What

When reactive-graph's rebind(traversal) is called, it updates the traversal closure variable but does NOT invalidate cached computeds (descendants/ancestors). This means per-node computed signals that walked the tree continue returning stale values until a DIFFERENT signal they depend on changes.

## Root Cause

In packages/silvery-selection/src/reactive-graph.ts (or apps/@km/tui/src/state/reactive-graph.ts), rebind() updates the traversal variable but computed() caches are tied to signal dependencies, not to the traversal itself. alien-signals has no concept of "something outside changed, re-evaluate."

## Impact

Discovered in @km/tui/auto-derive-selected session: moving selection writes out of hydrate() caused card-bg-inheritance tests to fail because selectedAncestor computeds were cached from the first render (with empty traversal). The workaround was to call setSelection() after rebind() to force invalidation via signal writes.

## Fix Options

1. **Version signal**: rebind() bumps a shared "tree version" signal; all computeds depend on it. Cleanest but adds a dependency to every computed.
2. **Explicit invalidation**: rebind() walks all cached nodes and calls an internal invalidate() on each computed. Requires reactive-graph to expose invalidation hooks on computeds (alien-signals may not support this).
3. **Re-create nodes on rebind**: Clear the nodes map and force recreation. PROBLEM: breaks React subscriptions (existing comment in rebind warns against this).
4. **Document the workaround**: Require callers to write to a sentinel signal after rebind. Works but leaks implementation detail.

Recommended: Option 1 (version signal).

## Acceptance Criteria

- [ ] rebind() invalidates all tree-walking computeds automatically
- [ ] hydrate() no longer needs to re-call setSelection() after rebind
- [ ] Tests pass without the workaround
- [ ] Document the new guarantee in reactive-graph.ts comment

