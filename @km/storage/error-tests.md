---
id: "@km/storage/error-tests"
aliases:
  - km-storage.error-tests
  - km-storage-error-tests
created_at: 2026-02-04T13:20:49Z
closed_at: 2026-02-04T13:22:48Z
assignee: claude:9e69175d
---

# [x] Add tests for error classification and retry logic @km/storage #task #P3 @claude:9e69175d

Error handling functions are untested:

- classifyError() - classifies filesystem errors
- calculateBackoffDelay() - retry backoff logic

Affects retry behavior on transient filesystem errors (EACCES, ENOENT, etc).

See docs/archive/sync-test-coverage.md for full analysis.