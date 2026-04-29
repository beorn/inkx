---
id: "@km/storage/move-type-validation"
aliases:
  - km-storage.move-type-validation
  - km-storage-move-type-validation
created_by: Bjørn Stabell
created_at: 2026-04-15T06:55:02Z
closed_at: 2026-04-15T06:55:19Z
close_reason: Shipped in 6cda83b22. Write-time validator + Map-store mirror +
  doctor integrity + regression test. Vault repaired.
---

# [x] moveNode write-time type validation — fs-backed children can only be parented to folders @km/storage #task #P2

blocks:: [[@km/storage]]

Shipped in commit 6cda83b22: validateMove() in packages/@km/storage/src/db/ops.ts rejects moves where a file/mdfile/folder child is parented to a non-folder. Mirrored in Map store in data-store.ts. Throws InvalidMoveError. Regression test in data-store.test.ts. Also added km doctor integrity subcommand (apps/@km/_orphan/cli/src/commands/doctor.ts) to detect + repair existing corruption. Vault already repaired via direct SQL.