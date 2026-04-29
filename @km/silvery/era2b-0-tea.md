---
id: "@km/silvery/era2b-0-tea"
aliases:
  - km-silvery.era2b-0-tea
  - km-silvery-era2b-0-tea
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:34Z
closed_at: 2026-03-25T07:15:20Z
close_reason: "Package rename complete: @silvery/tea → @silvery/create. 93 files
  changed, 70+ import paths updated. All content moved to packages/create/. Old
  packages/tea/ deleted. 179 fast + 234 vendor test files pass. /complete
  criteria: grep for @silvery/tea → 0 hits in source (only bearlymade lock file,
  which is auto-generated)."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2b Phase 0: tea() utility in @silvery/create @km/silvery #task #P1 @claude:fed8de9e

Move tea() reducer utility (~30 lines) from @silvery/tea into @silvery/create.

- create/src/tea.ts — move tea() from packages/tea/
- packages/tea/ — DELETE package entirely (no deprecated re-exports, no compat shims). All consumers migrate to @silvery/create.

Note: Command and Binding types belong in @km/silvery/tea-2-commands, not here.

**Delete**: DELETE @silvery/tea package. Remove from package.json, tsconfig references, barrel exports. Fix all imports.
**/complete**: grep for @silvery/tea → 0 hits (except CHANGELOG/git history). packages/tea/ directory deleted. No re-exports or deprecation markers anywhere.