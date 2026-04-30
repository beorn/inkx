---
id: "@km/storage/parent-name-unique"
aliases:
  - km-storage.parent-name-unique
  - km-storage-parent-name-unique
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P1
parent: "@km/storage"
---

# UNIQUE (parent_id, name) for path-resolvable types @km/storage #task #P1

Add a partial UNIQUE index `(parent_id, name)` for node types whose name carries per-parent identity (beads, files, named sections). Bumps SCHEMA_VERSION to 8. Required for path-walk resolution to be correct (a path must yield at most one node).

## Schema delta

```sql
CREATE UNIQUE INDEX idx_nodes_parent_name_unique
  ON nodes(parent_id, name)
  WHERE type IN ('h', 'file', 'folder')
     OR (type = 'p' AND item IS NOT NULL);  -- bead-shaped items
```

Exact predicate to be tuned against real data — beads land as `type='h'` with `item={}` (outline items per knode.md:91), files land as `fstype='file'`, folders as `fstype='folder'`. The partial-index predicate selects exactly the rows whose name should be unique within their parent.

Bump SCHEMA_VERSION = 8 in `packages/km-storage/src/db/schema.ts`. History note: "name uniqueness per parent for path-resolvable types; required by path-via-name-walk resolver."

## Migration

Additive: `CREATE UNIQUE INDEX IF NOT EXISTS …`.

Pre-migration check: scan for existing collisions. If any path-resolvable type has duplicate `(parent_id, name)` rows, the index creation will fail. The migration MUST detect and surface these explicitly:

```typescript
// Migration step 7→8
const collisions = db.query(`
  SELECT parent_id, name, COUNT(*) as n
  FROM nodes
  WHERE <same predicate as the index>
  GROUP BY parent_id, name
  HAVING COUNT(*) > 1
`).all()
if (collisions.length > 0) {
  throw new Error(`Cannot install parent-name-unique index: ${collisions.length} collisions. Run 'km doctor name-collisions' to inspect.`)
}
```

Add `km doctor name-collisions` subcommand that lists colliding (parent_id, name) groups and the rows in each. User resolves manually before re-running migration.

## Acceptance

- SCHEMA_VERSION = 8; migration runs cleanly on a fresh repo and on an existing repo with no collisions.
- Migration BLOCKS with a clear error message if collisions exist; `km doctor name-collisions` reports them.
- Insert that would violate uniqueness fails with a useful error (not a generic "constraint failed").
- `packages/km-storage/tests/schema.test.ts` covers: clean migration, blocked migration with collisions, post-migration insert collision.

## Why this matters

The path-walk resolver assumes `(parent_id, name)` lookups return at most one row. Without the UNIQUE constraint, a path could yield multiple nodes (silently picking the first), leading to non-deterministic resolution. The constraint enforces the invariant the resolver depends on.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Blocks: `@km/beads/resolver-path-via-name-walk`.
