---
mentions:
  - silvery
  - km
id: "@km/silvery/sterling-design-material"
aliases:
  - km-silvery.sterling-design-material
  - km-silvery-sterling-design-material
created_by: claude:4274df30
created_at: 2026-04-19T21:43:31Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.sterling-design-material
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:13:00Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-design-material
    depends_on_id: km-silvery.design-package-rename
    type: blocks
    created_at: 2026-04-19T14:43:31Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all.sterling
      - type: link
        target: km-silvery.design-package-rename
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

