---
id: "@km/inbox/remove-singleton-wrappers"
aliases:
  - km-remove-singleton-wrappers
  - "@km/_orphan/remove-singleton-wrappers"
created_at: 2026-01-25T08:25:11Z
closed_at: 2026-01-26T00:10:09Z
assignee: km
---

# [x] Remove singleton wrapper functions from db.ts @km/_orphan #chore #P2 @km

## Goal
Remove all @deprecated singleton wrapper functions from db.ts and force all callers to use:
- Vault domain object API (preferred)
- Explicit db parameter passing (for internal code)

## Current State
db.ts contains ~40 singleton wrapper functions marked @deprecated that call getDb() internally.
These are exported from index.ts and still available to all callers.

## Tasks
1. Find all callers of singleton wrappers (grep for imports from @km/storage)
2. Convert CLI commands to use Vault API
3. Convert internal storage code to pass db explicitly
4. Remove singleton wrapper functions from db.ts
5. Remove singleton wrappers from index.ts exports
6. Remove global db fallback in emit()
7. Update tests to verify no singleton usage remains

## Success Criteria
- Zero imports of deprecated functions
- All code uses either Vault API or explicit db parameter
- test:all passes
- No fallback to global singleton state