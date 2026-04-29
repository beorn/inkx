---
id: "@km/silvery/ui-button-tone"
aliases:
  - km-silvery.ui-button-tone
  - km-silvery-ui-button-tone
created_by: claude:4274df30
created_at: 2026-04-20T03:58:02Z
closed_at: 2026-04-20T18:31:41Z
close_reason: Shipped at vendor/silvery 917e7e9a. Button accepts tone prop
  mapping to Sterling flat tokens. destructive alias of error at component layer
  (D1). 10 new tests. Storybook IntentDemo refactored to use real Button.
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.ui-button-tone
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-19T20:58:02Z
    created_by: claude:4274df30
    metadata: "{}"
---

# [x] @silvery/ui: Button — add tone prop (error/warning/success/info/accent/destructive) @km/silvery #feature #P3 @claude:4274df30

blocks:: [[@km/silvery]]

Surfaced by Sterling Storybook Full (bead @km/silvery/sterling-storybook-full, shipped 2026-04-19).

## Gap

Canonical Button component in vendor/silvery/packages/ag-react/src/ui/components/Button.tsx only accepts `color: string`. No `tone` prop matching Badge/Toast/Alert's Sterling tone surface.

## Scope

Add `tone?: 'accent' | 'error' | 'warning' | 'success' | 'info' | 'destructive'` to Button.
- `destructive` is a synonym for `error` (per D1 — component-layer intent, not a Theme field)
- Default tone: `accent` (standard primary button)
- Component maps tone to bg/fg-on/hover/active via Sterling flat tokens (`$bg-accent`, `$fg-on-accent`, `$bg-accent-hover`, etc.)

## Why

Storybook IntentDemo currently draws buttons locally (Box + Text + tokens) because silvery's Button doesn't support tone. Once this lands, IntentDemo's 3 `ToneButton` usages swap to real `<Button tone=...>`.

## Acceptance

- Button accepts tone prop with full Sterling tone surface
- destructive → error alias works (component-layer, zero Theme changes)
- Visual tests: 6 tones × default + hover + active states pass snapshots
- Storybook IntentDemo refactored to use the real Button (−~20 LOC)

Parent: @km/silvery