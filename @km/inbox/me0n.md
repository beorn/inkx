---
mentions:
  - km
id: "@km/inbox/me0n"
aliases:
  - km-me0n
  - "@km/_orphan/me0n"
created_at: 2026-01-22T15:51:22Z
closed_at: 2026-01-22T18:38:43Z
---

# [x] CRITICAL: km sync --to-fs corrupts source code files @km/_orphan #bug #P0

## Description

`km sync --to-fs` corrupted multiple source files by converting them to markdown stubs.

## Files Affected

- packages/@km/storage/src/db-rules.ts
- packages/@km/storage/tests/db-rules.test.ts
- packages/@km/storage/tests/watch/chaos/fuzzer.ts
- packages/@km/storage/tests/watch/chaos/invariants.ts
- packages/@km/storage/tests/watch/chaos/regression.ts
- Possibly others in untracked directories

## Root Cause

syncToFs() iterates over ALL nodes with type='file' and writes them back via nodesToMarkdown().
This includes nodes that were created for non-markdown files during parsing/scanning.

## Expected Behavior

sync --to-fs should ONLY write back .md files that are part of the vault content.
Should NEVER touch source code, test files, or config files.

## Reproduction

1. Have untracked .ts files in repo
2. Run `km sync --to-fs`
3. Files get overwritten with markdown stubs

## Fix Required

- Add file extension filter to syncToFs (only .md files)
- Or better: only sync files under specific vault directories
- Consider adding a safeguard that refuses to write non-.md files

## Lesson Learned

Test sync operations on throw-away test repos, not source code repos.

