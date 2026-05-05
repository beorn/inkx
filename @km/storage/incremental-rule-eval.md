---
aliases:
  - km-storage.incremental-rule-eval
  - km-storage-incremental-rule-eval
created_at: 2026-05-05T17:56:42.746Z
---

# Incremental rule eval — recompute only rules whose dependencies changed #feature #P2

Today evaluateAllRules iterates all 1021 rule nodes on every sync. Only ~20 of them have add queries, but the loop visits every rule node. The bigger issue: even when reconcile produced 0 ops, all rules re-run.

Per user framing: rule-derived embeds are a CACHE. Cache invalidation should be incremental — recompute only entries whose inputs changed.

## What

Track per-rule input signatures. On sync:
1. Compute the set of nodes that changed (from reconcile ops + journal events).
2. For each rule, check if its query domain intersects the changed set.
3. Re-run only the rules whose inputs actually changed.

## Why

- evaluateAllRules takes ~9 s on the user's 1021-rule vault (down from 70+ s after this session's optimisations). For a no-op sync that's still 9 s of wasted work.
- After this fix, no-op sync's rule phase is O(0) — same work as the cursor-skip path but more granular: sync that touches one tag still only re-runs rules that match that tag.
- Pairs with the existing skip-rules-when-cursor-matches: cursor skip is global, this is per-rule.

## Architecture sketch

- Per-rule, store the AST: which mentions / tags / paths it queries.
- Build an inverted index from changed-node-attribute → rules that watch it.
- On reconcile, collect changed-attribute set; intersect with index; re-eval only those rules.
- Index lives in state.db (table: rule_dependencies(rule_node_id, attr_kind, attr_value)) or rebuilt at startup.

## Pairs with

- bulk-sync.fromFsWithProgress — the cursor-match skip already nails the no-op case; this generalises to the partial-change case.
- @km/storage/dont-journal-rule-derived-events — orthogonal; both reduce the per-sync cost of rule-driven boards.

## Acceptance

- Sync where one file in a single tag namespace changes runs only the rules that match that tag.
- Synthetic bench: 5000 files, 100 rules, 1 file edit → rule phase under 100 ms.
- Real-vault sync: rule phase falls below 1 s on a sync with <10 changes.
