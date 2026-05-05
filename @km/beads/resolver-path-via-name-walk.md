---
mentions:
  - km
id: "@km/beads/resolver-path-via-name-walk"
aliases:
  - km-beads.resolver-path-via-name-walk
  - km-beads-resolver-path-via-name-walk
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P1
parent: "@km/beads"
closeReason: "Shipped: resolveShortId in @km/beads/src/short-ids.ts now
  delegates to universal resolveRef in @km/storage (3-step ladder:
  ULID/path/alias). Step 4 compat fallback reads data.id/data.short_id for
  legacy fixtures only. resolveRef uses repo.resolveNode for path-form
  (idx_nodes_fs_path) — no more redundant json_extract over data.id. See
  @km/storage/extract-resolveref (also closed)."
---

# [x] Bead resolver delegates to repo.resolveNode for path-form input @km/beads #task #P1

Rewrite `resolveShortId` (in `packages/km-beads/src/short-ids.ts`) to delegate to the repo's existing `resolveNode` for path-form input, which already handles `fs_path`-based lookup with `idx_nodes_fs_path`. Keep the json_each scan over `data.aliases` as the legacy bd-form fallback.

## Why this is small

Path resolution is **already implemented** via `fs_path` in `packages/km-storage/src/db/queries/smart-resolver.ts:278-305` (`resolveRelativePath`). When a bead lives at `<vault>/@km/beads/foo.md`, its `fs_path` column equals `"@km/beads/foo.md"` (or whatever the vault-relative form is). `bd show @km/beads/foo` already routes through `resolveNode` from some CLI paths (`apps/km-cli/src/commands/bd.ts:409, 638`).

What's slow today is `resolveShortId` doing **three sequential json_extract scans** over `data.id`, `data.short_id`, and `data.aliases` (`short-ids.ts:95-126`). The first two are redundant — `data.id` value equals `fs_path` minus `.md`, so `resolveNode` already finds it via the indexed `fs_path` lookup.

## The change

`resolveShortId(input, { repo })`:

1. **id (direct ULID)** — input matches `nodes.id` exactly. `repo.getNode(input)` if non-null returns the input; cheap.
2. **path-form via resolveNode** — input contains `/` or starts with sigil `@<prefix>/`. Delegate to `repo.resolveNode(input)`. Indexed `fs_path` lookup. Drop the `data.id` json_extract scan.
3. **legacy bd-form** — input matches `<prefix>-<scope>.<slug>`. Falls through to `data.aliases` `json_each` scan. Kept for backward compat.

Drop step 1 (`data.id` json_extract) and step 2 (`data.short_id` json_extract) of the current implementation. Keep step 3 (`data.aliases`) for legacy ids that don't appear in `fs_path` (e.g., `km-beads-foo` aliases are NOT path-form, so resolveNode can't find them).

## Acceptance

- `bd show @km/beads/foo` works — routes through `resolveNode`'s fs_path match (no json_extract).
- `bd show <ulid>` works — direct id match.
- `bd show km-beads-foo` (legacy bd-form) still resolves via aliases fallback.
- `packages/km-beads/tests/resolve-id.property.test.ts` covers all three input shapes.
- `EXPLAIN QUERY PLAN` for the path resolution shows index use of `idx_nodes_fs_path`, not a full table scan over JSON.

## Out of scope (was overscoped before)

- No schema migration. `nodes.id` stays ULID. `fs_path` already exists and is indexed.
- No new column.
- No `(parent_id, name)` UNIQUE — dropped (see `@km/storage/parent-name-unique`).
- No new resolver — reuse `resolveNode`.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Closes a class of bugs: claim-loses-issue (d14054dd6), close-drop-data-wipe (3309b3512). Once `data.id` is no longer load-bearing for resolution, partial JSON updates can't break identity resolution.
- Pairs with `@km/beads/data-id-stop-writing` — the next step that actually removes the `data.id` write.

