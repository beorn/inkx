---
mentions:
  - km
id: "@km/storage/crdt-trigger"
aliases:
  - km-storage.crdt-trigger
  - km-storage-crdt-trigger
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:04:54Z
closed_at: 2026-04-22T05:10:16Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.crdt-trigger
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T15:29:49Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.crdt-trigger
    depends_on_id: km-storage.pathway-db-crdt
    type: supersedes
    created_at: 2026-04-21T22:10:15Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-storage
      - type: link
        target: km-storage.pathway-db-crdt
---

# [x] CRDT reopen trigger — when to revisit CRDT vs event-sourcing-lite @km/storage #feature #P3

blocks:: [[@km/storage]], [[@km/storage/pathway-db-crdt]]

