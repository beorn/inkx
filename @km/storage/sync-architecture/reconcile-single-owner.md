---
aliases:
  - km-storage.sync-architecture.reconcile-single-owner
  - km-storage-sync-architecture-reconcile-single-owner
created_at: 2026-05-08T20:45:33.284Z
---

# Storage sync architecture plateau: one file-change reconcile owner @km/storage #task @agent/3 #P0

Plateau gap from the 2026-05-08 storage/materialization pass: loader reconciliation and fs-mount update handling both parse and apply same-path file updates. Collapse this to one canonical file-update reconciliation flow shared by eager load, post-frame reconcile, watcher, and sync. Acceptance: loader no longer hand-parses markdown/txt through duplicate logic; loader and update-handler call the same domain operation or clearly named shared primitive; external .md/.txt edit tests cover links and collapsed files; grep proves there is one owner for same-path file update classification.
