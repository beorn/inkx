---
mentions:
  - km
id: "@km/silvery/conditional-unmount-stale-pixels"
aliases:
  - km-silvery.conditional-unmount-stale-pixels
  - km-silvery-conditional-unmount-stale-pixels
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:54:04Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.conditional-unmount-stale-pixels
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-20T23:54:04Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Conditional sibling unmount leaves stale cells on screen @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Discovered by the 2026-04-21 TEA lifecycle spike 2. When a sibling Box is conditionally rendered (mounted then unmounted via React state change — e.g. dialog open=false causes the dialog Box to unmount), the terminal cells it painted remain on the screen. React state is correct (open=false, dialog component gone from tree), but screen.getText() still shows the old content.\n\nRepro: hub/silvery/experiments/tea-lifecycle-spike/phase-a.test.tsx test A2 initially failed with 'Dialog (focused)' text persisting after Escape closed the dialog. Trace log shows dispose scope='dialog', React state open=false, board re-renders cleanly — but the painted cells from the unmounted subtree aren't cleared.\n\nThis is a silvery output-phase / incremental rendering concern. NOT a TEA or lifecycle bug. The conditional mount/unmount fingerprint is common in every real app — modals, tooltips, collapsible sections.\n\nLikely root-cause area: vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts or render-phase.ts — when a node disappears from the layout, its previous cell region should be cleared to the parent background, not left as-is.\n\nAcceptance:\n1. Conditionally unmounted Box leaves NO stale cells; region is cleared to the natural parent background.\n2. Repro test in vendor/silvery/tests/features that mounts then unmounts a child and asserts screen.getText() at the unmount region is empty/clean.\n3. 3-layer verification (screen + terminal state + app state).\n4. Tab-switch / focus-regain don't cause re-appearance of stale cells.

