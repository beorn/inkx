---
mentions:
  - km
id: "@km/storage/parent-name-unique-partial"
aliases:
  - km-storage.parent-name-unique-partial
  - km-storage-parent-name-unique-partial
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T16:00:00Z
closed_at: 2026-05-01T17:30:00Z
status: closed
close_reason: |
  Shipped: schema v7 → v8 migration in `packages/km-storage/src/db/schema.ts`
  with partial UNIQUE INDEX `idx_nodes_parent_name_fstype` ON `nodes(parent_id,
  name) WHERE fstype IS NOT NULL AND name IS NOT NULL`. Pre-flight
  duplicate check throws a descriptive error listing up to 5 collisions
  before refusing to bump schema_version (no half-migration).

  Tests: `packages/km-storage/tests/parent-name-unique-schema-v8.test.ts`
  with 11 test cases — index existence + partial predicate, blocks
  fs-materialized duplicates (file vs file, file vs folder), allows
  mdsection collisions (fstype IS NULL), allows repo root with name=NULL,
  allows different parents with same name, idempotent re-migration, and
  refuses to upgrade a v7 DB with existing duplicates.

  All acceptance criteria met. Closing.
type: feature
priority: P2
parent: "@km/storage"
closeReason: "Already shipped: schema v8 migration in
  packages/km-storage/src/db/schema.ts with partial UNIQUE INDEX
  idx_nodes_parent_name_fstype. Tests in parent-name-unique-schema-v8.test.ts
  (11 cases) pass. Frontmatter status was set to 'closed' but bd state.db never
  synced — closing now to align."
---

# [x] Partial UNIQUE (parent_id, name) WHERE fstype IS NOT NULL @km/storage #task #P2

Re-files the dropped `@km/storage/parent-name-unique` bead, this time correctly
scoped to filesystem-materialized nodes only. The original (flat) version was
right to drop because mdsections inside a file CAN legitimately collide on
`(parent_id, name)` — `## Goals` appearing twice in the same file is valid
markdown. The partial-by-`fstype` version is the correct constraint.

## Why

Three reasons the partial UNIQUE is worth adding even though `fs_path`
uniqueness is already enforced by the OS filesystem:

1. **Watcher-bug defense**: when km-fs-mount's watcher fires events out of
   order (rename then rename-back, or atomic-write rename detected as
   create+delete), there's a transient window where two rows can briefly
   share `(parent_id, name)` for the same fstype. Today this surfaces as
   "ambiguous resolution" further downstream. A partial UNIQUE catches it
   at the storage seam, where the wrong write fails atomically.
2. **Prerequisite for recursive-walk resolver**: per `KTree.path()` (already
   shipped) and the longer-term `@km/storage/drop-fs-path-derive-from-name`
   direction, path resolution will move from `fs_path` cache reads to a
   `(parent_id, name)` walk. That walk requires `(parent_id, name)` uniqueness
   for the fstype-tier nodes. Adding the constraint now lets the future
   refactor be a pure delete of `fs_path`-related code instead of also having
   to discover and fix latent collisions.
3. **Explicit invariant in the schema**: today the invariant lives in the
   user's mental model ("a folder can only contain one file named foo.md").
   Encoding it in SQL makes the schema self-documenting and gives the test
   suite a hard failure mode for any code that violates it.

## Scope

- Add migration: `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_parent_name_fstype ON nodes(parent_id, name) WHERE fstype IS NOT NULL`.
- Add `WHERE name IS NOT NULL` to the predicate too (a SQL UNIQUE index treats
  NULLs as distinct in SQLite, but be explicit — the repo root has fstype but
  no name, and we don't want partial-index spurious entries for that one row).
- Final predicate: `WHERE fstype IS NOT NULL AND name IS NOT NULL`.
- Migration is **additive** — does not require user-side `.km/state.db` resync.
- Test (`packages/km-storage/tests/`): seed two fs-materialized nodes with
  same `(parent_id, name)`. Expect SQLite UNIQUE constraint failure.
- Test: same seed but at the mdsection layer (fstype = null) — should succeed
  (the constraint deliberately allows it).
- Test: repo root has `fstype` but `name = null` — confirm migration completes
  without the partial index objecting.

## Out of scope

- Healing existing duplicates: the migration runs `CREATE UNIQUE INDEX IF NOT
  EXISTS`. If any vault has pre-existing duplicates, the migration will fail.
  A pre-flight `SELECT parent_id, name, COUNT(*) FROM nodes WHERE fstype IS
  NOT NULL AND name IS NOT NULL GROUP BY parent_id, name HAVING COUNT(*) > 1`
  query in the migration tells the user what to clean up before retrying.
- Dropping `fs_path` — that's `@km/storage/drop-fs-path-derive-from-name`.
  This bead is the prerequisite, not the move itself.

## Acceptance

- New index exists in fresh databases via the standard migration runner.
- `pnpm test` passes (no existing fixtures violate the constraint — they
  shouldn't, but verify).
- A new test in `packages/km-storage/tests/` asserts:
  - INSERT of duplicate `(parent_id, name, fstype)` triplet fails.
  - INSERT of duplicate `(parent_id, name)` with `fstype = NULL` succeeds.
  - Repo root row (fstype set, name null) is unaffected.

## Origin

- /pro 4-leg review 2026-04-30 (item 6) — flagged the dropped flat version as
  over-aggressive and recommended the partial-by-fstype variant.
- Tracking epic: `@km/all/path-name-id-redesign`.
- Replaces (under different scope): closed `@km/storage/parent-name-unique`.

