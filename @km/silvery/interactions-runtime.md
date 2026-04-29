---
id: "@km/silvery/interactions-runtime"
aliases:
  - km-silvery.interactions-runtime
  - km-silvery-interactions-runtime
created_by: Bjørn Stabell
created_at: 2026-04-06T06:53:02Z
closed_at: 2026-04-15T19:25:10Z
close_reason: "Grooming 2026-04-15: all 14 child phases (0-6) closed. Remaining
  work (selection quality, pointer model, hover, userSelect, copy-on-select) is
  tracked under km-silvery.selection-focus-plateau and standalone km-silvery.*
  feature beads."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Interactions as runtime: move machines to @silvery/headless, extend existing providers, document it all @km/silvery #epic #P1 @Bjørn Stabell

All silvery interaction systems: selection, mouse/pointer, hover, drag, focus, clipboard, copy-mode. Includes runtime architecture (headless machines, providers) and feature implementation.

## Completed (Phase 0-6)
Machines moved to @silvery/headless, InputRouter, CapabilityRegistry, SelectionFeature, withDomEvents (find, copy-mode, drag), observer hooks, purge old hooks, fix demo/km/docs.

## Remaining
Selection quality + consolidation, mouse dispatch on absolute elements, contain boundary, pointer interaction model, hover visuals, userSelect, word/line select, copy-on-select, clipboard architecture.