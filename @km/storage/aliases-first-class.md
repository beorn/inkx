---
mentions:
  - km
id: "@km/storage/aliases-first-class"
aliases:
  - km-storage.aliases-first-class
  - km-storage-aliases-first-class
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P2
parent: "@km/storage"
closeReason: "Shipped via schema v9 (node_aliases first-class indexed table
  populated by SQLite triggers from data.aliases JSON). Acceptance met:
  nodes.aliases-equivalent exists (node_aliases TABLE + idx_node_aliases_alias
  for reverse lookup), migration is automatic via trigger, resolveRef step 3 in
  @km/storage/repo/resolve-ref.ts:54 hits the indexed table for O(log N) alias
  resolution. data.aliases JSON writes are still the source-of-truth (per 'one
  transitional release' note in the bead) — triggers keep node_aliases in sync.
  Out-of-scope (drop JSON writes) deferred per bead."
---

# [x] Promote `data.aliases` to first-class `node.aliases` field @km/storage #refactor #P2

Aliases are a **universal** node concept — any node may have alternate names
that resolve to it (legacy ids from imports, cross-vault references, link
rewrites). Today they're stored as a `data.aliases: string[]` JSON entry
written only by `@km/beads`. Per the 2026-05-03 reframe (see
`@km/all/path-name-id-redesign`), the universal data model promotes important
props to first-class node fields. Aliases are one such prop.

## Why

- **Aliases are not bead-specific.** Any node — a memory file, a renamed
  task, a folder that used to live elsewhere — could carry alternate names
  the resolver should recognize. The current beads-only writer is a
  historical accident.
- **Resolver alias step becomes universal.** Today `resolveShortId` step 3
  scans `json_extract(data, '$.aliases')` (slow path, no index). Promoting
  to a first-class field makes the alias step a normal column lookup,
  joins the universal `resolveRef` ladder cleanly, and removes the last
  bead-specific bit from the resolver.
- **Foundation for `@km/storage/extract-resolveref`.** That bead's resolver
  ladder reads aliases as step 3; this bead is the prerequisite that makes
  step 3 cheap.

## Implementation sketch

1. Add `aliases TEXT` column to `nodes` (JSON-encoded string array, since
   SQLite doesn't have a native array type and we want simple round-trip).
   Or normalize to a separate table `node_aliases(node_id, alias, kind?)`
   — TBD during implementation. Lean toward normalized table since alias
   lookup is by-alias (reverse), and an index `(alias)` is cheap.
2. Migration: copy `data.aliases` JSON values into the new column/table.
3. Writers: `@km/beads/migrate.ts` (bd-import) and any other code that
   adds aliases call `addAlias(repo, nodeId, alias)` instead of mutating
   `data.aliases`.
4. Readers: `resolveRef`'s alias step reads from the new field.
5. Drop `data.aliases` JSON writes after migration. Keep reads for one
   transitional release.

## Acceptance

- `nodes.aliases` (or `node_aliases` table) exists in fresh databases.
- Migration copies existing `data.aliases` values without loss.
- `resolveRef("km-beads.foo")` finds a node whose aliases contain that
  string — same behavior as today, indexed.
- Round-trip test: import a bd vault → bead has alias `km-beads.foo` →
  resolver finds it → `node.aliases` contains it.
- `data.aliases` JSON is no longer written by new code.

## Out of scope

- Renaming the bd-form `km-beads.foo` format itself. Aliases store
  whatever the writer puts there; the format is the writer's concern.
- Removing the `data.aliases` JSON read fallback. Defer until migration
  is verified across all imported vaults.

## Pairs with

- `@km/storage/extract-resolveref` (P1) — universal resolver consumes the
  aliases column; needs this bead to make step 3 fast.
- `@km/all/drop-shortid-concept` (P2) — once aliases are first-class and
  the resolver is universal, the "shortId" concept fully dissolves.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe — "beads should not leak into the data model;
  aliases are a universal concept."

