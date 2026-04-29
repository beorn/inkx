---
id: "@km/silvery/sterling-storybook-full"
aliases:
  - km-silvery.sterling-storybook-full
  - km-silvery-sterling-storybook-full
created_by: claude:4274df30
created_at: 2026-04-19T21:43:33Z
closed_at: 2026-04-20T03:57:05Z
close_reason: "Shipped 2026-04-19 across 5 commits (ecf9e576 → bafdbba8). All 5
  Full features green: OKLCH visualizer, WCAG contrast audit, intent-vs-role
  demo, urgency-is-not-a-token demo, scheme-author grid + help overlay. 1086 →
  2273 LOC. 219/219 Sterling tests pass."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-storybook-full
    depends_on_id: km-silvery.sterling-storybook
    type: parent-child
    created_at: 2026-04-19T14:43:33Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.sterling-storybook-full
    depends_on_id: km-silvery.sterling-storybook-mvp
    type: blocks
    created_at: 2026-04-19T14:43:33Z
    created_by: claude:4274df30
    metadata: "{}"
---

# [x] Sterling Storybook Full — derivation viz + contrast audit + demos @km/silvery #task #P3 @claude:4274df30

blocks:: [[@km/silvery/sterling-storybook]], [[@km/silvery/sterling-storybook-mvp]]

Extends the MVP with Sterling-native features: derivation visualizer, WCAG contrast audit, intent-vs-role demo, urgency-is-not-a-token demo, scheme authoring.

Full design: hub/silvery/design/v10-terminal/storybook-design.md

DEPENDS: sterling-storybook-mvp
Parent: @km/silvery/sterling-storybook