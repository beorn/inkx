---
id: "@km/storage/identity-schema"
aliases:
  - km-storage.identity-schema
  - km-storage-identity-schema
created_by: claude:8b5b9e1c
created_at: 2026-04-22T04:49:29Z
closed_at: 2026-04-22T06:36:34Z
close_reason: "Schema-additive pass done: branded NodeId/RepoId in @km/core,
  fs_dev/fs_size/fs_content_hash columns, SCHEMA_VERSION=5 migration with
  composite (fs_dev, fs_ino) index. Block_id→name fold deferred to
  km-storage.block-id-name-fold. Tests: identity-schema-v5.test.ts (7 passing).
  Committed in 98b74de9e & follow-up."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.identity-schema
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Identity schema migration (P0 prereq): fold block_id into .name + branded types + file basename/path split @km/storage #task #P0 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Lands ahead of @km/storage/lazy-hydration to avoid SQLite query churn. Scope: (1) fold KNode.block_id values into .name (anchor wins when both exist per doc §2.3); (2) introduce branded NodeId + RepoId types in @km/core; (3) split File .name (basename, Obsidian link form) from .path (repo-relative); (4) update resolver. One migration, one schema change pass. See hub/km/storage-architecture.md §8.P0.