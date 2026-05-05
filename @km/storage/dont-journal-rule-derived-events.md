---
aliases:
  - km-storage.dont-journal-rule-derived-events
  - km-storage-dont-journal-rule-derived-events
created_at: 2026-05-05T17:56:21.566Z
---

# Don't journal rule-derived events — they're recomputable from rule + DB state #refactor #P2

Per user 2026-05-05: 'rules changes shouldn't go into changes.jsonl — they're more derived stuff and could be re-derived'.

## The bug shape

Rule eval today produces two kinds of state changes:

1. **Direct DB mutations** — evaluateAddRule does raw db.run() to insert/delete embed nodes. These already DO NOT enter the journal (good).
2. **Indirect file-write events** — Phase 3 writeback materialises rule output back into the .md file. The fs-watch then re-parses the new file content, emitting node_created / node_updated / node_deleted events into changes.jsonl for every embed line the rule just wrote.

(2) is the leak: the journal accumulates a re-parsed shape of rule-derived material, which is recomputable from (rule + DB state) on demand.

## What

Tag rule-driven file write-backs so the parser / fs-watch path can skip emitting their derived embed events to the journal. State.db gets the new shape (cache update); the journal stays free of recomputable noise. Rule eval re-runs after replay so cache rebuilds correctly.

## Why

- Pairs with @km/storage/journal-compaction — even with compaction, every sync that touches a rule-driven board re-pollutes the journal.
- Reframes rule-derived embeds as a CACHE (the user's framing) rather than authored content. Cache invalidation = recompute on demand, not persist forever.
- Cleans up the silvercode2-reported '^@sigil 15× per sync' corruption: the parser never sees the materialised embed line, so it can't keep accumulating it.

## Architecture sketch

- Add a 'derived' flag to the writeQueue op type. Rule writeback queues with derived=true.
- In WriteQueue.flush, derived writes go through a write path that marks the file's next inotify event as 'expected, do not journal'.
- Or simpler: split the .md file into a user-authored section + a 'rule-derived' section (e.g. between markers). Parser only journals the user-authored half.
- Loader / replay: after replaying journal, call evaluateAllRules to re-derive embeds.

## Pairs with

- @km/storage/journal-compaction — independent fix; compaction handles legacy noise, this prevents future noise.
- @km/all/path-name-id-redesign — separate, closed.

## Acceptance

- After 50 syncs that touch rule-driven boards, changes.jsonl growth is bounded by user-authored events only (no embed_of churn).
- Cold load from journal + replay + evaluateAllRules produces an identical state.db to before.
- Synthetic test in big-repo-sync.bench.ts that runs 100 syncs and asserts journal growth ≤ 1 KB per sync (down from MB).

## Implementation (2026-05-05)

The leak path turned out to be subtler than the architecture sketch suggested. Tracing through:

1. `evaluateAddRule` mutates the DB directly via `ops.addNode` — no journal entry. ✓
2. The bulk-sync writeback path materializes the rule output back to disk via `WriteQueue` + `safeWriteFile`. The watcher's echo-guard suppresses the resulting fs event. ✓
3. **But** `cfgWriteImpl` only refreshed `fs_content_hash` on the DB row after a successful write — leaving `fs_mtime`, `fs_size`, and `fs_ino` lagging the disk state. Next bulk-sync's reconcile saw `entry.mtime !== existingByPath.fs_mtime`, emitted an `update` op, re-parsed the file, and re-emitted node_created/updated/deleted events for every embed the rule had just written. **This** is the leak — bulk-sync re-parsing rule-modified files because the DB's stat tracking lagged.

The fix is surgical, not structural: in `packages/km-fs-mount/src/watch/sync.ts`, the post-write CAS update now refreshes `fs_content_hash + fs_mtime + fs_size + fs_ino + fs_dev` atomically from the post-write `statSync()`. The next reconcile sees zero drift → no update op → no re-parse → no events.

Benefits beyond rule writebacks: any internal writeback (heartbeat re-projection, `sync-to-fs`, in-app edits) gets the same correctness — the DB row is the canonical "what km saw last on disk" baseline, and that baseline now stays aligned through km's own writes.

Tests:
- `packages/km-fs-mount/tests/watch/withsync-writeback-stat-refresh.slow.test.ts` — asserts post-write stat fields match `statSync(file)` exactly, AND a follow-up `syncFromFs()` emits zero `fs-watch` events for the just-written file (the 50-syncs-zero-growth acceptance, distilled to one sync since the property is deterministic).
