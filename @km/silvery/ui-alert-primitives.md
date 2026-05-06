---
mentions:
  - silvery
  - km
  - claude
id: "@km/silvery/ui-alert-primitives"
aliases:
  - km-silvery.ui-alert-primitives
  - km-silvery-ui-alert-primitives
created_by: claude:4274df30
created_at: 2026-04-20T03:58:03Z
closed_at: 2026-04-20T18:31:43Z
close_reason: Shipped at vendor/silvery 5c895d0a + 7d1a8cf8.
  InlineAlert/Banner/Alert primitives with shared tone surface. Compound
  Alert.Title/Body/Actions. 13 new tests. Storybook UrgencyDemo refactored to
  use real components. _tone.ts shared helper dries up Button + Alert + Badge +
  Toast.
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.ui-alert-primitives
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-19T20:58:02Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.ui-alert-primitives
    depends_on_id: km-silvery.ui-button-tone
    type: blocks
    created_at: 2026-04-19T20:58:03Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.ui-button-tone
---

# [x] @silvery/ui: Alert / Banner / InlineAlert primitives with tone + urgency semantics @km/silvery #feature #P3 @claude:4274df30

blocks:: [[@km/silvery]], [[@km/silvery/ui-button-tone]]

Surfaced by Sterling Storybook Full (bead @km/silvery/sterling-storybook-full, shipped 2026-04-19).

## Gap

Silvery ships ModalDialog but no Alert / Banner / InlineAlert layer. These are the canonical components that carry Sterling's 'urgency is component choice, not token' story.

## Proposed

Three primitives, each accepting Sterling tone:

1. **<InlineAlert tone=...>** — inline text component, low urgency, no bg fill, uses $fg-<role>
2. **<Banner tone=...>** — dismissible header, medium urgency, full-width, tinted bg via $bg-<role>-subtle + $fg-<role>
3. **<Alert tone=...>** — blocking modal-style, high urgency (for 'system-critical, user must acknowledge'), built on ModalDialog

Same tone surface as Button tone (error/warning/success/info/accent/destructive).

## Why

Storybook UrgencyDemo currently draws all three locally to demonstrate the pattern. The demo's whole point is 'same color, three components, three urgency levels' — but it's fake because real silvery doesn't ship these. Landing them makes the demo use real components; makes Sterling's philosophy shippable as components, not just tokens.

## Acceptance

- 3 new components under @silvery/ag-react/src/ui/components/
- Each accepts tone + optional icon + optional dismiss handler (Banner + Alert)
- Visual tests across tone × state matrix
- Storybook UrgencyDemo refactored to use real components
- Docs: one page per component in vendor/silvery/docs/components/

## Depends on

- @km/silvery/ui-button-tone (shared tone prop contract)

Parent: @km/silvery

