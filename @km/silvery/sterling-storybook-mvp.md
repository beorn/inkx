---
id: "@km/silvery/sterling-storybook-mvp"
aliases:
  - km-silvery.sterling-storybook-mvp
  - km-silvery-sterling-storybook-mvp
created_by: claude:4274df30
created_at: 2026-04-19T21:43:32Z
closed_at: 2026-04-19T22:48:39Z
close_reason: "Shipped at vendor/silvery ee61e167. 1086 LOC, 8 files. 3-pane
  layout, scheme cycle, live re-theming, token click → derivation panel, tier
  toggle 1-4. Reads derivationTrace from 2a. Launch: bun run example:storybook.
  Deferrals to sterling-storybook-full: OKLCH viz, contrast audit, scheme
  authoring, intent/urgency demos, cross-target preview."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-storybook-mvp
    depends_on_id: km-silvery.sterling-2a-data-layer
    type: blocks
    created_at: 2026-04-19T14:43:32Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.sterling-storybook-mvp
    depends_on_id: km-silvery.sterling-storybook
    type: parent-child
    created_at: 2026-04-19T14:43:32Z
    created_by: claude:4274df30
    metadata: "{}"
---

# [x] Sterling Storybook MVP — 3-pane layout @km/silvery #task #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-2a-data-layer]], [[@km/silvery/sterling-storybook]]

First landing of the Sterling storybook at vendor/silvery/examples/apps/storybook.tsx (replaces existing 567-line storybook).

## MVP scope (~600 LOC)
- Three-pane layout: SchemeList + ComponentPreview + TokenTree
- Scheme swap cycles 84-scheme catalog, all re-themes live
- Token click → shows derivation rule + highlights components using it
- Tier toggle (truecolor/256/ansi16/mono) affects rendering

Full design: hub/silvery/design/v10-terminal/storybook-design.md

DEPENDS: sterling-2a-data-layer
BLOCKS: sterling-storybook-full
Parent: @km/silvery/sterling-storybook