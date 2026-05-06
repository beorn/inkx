---
mentions:
  - km
id: "@km/silvery/sticky-docs-stale"
aliases:
  - km-silvery.sticky-docs-stale
  - km-silvery-sticky-docs-stale
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:11Z
closed_at: 2026-03-13T05:26:38Z
close_reason: "Fixed: Updated CLAUDE.md to use inheritedBg terminology,
  corrected sticky tier docs, updated getCellBg references"
owner: bjorn@stabell.org
---

# [x] Docs: Sticky Tier 2 behavior and getCellBg comments out of date @km/silvery #task #P2

Tier 2 docs say null bg clear but code uses findInheritedBg. Sticky comments in content-phase.ts still explain stickyForceRefresh in terms of getCellBg but renderGraphemes now prefers explicit inheritedBg.

