---
id: "@km/silvery/design-package-rename"
aliases:
  - km-silvery.design-package-rename
  - km-silvery-design-package-rename
created_by: Bjørn Stabell
created_at: 2026-04-19T20:30:18Z
---

# [ ] Phase 3b: Rename @silvery/theme → @silvery/design + @silvery/schemes @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-2d-release]], [[@km/silvery/sterling-2e-interior-migration]]

Complete the package split started in Phase 3a.

Phase 3a (shipped 2026-04-19, bead @km/silvery/theme-v4-schemes-rescope) slimmed @silvery/theme in-place. Phase 3b does the package rename.

## Scope

- @silvery/theme renamed → @silvery/design (exports Sterling DesignSystem)
- 84-scheme catalog split out to @silvery/schemes
- Keep @silvery/theme as compat facade (re-exports from new homes) for ONE release
- Delete facade in next major bump

## Acceptance

- @silvery/design package exists, exports Sterling (deriveFromScheme, deriveFromColor, etc.)
- @silvery/schemes package exists with ≤10 source files (catalog + CLI)
- silvery barrel re-exports { design } from @silvery/design
- Web consumer: import { catppuccinMocha } from '@silvery/schemes' works (hex-only)
- @silvery/ui depends only on @silvery/design, not @silvery/schemes
- tsc + tests pass

## Approach

/refactor plan. Coordinated package move + import updates. Ship behind a deprecation release.

Parent: @km/silvery/theme-v4
Canonical doc: hub/silvery/design/v10-terminal/design-system.md