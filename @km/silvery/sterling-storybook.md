---
id: "@km/silvery/sterling-storybook"
aliases:
  - km-silvery.sterling-storybook
  - km-silvery-sterling-storybook
created_by: claude:4274df30
created_at: 2026-04-19T21:40:38Z
closed_at: 2026-04-25T17:13:37Z
close_reason: "All 4 children shipped: MVP (3-pane layout), Full
  (DerivationPanel + ContrastAudit + IntentDemo + UrgencyDemo + SchemeAuthor),
  consolidate-design-demos (deleted predecessor apps), storybook-polish
  (PaletteGallery + tier ladder)."
---

# [x] Sterling Storybook — interactive system explorer @km/silvery #epic #P2

blocks:: [[@km/all/sterling]]

Build the Sterling-native storybook at vendor/silvery/examples/apps/storybook.tsx. Not a component gallery — an interactive exploration of the Sterling design system that demonstrates four things no other design-system storybook can: 84 schemes with auto-detection, runtime swap, preservative+generative derivation modes, and tier quantization.

Full design: hub/silvery/design/v10-terminal/storybook-design.md

## Scope (epic — split into MVP + Full children)

Three-pane layout: SchemeList (left) + ComponentPreview (middle) + TokenTree (right). Bottom bar for tier + derivation mode.

Sterling-native features (full): derivation visualizer, WCAG contrast audit, scheme authoring, intent-vs-role demo, urgency-is-not-a-token demo, cross-target preview.

Replaces existing 567-line storybook at vendor/silvery/examples/apps/storybook.tsx.

## Children to be created

- @km/silvery/sterling-storybook-mvp (3-pane layout, scheme cycle, token click → derivation, tier toggle)
- @km/silvery/sterling-storybook-full (derivation visualizer + contrast audit + intent/urgency demos + scheme authoring)

## Sequencing

MVP depends on Sterling Phase 2a (data layer with derivationTrace hooks). Build the storybook using Sterling itself — it eats its own dog food.

## Parent

@km/silvery/theme-v4