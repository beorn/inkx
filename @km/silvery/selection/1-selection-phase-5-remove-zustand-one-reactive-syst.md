---
mentions:
  - km
  - Bjørn
id: "@km/silvery/selection/1-selection-phase-5-remove-zustand-one-reactive-syst"
aliases:
  - km-silvery.selection.1
  - km-silvery-selection-1
  - "@km/silvery/selection/1"
created_by: Bjørn Stabell
created_at: 2026-04-04T00:01:12Z
closed_at: 2026-04-04T21:07:24Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Selection Phase 5: Remove Zustand — one reactive system @km/silvery #task #P2 @Bjørn Stabell

Drop Zustand entirely. Move all remaining app state to alien-signals.

## Context

- @km/storage already uses alien-signals via withReactive (per-node signals)
- SelectionStore (Phase 2) uses alien-signals
- CursorStore (legacy pub/sub) is replaced by SelectionStore signals
- The remaining Zustand state is the last holdout

## What changes

- Board nav state (rootId, foldDepths, collapsedNodes, navHistory) to signals
- UI state (overlays, dialogs, filters, search) to signals
- Per-pane state to signal-based store per pane
- Remove Zustand dependency entirely
- Remove board-app-store.ts Zustand store, replace with signal-based app store
- createApp() integration updated

## Why

Three reactive systems is two too many. Zustand + CursorStore pub/sub + alien-signals becomes just alien-signals. One mental model, one subscription system, granular by default.

