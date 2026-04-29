---
id: "@km/storage/op-surface-rename-path"
aliases:
  - km-storage.op-surface-rename-path
  - km-storage-op-surface-rename-path
created_by: claude:8b5b9e1c
created_at: 2026-04-22T06:45:12Z
closed_at: 2026-04-22T14:56:20Z
close_reason: "Shipped: all 6 rename sites in change-handlers.ts now use
  emitter.commit via commitRename/commitRenameCascade helpers. Pure helper
  computeRenameCascade in rename-cascade.ts (unit-tested with prefix-sibling
  edge cases). N per-row cascade (not outer-txn — appendFileSync is outside
  SQLite, can't be rolled back). journalRename deleted. rename-atomicity.test.ts
  5/5 including mid-cascade crash pairing invariant. Discovered + fixed:
  handleNodeMoved cascade was previously NEVER journaled (silent drift)."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.op-surface-rename-path
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T23:45:12Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Replace hand-rolled journalRename with emitter.apply (crash-safety P0) @km/storage #bug #P0 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Audit finding G3 (hub/km/research/op-vocabulary-audit-2026-04-22.md): folder/file/directory rename in watch/change-handlers.ts:616,622,635,697,403,408 does db.run(UPDATE...) directly then hand-rolls journalRename(). A crash between writes leaves DB ahead of journal — silent corruption risk today. Fix: replace with emitter.apply({type: 'node_updated', actor: 'user', target: nodeId, data: {fs_path, name, title, old_fs_path}}). Careful: echo-loop prevention via commit vs apply, and the cascade SUBSTR UPDATE at line 622 is a bulk op that needs to become N per-node ops OR a single node_updated with a cascade-spec payload. Effort ~2 days.