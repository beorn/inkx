---
mentions:
  - km
  - Bjørn
id: "@km/silvery/scheme-rename"
aliases:
  - km-silvery.scheme-rename
  - km-silvery-scheme-rename
created_by: Bjørn Stabell
created_at: 2026-04-18T05:18:41Z
closed_at: 2026-04-18T07:53:09Z
close_reason: "Rename complete, 0 ColorPalette hits, 2149 tests pass, typecheck
  clean. Commits: silvery 4e0338c8, km 4597c228e."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.scheme-rename
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T22:18:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-system
---

# [x] Scheme rename refactor — ColorPalette → ColorScheme across silvery @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/design-system]]

Rename ColorPalette → ColorScheme across silvery. 207 hits, silvery-internal (zero in @km/_orphan/side code).

## Scope

- Type: ColorPalette → ColorScheme
- Constant: COLOR_PALETTE_FIELDS → COLOR_SCHEME_FIELDS
- Dir: packages/theme/src/palettes/ → schemes/
- Files: default-palettes.ts → default-schemes.ts
- Functions: getPaletteByName → getSchemeByName, detectTerminalPalette → detectTerminalScheme
- Vars: defaultDarkPalette → defaultDarkScheme (+ Light)
- Mode name: deriveTheme(_, 'ansi16') → 'scheme' (with 'ansi16' alias)

## Backward compat

Export deprecated aliases for ColorPalette + getPaletteByName for one release cycle.

## Execution

Batch-refactor (bun vendor/bearly/tools/refactor.ts). Verify: bun typecheck + vitest + build.

## Acceptance

- [ ] 0 ColorPalette hits (except deprecated alias export)
- [ ] schemes/ dir exists, palettes/ gone
- [ ] bun typecheck + vitest green
- [ ] Silvery styling.md updated

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system

