---
id: "@km/storage/parent-name-unique"
aliases:
  - km-storage.parent-name-unique
  - km-storage-parent-name-unique
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
closed_at: 2026-04-30T09:38:00Z
status: closed
close_reason: |
  Dropped — not needed. The user pointed out (2026-04-30 09:34) that path
  resolution is already implemented via fs_path (idx_nodes_fs_path) in
  packages/km-storage/src/db/queries/smart-resolver.ts. The fs_path uniqueness
  invariant is enforced by the underlying filesystem (you can't have two files
  at the same OS path), so no DB-level UNIQUE (parent_id, name) is needed for
  fs-materialized nodes. Mdsections inside a file CAN have name collisions
  (two `## Goals` is valid markdown) — but mdsections aren't separately
  path-resolvable; they share the parent file's fs_path. So the constraint
  was redundant for files/folders and wrong for mdsections.

  Also, the predicate I'd written (`WHERE type IN ('h', 'file', 'folder')`)
  conflated `type` (markdown shape: h/p/code/...) with `fstype` (filesystem
  materialization: repo/folder/file/mdsection — schema.ts:157). The right
  predicate would have been `WHERE fstype IS NOT NULL` — but the constraint
  isn't needed at all.

  Dropped without filing follow-up.
type: feature
priority: P1
parent: "@km/storage"
---

# UNIQUE (parent_id, name) — DROPPED

See close_reason above. fs_path uniqueness is already enforced by the OS
filesystem. The proposed DB-level UNIQUE constraint was redundant.
