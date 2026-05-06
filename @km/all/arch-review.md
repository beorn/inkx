---
mentions:
  - km
  - Bjørn
id: "@km/all/arch-review"
aliases:
  - km-all.arch-review
  - km-all-arch-review
created_by: Bjørn Stabell
created_at: 2026-04-13T05:58:43Z
closed_at: 2026-04-13T06:11:28Z
close_reason: "All fixes shipped: SectionRules moved to @km/core (layer
  violation fixed), architecture docs unified (3→1 canonical),
  symlink_to→embed_of renamed (92 files + SQL migration), undeclared deps
  declared, globalThis globals replaced with module exports, stale Zustand refs
  cleaned. Remaining: @km/board→@silvery/ag-react GridNavigator coupling (deeper
  fix, separate bead)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Architecture review fixes — layer violations, stale docs, undeclared deps @km/all #epic #P0 @Bjørn Stabell

From full arch review: fix layer violations (@km/board→@km/markdown SectionRules, @km/board→@silvery/ag-react GridNavigator), declare missing deps in package.json, unify 3 inconsistent architecture docs into one canonical doc, fix stale Zustand refs, remove globalThis globals, rename symlink_to→embed_of.

