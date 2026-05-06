---
mentions:
  - km
id: "@km/disposable/0-migrate-vault-tests-to-use-using-statement"
aliases:
  - km-disposable.0
  - km-disposable-0
  - "@km/disposable/0"
created_at: 2026-01-23T18:27:22Z
closed_at: 2026-01-23T20:07:13Z
---

# [x] Migrate Vault tests to use 'using' statement @km/disposable #task #P1

Convert 40+ test occurrences from try/finally to 'using vault = ...' pattern. Vault already has Symbol.dispose implemented.

