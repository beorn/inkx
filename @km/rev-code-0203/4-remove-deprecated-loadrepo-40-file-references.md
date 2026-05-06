---
mentions:
  - km
  - claude
id: "@km/rev-code-0203/4-remove-deprecated-loadrepo-40-file-references"
aliases:
  - km-rev-code-0203.4
  - km-rev-code-0203-4
  - "@km/rev-code-0203/4"
created_at: 2026-02-03T13:48:00Z
closed_at: 2026-02-03T14:20:12Z
assignee: claude:b3478afd
---

# [x] Remove deprecated loadRepo() (40 file references) @km/rev-code-0203 #task #P4 @claude:b3478afd

## Status: Scope reduced

The deprecated `loadRepo()` from repo-loader.ts is only directly used in:

1. `repo.ts` line 738 - `createRepo` internally delegates to `loadRepo` (the core loading pipeline)
2. `tests/migration.test.ts` - tests migration behavior
3. `tests/discover-only.test.ts` - tests discoverOnly mode

The ~40 file references originally counted were actually to the **CLI wrapper** `apps/km-cli/src/load-repo.ts` which shares the name `loadRepo` but already uses `createRepo()` internally.

## Remaining work

The deprecated `loadRepo()` function in repo-loader.ts is the actual loading pipeline that `createRepo` wraps. Removing it means inlining its logic into `createRepo` or refactoring the loading pipeline — a significant internal refactor with no external API change.

**Priority reduced to P4** — no external consumers use the deprecated API.

