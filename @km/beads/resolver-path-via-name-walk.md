---
id: "@km/beads/resolver-path-via-name-walk"
aliases:
  - km-beads.resolver-path-via-name-walk
  - km-beads-resolver-path-via-name-walk
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P1
parent: "@km/beads"
---

# Resolver: path → id via name-walk @km/beads #task #P1

`resolveShortId` translates a path input (`@km/beads/foo`) into a node id by walking the parent_id chain from root, matching `name` segments. This becomes the canonical fast path; the json_extract scan over `data.id` is removed.

## Why

- Today: `resolveShortId` does three sequential `json_extract` scans over `data.id`, `data.short_id`, and `json_each(data.aliases)` — O(N) JSON scans for the hot path.
- New model (per `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`): id, name, path are three distinct things. id stays ULID. name is the path segment (already in `nodes.name`, already indexed via `idx_nodes_name` at `schema.ts:219`). Path is composed by walking parent_id chain.
- Resolution by path = walk root by name, segment by segment. Each step is an indexed lookup. Bounded by path depth (~3-5 levels for beads).

## Resolution priority (resolveShortId rewrite)

1. **id (direct ULID)** — input matches `nodes.id` directly. Single pkey lookup. Used by code paths that already hold an id.
2. **path (name-walk)** — input starts with sigil (`@<prefix>/`) or contains `/`. Split into segments. Recursive CTE walks `(parent_id, name)` from root; returns the leaf id.
3. **legacy bd-form** — input is `<prefix>-<scope>.<slug>`. Falls through to `data.aliases` `json_each` scan. Kept for backward compat with old bead files.

Drop: the current `data.id` json_extract scan in step 1 (it duplicated step 2's path-walk). Drop after migration confirms no caller depends on it.

## Acceptance

- `bd show @km/beads/foo` works via name-walk; no json_extract on `data.id`.
- `bd show <ulid>` works via direct lookup.
- `bd show km-beads-foo` (legacy bd-form) still resolves via aliases fallback.
- `packages/km-beads/tests/resolve-id.property.test.ts` covers all three input shapes.
- `EXPLAIN QUERY PLAN` for the path-walk shows index use of `idx_nodes_parent_order` or `idx_nodes_name` at each step.

## Depends on

- `@km/storage/parent-name-unique` — must land first so `(parent_id, name)` lookups during the walk return at most one row.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md` (FINAL VERDICT block).
- Closes a class of bugs: claim-loses-issue (d14054dd6), close-drop-data-wipe (3309b3512). With `data.id` no longer load-bearing for resolution, partial JSON updates can't break identity resolution.
