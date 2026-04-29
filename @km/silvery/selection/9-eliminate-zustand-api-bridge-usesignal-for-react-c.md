---
id: "@km/silvery/selection/9-eliminate-zustand-api-bridge-usesignal-for-react-c"
aliases:
  - km-silvery.selection.9
  - km-silvery-selection-9
  - "@km/silvery/selection/9"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:40:39Z
closed_at: 2026-04-05T07:52:24Z
owner: bjorn@stabell.org
---

# [x] Eliminate Zustand API bridge — useSignal for React components @km/silvery #task #P2

Replace useAppStore(selector) pattern with useSignal(computed) for selection-related React reads. Eliminates the _selVersion bridge.

## Current bridge (Pattern 3)
effect(() => { sel.node.cursor(); _selVersion++ }) → set({ _selVersion }) → useAppStore re-renders

## Target (Pattern 2)  
useSignal(sel.node.cursor) → React subscribes directly to the computed signal

## Scope
- Board.tsx cursor reads
- TreeNode.tsx cursor/selected reads  
- DetailView.tsx cursor reads
- CheckboxIcon.tsx cursor reads
- WorkspaceChrome.tsx cursor reads

## Requires
- useSignal() hook that subscribes React to alien-signals computed
- Or: useSyncExternalStore adapter for alien-signals