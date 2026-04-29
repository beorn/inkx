---
id: "@km/inkx/decrqm"
aliases:
  - km-inkx.decrqm
  - km-inkx-decrqm
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:27:28Z
closed_at: 2026-02-25T23:37:05Z
---

# [x] DECRQM — query terminal mode states @km/inkx #feature #P3

Implement DEC Request Mode (DECRQM, CSI ? n $ p) to query current state of terminal modes: alt screen, cursor visibility, mouse tracking, sync output, bracketed paste, etc. Response: CSI ? n ; Ps $ y where Ps=1 (set), 2 (reset), 0 (unknown).