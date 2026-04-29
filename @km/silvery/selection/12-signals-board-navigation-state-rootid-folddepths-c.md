---
id: "@km/silvery/selection/12-signals-board-navigation-state-rootid-folddepths-c"
aliases:
  - km-silvery.selection.12
  - km-silvery-selection-12
  - "@km/silvery/selection/12"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:41:52Z
closed_at: 2026-04-05T07:52:27Z
owner: bjorn@stabell.org
---

# [x] Signals: board navigation state (rootId, foldDepths, collapsedNodes) @km/silvery #task #P2

Migrate board navigation state from Zustand store fields to alien-signals.

Currently: rootId, foldDepths, collapsedNodes live as fields on BoardPaneState, read via useAppStore selectors, written via dispatchBoard reducer.

Target: each is a signal on the pane. Views read via useSignal. Mutations write signals directly (no reducer dispatch for state changes).

Files: Board.tsx (rootId, foldDepths, collapsedNodes), board-app-store.ts (state shape), board-reducer-new.ts (TOGGLE_FOLD, TOGGLE_COLLAPSE, ZOOM_IN, SET_ROOT cases)

This subsumes the remaining board-reducer into signals — the reducer becomes thin (just curswant + moveState).