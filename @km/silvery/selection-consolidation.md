---
mentions:
  - km
id: "@km/silvery/selection-consolidation"
aliases:
  - km-silvery.selection-consolidation
  - km-silvery-selection-consolidation
created_by: Bjørn Stabell
created_at: 2026-04-06T10:22:56Z
closed_at: 2026-04-09T06:20:56Z
close_reason: "Consolidated dual selection systems via bridge pattern.
  SelectionFeature in create-app.tsx bridges inline selection state to
  CapabilityRegistry so useSelection() works with real data. Removed
  SelectionFeature creation from withDomEvents, removed InputRouter mouse
  handler registration for selection. Kept: capabilityRegistry, inputRouter,
  copy-mode proxy, find feature. 114 tests pass. Commit 974a1e71 (silvery
  worktree), bc5dde34 (silvery main)."
owner: bjorn@stabell.org
---

# [x] Consolidate dual selection systems — create-app + SelectionFeature @km/silvery #task #P2

Two selection systems exist:

1. create-app.tsx lines 1942-1997: inline selection handling in the event loop. Works with real mouse events. ~55 lines.
2. SelectionFeature + InputRouter: parallel system built by agents. Has tests but InputRouter never receives real mouse events.

The create-app version IS the working system. The SelectionFeature should be demoted to a thin bridge that exposes create-app's selection state to the CapabilityRegistry (so useSelection hook works).

Delete: InputRouter mouse dispatch for selection (dead path)
Keep: headless machines, observer hooks, CapabilityRegistryContext, keyboard dispatch (find, copy-mode)
Bridge: SelectionFeature reads from create-app's selectionState, not its own

Must write termless integration tests FIRST (@km/silvery/demo-integration-tests).

