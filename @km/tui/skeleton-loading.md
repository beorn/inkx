---
mentions:
  - km
  - claude
id: "@km/tui/skeleton-loading"
aliases:
  - km-tui.skeleton-loading
  - km-tui-skeleton-loading
created_by: claude:54aefa32
created_at: 2026-02-18T00:35:08Z
closed_at: 2026-02-19T18:50:42Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] Show skeleton columns/cards with loading animation while data loads @km/tui #feature #P2 @claude:5f0aee02

Current skeleton only shows during terminal init (!ui.isReady). Need loading indicators during DATA loading too:

1. When opening a vault (km view --repo path), files appear with '(empty)' while deferred parsing runs
2. No visual indication that content is still loading
3. Need generalized loading state: skeleton columns with skeleton cards, or skeleton subitems when loading a card's children

Implementation needed:

- Repo loading progress → board state (loading: true/false, progress: n/total)
- SkeletonBoard/SkeletonCard shown during deferred parsing, not just terminal init
- Animated shimmer or progress indicator
- Works for both initial load and lazy-loaded card content

