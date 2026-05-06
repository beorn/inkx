---
mentions:
  - km
id: "@km/storage/chaos-tests"
aliases:
  - km-storage.chaos-tests
  - km-storage-chaos-tests
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:31Z
closed_at: 2026-04-02T22:21:07Z
close_reason: "Shipped: 15 chaos tests covering error classes (EBUSY, EACCES,
  ENOENT, ENOSPC), retry logic, conflict detection (mtime mismatch), concurrent
  flush, rapid edit coalescing, atomic write cleanup. 69 total writequeue tests.
  Commit a9a13006."
owner: bjorn@stabell.org
---

# [x] Comprehensive WriteQueue + chaos test suite @km/storage #task #P3

WriteQueue has no unit tests for error handling, conflict detection, or retry logic. ChaosWatcher exists but is underutilized. Need: (1) WriteQueue unit tests for all error classes, retry strategies, conflict scenarios. (2) Chaos monkey tests using ChaosWatcher for transient failures, clock skew, partial failures. (3) Property-based tests for node-differ.

