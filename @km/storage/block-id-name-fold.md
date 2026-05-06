---
mentions:
  - km
  - claude
id: "@km/storage/block-id-name-fold"
aliases:
  - km-storage.block-id-name-fold
  - km-storage-block-id-name-fold
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:32:31Z
closed_at: 2026-04-22T18:12:52Z
close_reason: "Shipped commit 393beab08. Schema v6: UPDATE name=block_id
  (anchor-wins) + DROP COLUMN block_id + DROP INDEX. 41 files migrated. @km/core
  KNode.block_id removed. @km/markdown parse+serialize anchors via .name.
  node-differ Phase 1 is (parent, type, name). New identity-schema-v6.test.ts (5
  tests) verifies migration. 7182 tests pass, typecheck baseline."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.block-id-name-fold
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T08:33:03Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Fold block_id → .name (finish identity-schema) @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The identity-schema bead (closed 2026-04-22) shipped only the schema-additive half: added fs_dev/fs_size/fs_content_hash + branded NodeId/RepoId. The other half named in the original scope — folding the block_id column into .name per hub/km/storage-architecture.md §2.3 ('if a ^anchor is present in markdown, it IS the node's name; no separate block_id/anchor field') — was deferred to this bead.

Without the fold, km keeps TWO identity columns (block_id + name). Per docs/lessons/refactoring.md Case Study 1 ('backward-compatibility wrappers block migration'), both paths stay alive forever — resolver reads from either, writers populate either, and every future identity-touching change has to handle both. The half-done migration is the trap.

## Scope

1. Data migration (schema v6 DATA_VERSION bump):
  - UPDATE nodes SET name = block_id WHERE block_id IS NOT NULL AND (name IS NULL OR /* anchor-wins rule */ /* per §2.3 */)
  - Idempotency: migration-gated by DATA_VERSION
2. Drop block_id READS throughout @km/storage:
  - packages/@km/_orphan/fs-mount/src/watch/handlers/node-differ.ts phase-1 'block_id match' → use name
  - packages/@km/storage/src/store/memory.ts:315 wikilink resolver
  - packages/@km/storage/src/db/queries/smart-resolver.ts:368-379
  - packages/@km/storage/src/markdown/link-resolver.ts:92-93 block_id stmt
  - packages/@km/_orphan/fs-mount/src/testing/fake-repo.ts:431-435
3. Drop block_id WRITES:
  - packages/@km/_orphan/fs-mount/src/watch/change-handlers.ts:152 (now emits node_updated block_id — retarget to name)
  - packages/@km/storage/src/markdown/pipeline.ts (batch back-write)
  - packages/@km/_orphan/fs-mount/src/watch/handlers/create-handler.ts:137-139
4. Drop block_id column:
  - ALTER TABLE drop idx_nodes_block_id, drop block_id column
  - Update NODE_COLUMNS, INSERT statements, rowToNode
  - Bump SCHEMA_VERSION to 6
5. Tests + fidelity corpus green.

## /complete criteria

- grep -rn 'block_id' packages/ → zero hits in src/ (migration helper comments allowed)
- SCHEMA_VERSION === 6
- All tests pass including fidelity corpus
- node-differ three-phase matching reframed to name → content-hash → ordinal

## Why this is a real bead, not cosmetic

See Case Study 1: the Domain Objects Migration failed for exactly this reason — backward-compat wrappers meant old patterns persisted. Shipping the fold forces all identity resolution through one column and closes the §2.3 contract.

