---
mentions:
  - silvery
  - silvery
  - silvery
  - km
  - claude
id: "@km/silvery/design-package-rename"
aliases:
  - km-silvery.design-package-rename
  - km-silvery-design-package-rename
created_by: Bjørn Stabell
created_at: 2026-04-19T20:30:18Z
started_at: 2026-04-25T07:15:28Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.design-package-rename
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:13:01Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.design-package-rename
    depends_on_id: km-silvery.sterling-2d-release
    type: blocks
    created_at: 2026-04-19T14:43:58Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.design-package-rename
    depends_on_id: km-silvery.sterling-2e-interior-migration
    type: blocks
    created_at: 2026-04-19T21:08:12Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all.sterling
      - type: link
        target: km-silvery.sterling-2d-release
      - type: link
        target: km-silvery.sterling-2e-interior-migration
      - type: link
        target: "@km/silvery/sterling"
---

# [ ] Phase 3b: Rename @silvery/theme → @silvery/design + @silvery/schemes @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/silvery/sterling]], [[@km/silvery/sterling-2d-release]], [[@km/silvery/sterling-2e-interior-migration]]

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

