---
mentions:
  - km
id: "@km/tui/fold-border-blank"
aliases:
  - km-tui.fold-border-blank
  - km-tui-fold-border-blank
created_by: claude:586bad48
created_at: 2026-02-12T14:16:49Z
closed_at: 2026-02-19T16:56:19Z
owner: bjorn@stabell.org
---

# [x] Fold (<) sometimes leaves bottom borders of cards blank/overwritten @km/tui #bug #P2

When pressing '<' to fold nodes, the bottom borders of some cards are left blank or overwritten — visible as missing/broken box-drawing characters at the bottom edge of cards. Reproducible with /tmp/vt vault. Likely a rendering issue where the fold operation changes layout but the previous frame's bottom borders aren't fully repainted. Could be related to incremental rendering or stale pixel issues in inkx.

