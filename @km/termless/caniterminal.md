---
mentions:
  - km
  - claude
id: "@km/termless/caniterminal"
aliases:
  - km-termless.caniterminal
  - km-termless-caniterminal
created_by: claude:8fc35754
created_at: 2026-03-03T10:39:22Z
closed_at: 2026-03-23T14:44:36Z
close_reason: Added census.md + census.data.ts to termless docs. VitePress page
  renders colored matrix from per-backend JSON at build time. 5 backends, 66
  features, 8 categories.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] caniterminal: the caniuse.com for terminal emulators @km/termless #feature #P2 @claude:4929065a

Add a census/compatibility page to the termless docs site (VitePress). Renders census result JSON as an HTML table: rows = features (grouped by category), columns = backends, cells = ✓/✗ with colors. Reads from packages/census/results/*.json at build time. Just one page added to vendor/termless/docs/ — NOT a separate site.

