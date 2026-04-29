---
id: "@km/silvery/color-inherit"
aliases:
  - km-silvery.color-inherit
  - km-silvery-color-inherit
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:10Z
closed_at: 2026-04-18T18:27:10Z
close_reason: "Shipped in v0.18.0: color='inherit'/'currentColor' resolved via
  AgNode tree cascade (inheritedFg propagation in render-phase.ts). 13/13 new
  color-inherit.test.tsx pass at SILVERY_STRICT=2. km-tui partial migration:
  InlineComponents.tsx + link-interaction.ts use color='inherit' instead of
  colorOverride=null. Full colorOverride retirement in km-tui is follow-up
  (string-override semantic still in use by 4 callers)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.color-inherit
    depends_on_id: km-silvery.theme-system-v2
    type: parent-child
    created_at: 2026-04-18T10:45:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] color='inherit' / 'currentColor' primitive, retire colorOverride @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

Replace @km/tui's colorOverride context hack with a proper cascade. Text components accept color='inherit' meaning 'use nearest ancestor's computed color'. Resolved via AgNode tree walk at render time.\n\nAlso enables currentColor-style composition for borders, underlines, etc.\n\nMigration: @km/tui's 3 colorOverride usages drop the context param:\n- apps/@km/tui/src/text/InlineComponents.tsx\n- apps/@km/tui/src/text/link-interaction.ts\n- apps/@km/tui/src/views/shared-components.tsx (InlineText pass-through)\n\nDepends on: nothing (self-contained pipeline change)\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p6