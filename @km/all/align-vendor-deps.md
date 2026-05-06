---
mentions:
  - types
  - km
id: "@km/all/align-vendor-deps"
aliases:
  - km-all.align-vendor-deps
  - km-all-align-vendor-deps
created_by: Bjørn Stabell
created_at: 2026-04-16T21:29:19Z
owner: bjorn@stabell.org
---

# [ ] Align vendor/* dep versions with km root (vitest, @types, playwright, yaml) @km/all #task #P3

SOP sherif scan reports 5 deps with version splits across the workspace
(km root vs vendor packages):

vitest          ^4.1.4   (root)  vs  ^3.0.0   (mdspec)
  @types/bun      ^1.3.12  (root)  vs  ^1.3.11  (bearly)
  @types/node     ^25.6.0  (root)  vs  ^22.0.0  (mdspec)
  playwright      ^1.59.1  (root)  vs  ^1.58.2  (bearly)
  yaml            ^2.8.3   (root)  vs  ^2.4.0   (@km/_orphan/agent), ^2.7.1 (@km/markdown), ^2.8.2 (@km/storage)
  @km/beads        ^4.3.6   (root)  vs  ^4.3.6   (bearly)  — labeled "highest"
  bearly          ^4.3.6   (root)  vs  ^3.0.0   (mdspec)

Vendor packages are part of this project — the workspace policy treats
them as first-class. They must remain standalone (no `workspace:*`)
but should pin compatible npm versions so consumers and developers see
one effective version per dep.

Proposed fix: bump or downgrade vendor package.json files to converge
on the root's pinned version where compatible. Where a vendor package
genuinely needs an older major (e.g., a peer dep constraint), document
the divergence in that vendor's CLAUDE.md and add a sherif rule
override targeting that specific dep.

After alignment, sherif goes back to passing in /sop scans.

Discovered during /sop all on 2026-04-16. Initially mis-filed as
"sherif-vendor-exclude" — corrected after user clarified vendor scope.

