---
mentions:
  - km
id: "@km/disposable/1-migrate-watcher-tests-to-use-await-using-statement"
aliases:
  - km-disposable.1
  - km-disposable-1
  - "@km/disposable/1"
created_at: 2026-01-23T18:27:23Z
closed_at: 2026-01-23T20:07:14Z
---

# [x] Migrate Watcher tests to use 'await using' statement @km/disposable #task #P1

Convert watcher tests from manual stop() calls to 'await using watcher = ...' pattern. Watcher already has Symbol.asyncDispose implemented.

