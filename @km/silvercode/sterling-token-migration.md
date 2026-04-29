---
id: "@km/silvercode/sterling-token-migration"
aliases:
  - km-silvercode.sterling-token-migration
  - km-silvercode-sterling-token-migration
created_by: claude:2405c72e
created_at: 2026-04-28T22:15:59Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.sterling-token-migration
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T15:15:58Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [ ] Migrate silvercode legacy tokens to Sterling flat tokens @km/silvercode #task #P2 #design #sterling

blocks:: [[@km/silvercode]]

Migrate silvercode components from legacy short-form tokens to Sterling flat tokens. Mirrors @km/silvery/sterling-consumer-migration (which covered @km/tui + ag-react but not silvercode). Legacy tokens currently resolve via kebab-fallback through silvery 0.20.x but are removed in 0.21.0. Scope from grep apps/silvercode/src/components/: 45x $muted, 22x $accent, 19x $primary, 19x $error, 17x $warning, 11x $border, 10x $info, 7x $success, 3x $surfacebg, 1x $mutedbg, 1x $secondary, 1x $purple, 1x $accent-fg. Already partially migrated: 7x $bg-surface-subtle, 5x $fg-muted, 5x $bg-surface-hover, 2x $border-default. Approach: bun vendor/bearly/tools/refactor.ts batch-renames per Sterling consumer migration pattern. Acceptance: rg legacy tokens returns 0 hits in apps/silvercode/src/components; storybook tests pass; visual check via All/together. Discovered during @km/silvercode/design-review walkthrough.