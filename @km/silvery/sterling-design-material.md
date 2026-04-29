---
id: "@km/silvery/sterling-design-material"
aliases:
  - km-silvery.sterling-design-material
  - km-silvery-sterling-design-material
created_by: claude:4274df30
created_at: 2026-04-19T21:43:31Z
---

# [ ] Sterling Phase 5: @silvery/design-material reference impl @km/silvery #task #P4

blocks:: [[@km/all/sterling]], [[@km/silvery/design-package-rename]]

Publish @silvery/design-material as a reference implementation of the DesignSystem contract. Material-3 tokens + generative HCT-style derivation from a seed color.

Validates the 'swap the import' claim with a second real consumer.

Post-plateau — not required for Sterling ship.

## Acceptance
- @silvery/design-material package published to npm
- Exports material: DesignSystem with deriveFromColor + deriveFromScheme
- silvery.dev storybook can load material and switch modes live

DEPENDS: design-package-rename
Parent: @km/silvery/theme-v4