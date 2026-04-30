---
id: "@km/storage/drop-fs-path-derive-from-name"
aliases:
  - km-storage.drop-fs-path-derive-from-name
  - km-storage-drop-fs-path-derive-from-name
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:50:00Z
type: refactor
priority: P3
parent: "@km/storage"
---

# Drop nodes.fs_path; derive full path from name + parent walk @km/storage #refactor #P3

`fs_path` today is a denormalized cache of `(name + parent walk)`. It's redundant and creates a rename-cascade (folder rename → UPDATE fs_path on every descendant). Same staleness pattern as `data.id`, just at a different layer. Could be eliminated.

**P3 because**: this is a sizable refactor (touches reconciler, watcher, smart-resolver, every fs_path reader), the perf trade-off is real (O(log N) index lookup → O(depth) recursive CTE), and the current code works. Worth doing eventually for consistency with the "don't store derivable values" thread, but not blocking any active work. File now so it's tracked.

## Why

Per the 2026-04-30 path/name/id design discussion, the canonical model is:

- **id** = ULID (stable, opaque, internal)
- **name** = path segment (one slug per node)
- **path** = composition of names by walking parent_id chain to root

`fs_path` denormalizes the path materialization onto every fs-typed row. Concrete example: a bead at `<vault>/@km/beads/foo.md` has:
- `name = "foo"` ← the segment
- `fs_path = "@km/beads/foo.md"` ← the materialized path
- `parent_id = <id of @km/beads folder>`

The full path is computable from the parent walk + name + ".md" extension for files. Storing `fs_path` is a perf optimization (skip the walk on every lookup) at the cost of:

1. **Rename cascade**: renaming folder `@km/beads` → `@km/issues` requires `UPDATE fs_path` on every descendant row, plus markdown content rewrites. With derive-on-demand, only the renamed folder's `name` changes; descendants inherit via walk.
2. **Storage**: every fs-typed node carries a redundant string column.
3. **Doc drift**: `storage.md:214,263,399` says "absolute path"; `loader.ts:1158` normalizes to relative; `storage.md:123` flags absolute as a `km doctor` health issue. The doc/code mismatch is a symptom of a derived value being treated as authoritative.

## Trade-off

| Today (cache fs_path) | Proposed (derive from name + walk) |
|---|---|
| `idx_nodes_fs_path` → O(log N) lookup | Recursive CTE → O(depth × log N), depth typically 3-5 |
| Folder rename cascades through all descendants | Folder rename = `UPDATE name` on one row |
| `node.fs_path` is the authoritative materialized path | `pathOf(node)` is a derive-helper; nothing stored |
| Doc says "Absolute path" but it's relative | Path is unambiguously derived from parent walk + name |

The perf hit on resolve is small (depth 3-5). The rename win is structurally clean.

## Implementation sketch

1. Add `pathOf(repo, id)` that walks parent chain + appends extension for files. Already in `@km/all/path-derivation-helper`.
2. Replace `fs_path` reads with `pathOf` calls one site at a time. Each replacement is small.
3. After all readers migrate: schema migration to drop the column + `idx_nodes_fs_path`.
4. Smart-resolver's `fs_path` LIKE matching becomes a recursive name-walk.
5. Watcher / reconciler: today they read fs_path to know "where is this file on disk?". Replace with `pathOf` + vault root prefix.

## Migration path

Multi-phase:
- **Phase 1**: Add `pathOf` helper. Make all reads go through it (with a default that falls back to the cached column for compat).
- **Phase 2**: Remove the column reads. Helper computes from walk only. `fs_path` becomes write-only (still updated for compat but never read).
- **Phase 3**: Drop the column. Bump SCHEMA_VERSION.

Each phase ships independently. Phase 1 is safe (additive). Phases 2-3 require all readers migrated.

## Acceptance

- `nodes.fs_path` column dropped. SCHEMA_VERSION bumped (e.g., 7 → 8 — but coordinate with whatever other migrations land).
- `idx_nodes_fs_path` dropped.
- All `fs_path` references in `packages/km-storage/`, `packages/km-beads/`, `apps/km-cli/`, `apps/km-tui/` go through `pathOf`.
- Smart-resolver's `resolveRelativePath` rewritten to use the recursive name-walk. EXPLAIN QUERY PLAN shows index use of `idx_nodes_parent_order` + `idx_nodes_name` per step.
- Folder-rename test: rename a parent folder, descendants' `pathOf()` returns the new path immediately (no cascade UPDATE needed in DB).
- Doc updates: `storage.md:214,263,399`, `knode.md`, `packages/km-storage/CLAUDE.md` all reflect that path is derived, not stored.

## Out of scope

- Memory mode `path:line` id strategy (separate question).
- Mdsection identity (sections inside a file inherit fs_path today; future work).

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md` (FINAL VERDICT block — id/name/path three-concept model).
- Pairs with: `@km/all/path-derivation-helper` (the helper that makes this possible) and `@km/beads/data-id-stop-writing` (same theme — don't store derivable values).
- Lower-priority sibling of the same architectural thread: derive paths, don't denormalize them.
