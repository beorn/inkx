---
mentions:
  - km
  - claude
id: "@km/silvery/app-search-selection"
aliases:
  - km-silvery.app-search-selection
  - km-silvery-app-search-selection
created_by: claude:def7f8a1
created_at: 2026-03-17T07:13:22Z
closed_at: 2026-03-17T07:56:26Z
close_reason: SurfaceRegistry + SearchProvider + SearchBar. 15 tests. Existing
  SelectionProvider unchanged (works as-is).
owner: bjorn@stabell.org
assignee: claude:def7f8a1
---

# [x] App-global search + selection providers @km/silvery #task #P1 @claude:def7f8a1

Phase 4: Move search/selection out of create-app.tsx into app-level providers. SearchProvider + SelectionProvider + SurfaceRegistry + SearchBar. Adapt selection.ts and search-overlay.ts to work on TextSurface. Delete ~300 lines from create-app.tsx.

