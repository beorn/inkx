---
mentions:
  - silvery
  - km
  - claude
id: "@km/silvery/sterling-2b-ui-components"
aliases:
  - km-silvery.sterling-2b-ui-components
  - km-silvery-sterling-2b-ui-components
created_by: claude:4274df30
created_at: 2026-04-19T21:43:00Z
closed_at: 2026-04-19T22:48:37Z
close_reason: "Shipped at vendor/silvery aa42de19 + 9c401ca4 + 483c0e52 +
  63f69c97. 22 @silvery/ui components migrated to Sterling flat tokens, zero
  legacy tokens remaining. augmentWithSterlingFlat writes flat form onto legacy
  Theme so both coexist during 2a→2d. Badge+Toast tone surface expanded incl
  destructive (D1 alias). 30 new tests (226 Sterling total). FLAG FOR 2c: 26
  km-tui palette-color tests fail on HEAD — pre-existing, not caused by 2b;
  needs concurrent fix in 2c (ANSI16 slot quantization assumption). Unblocks
  sterling-2c-km-migration."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-2b-ui-components
    depends_on_id: km-silvery.sterling-2a-data-layer
    type: blocks
    created_at: 2026-04-19T14:43:00Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.sterling-2b-ui-components
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T14:43:00Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.sterling-2a-data-layer
      - type: link
        target: km-silvery.theme-v4
---

# [x] Sterling Phase 2b: @silvery/ui components consume new tokens @km/silvery #task #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-2a-data-layer]], [[@km/silvery/theme-v4]]

Update SelectList, TextInput, ModalDialog, Tabs, Alert, Toast, etc. in @silvery/ag-react/ui/ to read from new Theme shape.

## Acceptance

- @silvery/ui components reference $fg-accent / theme['fg-accent'] form, not theme.primaryfg
- Components handle 'info' tone (new role) and 'destructive' tone (new synonym for error)
- Component snapshot tests green
- @km/tui still works unchanged (legacy fields still exist from 2a)

DEPENDS: sterling-2a-data-layer
BLOCKS: sterling-2c-@km/_orphan/migration
Parent: @km/silvery/theme-v4

