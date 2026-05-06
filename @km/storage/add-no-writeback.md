---
mentions:
  - km
id: "@km/storage/add-no-writeback"
aliases:
  - km-storage.add-no-writeback
  - km-storage-add-no-writeback
created_by: claude:bca35d62
created_at: 2026-02-11T16:32:05Z
closed_at: 2026-02-11T18:33:46Z
owner: bjorn@stabell.org
---

# [x] km add: events written to JSONL but not applied to DB or filesystem @km/storage #bug #P2

## Bug

`km add` reports success ('Linked 122 tasks') but the target .md file remains unchanged.

## Root Cause

`createEmitter({ kmDir })` at repo.ts:879 creates an emitter WITHOUT a db reference. When `add.ts` calls `emitNodeCreatedWithEmitter(repo.emitter, ...)`, the emit pipeline:

1. ✅ Persist to events.jsonl — works (14MB of events written)
2. ❌ Apply to DB — skipped (emitter.defaultDb is null)
3. N/A Broadcast — no eventHub in CLI
4. ❌ FsWriter.handleNodeCreated — runs but getSubtree() returns no children (node wasn't inserted into DB in step 2)

The DataStore's own mutation methods (repo.ts notifyFs) work correctly because they mutate the DB directly THEN notify fsSync. But external callers using `emitNodeCreatedWithEmitter` bypass the DataStore and hit this gap.

## Fix Options

1. **Pass db to createEmitter**: `createEmitter({ kmDir, db })` at repo.ts:879. Simple but couples the emitter to the specific db instance.
2. **Use Repo API**: `add.ts` should use repo-level mutation methods (e.g. `repo.createNode()`) instead of raw emitter. This ensures mutations flow through DataStore → DB → fsSync correctly. (Preferred — follows layered architecture.)
3. **Expose repo.db for EmitOptions**: Let callers pass `{ db: repo.db }` — leaky but backward compatible.

Option 2 is cleanest. The Repo should expose a `createNode()` or `addChild()` method that handles the full pipeline.

## Files

- apps/@km/_orphan/cli/src/commands/add.ts (caller)
- packages/@km/storage/src/emitter.ts (pipeline)
- packages/@km/storage/src/repo.ts:879 (emitter creation without db)
- packages/@km/storage/src/watch/fs-writer.ts (FsWriter that needs db-applied node)

