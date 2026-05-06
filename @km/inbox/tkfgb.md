---
mentions:
  - km
id: "@km/inbox/tkfgb"
aliases:
  - km-tkfgb
  - "@km/_orphan/tkfgb"
created_by: claude:fcaad2fa
created_at: 2026-02-18T10:47:13Z
closed_at: 2026-02-18T21:10:11Z
owner: bjorn@stabell.org
---

# [x] Import: within-file duplicate cross-references for multi-section tasks @km/_orphan #bug #P3

Tasks appearing in multiple sections of the same project get both a primary entry AND a cross-reference within the same file. The rendered set should prevent this but doesn't for within-project multi-section membership. Affected: pers-wellness.md (79 dupes), product-mip-board.md (39), fam-apt-pa670-house.md (30), etc. Fix: check rendered set per-file, not just cross-project.

