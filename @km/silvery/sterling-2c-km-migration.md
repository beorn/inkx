---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-2c-km-migration"
aliases:
  - km-silvery.sterling-2c-km-migration
  - km-silvery-sterling-2c-km-migration
created_by: claude:4274df30
created_at: 2026-04-19T21:43:01Z
closed_at: 2026-04-20T03:50:43Z
close_reason: >-
  Shipped 2026-04-19 across commits bb1798b59 (theme.ts bracket-access),
  92fed470c (main $-token migration), 8254145b6 + 755490544 (26 palette-color
  test fixes).


  ACCEPTANCE (pasted from agent):

  - rg legacy camelCase theme.X → 0 hits

  - rg legacy kebab-wrong-name $-tokens → 0 hits

  - tsc non-vendor clean (0)

  - km-tui tests: 2320 passed, 38 skipped, 0 failed (108 test files)


  Real blast radius was ~70 refs (not the 313 estimated — 313 counted all legacy
  token occurrences; acceptance targeted the 7 kebab $-tokens + 10 camelCase
  field accesses that the spec listed).


  26 palette-color tests fixed: 22 via central TC helper rewrite
  (tests/helpers/theme.ts now derives from augmentWithSterlingFlat), 3
  fixture-logic (windowing-wire), 1 slice-width (inline-rendering).


  CAVEATS for 2d:

  1. theme.ts still WRITES legacy kebab fields (inputborder, selectionbg,
  focusborder, disabledfg, inversebg, surfacebg) in output for legacy Theme
  shape. When 2d deletes those from the Theme type, deriveUnfocusedTheme needs
  ~20-line rewrite to emit Sterling flat shape.

  2. $selectionbg (unhyphenated) remains — Sterling doesn't ship
  bg-selected/fg-on-selected roles yet. Future bead when Sterling adds them.

  3. DerivationPanel.tsx in storybook has a Theme.bg reference that needs
  updating post-prune — storybook-full agent (in flight) will handle.


  Ready signal: sterling-2d-release unblocked.
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-2c-km-migration
    depends_on_id: km-silvery.sterling-2b-ui-components
    type: blocks
    created_at: 2026-04-19T14:43:01Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.sterling-2c-km-migration
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T14:43:01Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.sterling-2b-ui-components
      - type: link
        target: km-silvery.theme-v4
---

# [x] Sterling Phase 2c: Batch-refactor km-tui ~145 call sites @km/silvery #task #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-2b-ui-components]], [[@km/silvery/theme-v4]]

Mechanical migration of @km/tui from camelCase Theme fields to flat Sterling tokens.

## Approach

/refactor migrate (bun tools/refactor.ts). Regex replacements: theme.primaryfg → theme['fg-on-accent'], theme.mutedbg → theme['bg-surface-subtle'], etc. Full migration map lives in design-system.md Appendix C.

## Acceptance

- rg 'theme\.(primaryfg|mutedbg|selectionbg|inputborder|focusborder|cursorbg|popoverbg|surfacebg|inversebg|disabledfg)\b' apps/ → 0 hits
- @km/tui visual tests still pass (no behavioral change)
- tsc clean

DEPENDS: sterling-2b-ui-components
BLOCKS: sterling-2d-release
Parent: @km/silvery/theme-v4

