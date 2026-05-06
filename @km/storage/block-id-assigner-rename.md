---
mentions:
  - km
  - claude
id: "@km/storage/block-id-assigner-rename"
aliases:
  - km-storage.block-id-assigner-rename
  - km-storage-block-id-assigner-rename
created_by: claude:8b5b9e1c
created_at: 2026-04-22T18:35:10Z
closed_at: 2026-04-22T18:42:41Z
close_reason: Shipped commit 3bd284cd3. BlockIdAssigner → AnchorAssigner,
  createBlockIdAssigner → createAnchorAssigner, blockIds → anchors, param
  blockId → anchor. 7 files touched, 13 identifiers renamed. grep for
  BlockIdAssigner|blockIdAssign = 0. typecheck baseline. 7182 tests pass.
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.block-id-assigner-rename
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T11:35:25Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Rename BlockIdAssigner → AnchorAssigner (cosmetic completion of block-id fold) @km/storage #task #P3 @claude:8b5b9e1c

blocks:: [[@km/storage]]

/complete flagged: the block-id-name-fold bead (commit 393beab08) eliminated the block_id column + KNode field but left the BlockIdAssigner class name + createBlockIdAssigner factory. The mechanism now assigns anchor names (stored in .name) but the identifier still says 'BlockId'. Pure cosmetic consolidation.

## Scope

- packages/@km/_orphan/fs-mount/src/watch/bulk-sync.ts: BlockIdAssigner → AnchorAssigner; createBlockIdAssigner → createAnchorAssigner
- packages/@km/_orphan/fs-mount/src/watch/change-handlers.ts: createBlockIdAssigner method + caller
- packages/@km/_orphan/fs-mount/src/watch/index.ts: barrel export
- packages/@km/_orphan/fs-mount/tests/watch/embed-blockid-emits.test.ts: caller
- Any other grep hits for BlockIdAssigner | createBlockIdAssigner

## /complete

- grep -rn 'BlockIdAssigner\|blockIdAssign' packages/ apps/ → 0 hits
- test:fast passes
- typecheck at baseline

