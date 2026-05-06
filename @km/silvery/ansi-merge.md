---
mentions:
  - silvery
  - silvery
  - km
  - claude
id: "@km/silvery/ansi-merge"
aliases:
  - km-silvery.ansi-merge
  - km-silvery-ansi-merge
created_by: claude:55df8ef1
created_at: 2026-03-09T21:14:13Z
closed_at: 2026-03-09T22:40:07Z
close_reason: Merged @silvery/ansi into @silvery/term/ansi. Commit 81950f5e.
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Merge @silvery/ansi into @silvery/term @km/silvery #task #P2 @claude:474834b0

## What

Move @silvery/ansi source into @silvery/term (e.g., packages/term/src/ansi/) and update all 32 files that import @silvery/ansi.

## Why

ansi is a small package (11 files) used primarily by term. Reducing package count simplifies the ecosystem. Re-export from @silvery/term/ansi for backwards compat.

## Scope

- 11 source files in packages/ansi/src/
- 32 files reference @silvery/ansi
- Update package.json exports in @silvery/term
- Remove packages/ansi/ directory
- Update all imports

