---
mentions:
  - km
id: "@km/silvery/theme-storybook"
aliases:
  - km-silvery.theme-storybook
  - km-silvery-theme-storybook
created_by: Bjørn Stabell
created_at: 2026-04-18T05:37:42Z
closed_at: 2026-04-18T18:27:50Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-storybook
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T22:37:43Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-system
---

# [x] Theme storybook — interactive showcase at all 4 capability tiers @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Interactive visual showcase of the design system. Browse schemes + components; toggle tiers live.

## Features

- **Scheme browser**: grid of bundled schemes, click to preview
- **Slot/token swatches**: 22 input slots + ~33 derived tokens, labeled
- **Component showcase**: every silvery component with real content + all states (focus/disabled/error/loading)
- **Tier toggle**: hotkey to switch truecolor/256/ANSI16/monochrome live
- **Side-by-side compare**: two schemes, same component

## Implementation

- Built as a silvery app (dogfooding)
- examples/storybook/ or packages/design/storybook/
- Runs: bun silvery-storybook
- Auto-generates docs screenshots

## Acceptance

- [ ] All schemes listed with preview
- [ ] All silvery components have showcase pages
- [ ] Tier toggle works live
- [ ] Side-by-side scheme compare
- [ ] Linked from silvery.dev

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system
Depends on: @km/silvery/theme-auto-detect (tier override)

