---
aliases:
  - km-storage.sync-architecture.storage-test-harness-enforcement
  - km-storage-sync-architecture-storage-test-harness-enforcement
created_at: 2026-05-08T20:45:37.163Z
---

# Storage test harness enforcement for DI seams @km/storage #task @agent/3 #P2

Docs now say storage/sync/reconcile tests should use withTestEnv() and createTestSync() unless a low-level boundary requires hand-rolling. Plateau requires the rule to be auditable. Acceptance: audit packages/km-storage/tests for hand-rolled repoDir + Database + emitter patterns; migrate to canonical harnesses or add local comments for valid exceptions; add a lightweight grep/lint/check if practical; schema migration and malformed-state.db tests remain allowed exceptions.
