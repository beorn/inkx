---
id: "@km/inkx/skeleton-gap"
aliases:
  - km-inkx.skeleton-gap
  - km-inkx-skeleton-gap
created_by: claude:97b8de73
created_at: 2026-02-23T10:56:58Z
closed_at: 2026-02-23T11:50:02Z
---

# [x] Gap analysis: skeleton/loading patterns vs shadcn, bubbletea, textual, blessed @km/inkx #task #P2

Deep research gap analysis on how much of the skeleton/loading pattern should be part of inkx vs app-level. Compare with:
- shadcn/ui (React web): Skeleton component, loading states, Suspense patterns
- Bubble Tea (Go TUI): loading spinners, progress, async commands
- Textual (Python TUI): loading indicators, workers, screens
- blessed/blessed-contrib (Node TUI): loading, progress
- Charm/lipgloss ecosystem

Questions:
1. What loading/skeleton primitives do other frameworks provide?
2. What patterns are left to the app layer?
3. Should inkx have a built-in Skeleton component?
4. Should inkx have a progressive reveal utility (staggered Suspense)?
5. Should inkx have a SuspenseList-like component for ordered reveals?
6. What animation patterns do these frameworks use for loading states?

Goal: Make km a great showcase of inkx's capabilities.