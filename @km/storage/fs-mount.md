---
id: "@km/storage/fs-mount"
aliases:
  - km-storage.fs-mount
  - km-storage-fs-mount
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:25:09Z
closed_at: 2026-04-22T07:56:35Z
close_reason: "Extracted @km/fs-mount package with fs/ + watch/ + store/fs.ts
  (~28 source files, 25 tests). Backward-compat re-exports from @km/storage mean
  apps import unchanged. km-fs-mount 415/415, km-storage 1066/1066, typecheck at
  baseline. Scope note: 17 legacy @km/storage files still import node:fs
  (DO-NOT-MOVE list); making @km/storage truly FS-free is a follow-up bead."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.fs-mount
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:08Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.fs-mount
    depends_on_id: km-storage.reconciliation-harness
    type: blocks
    created_at: 2026-04-21T21:50:02Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] FsMount (@km/fs-mount) — formalize existing FS split into package boundary @km/storage #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]], [[@km/storage/reconciliation-harness]]

Formalize the existing FS split inside @km/storage into a package boundary. ~2-day refactor, not a green-field build.

## Current state (already separated)
@km/storage has substantial separation:
- store/base.ts — abstract BaseStore with read ops
- store/memory.ts, store/fs.ts, store/sqlite.ts — three concrete backends. SqliteStore is already FS-free (web/canvas-ready).
- fs/ (~1100 LOC) — CAS, file-tree, ignore, path-utils
- watch/ (~5000 LOC) — watcher + reconcile + sync + writequeue

## What this bead does
1. Move fs/ + watch/ + store/fs.ts → new @km/fs-mount package
2. Leave BaseStore + MemoryStore + SqliteStore + withReactive() in @km/storage (backend-agnostic)
3. Enforce via tsconfig: @km/core + @km/storage fail typecheck if they import node:fs
4. Update in-place reconciliation to inode-primary cascade per hub/km/storage-architecture.md §3
   - Most primary/secondary signals already in watch/reconcile.ts + watch/node-differ.*
   - This is a revision, not a rewrite
5. Add fs_dev to KNode schema (required by §3.2 inode logic)

## Boundary
- @km/fs-mount owns: watcher, path+inode tracking, CAS, echo suppression, minimal-patching serializer, rename detection
- @km/storage owns: BaseStore + backends + query layer + withReactive
- @km/core owns: NodeId, RepoId, KNode, Op types — pure domain
- @km/markdown owns: parse/serialize — consumed by fs-mount

## No premature Adapter
Per pro round-1: when CardDAV / Notion / Automerge actually ships as second consumer, extract commonality then. Not before.

Children: reconciliation-harness (blocking), identity-recovery-cascade, markdown-fidelity-corpus.