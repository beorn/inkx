---
id: "@km/inkx/inline-incremental"
aliases:
  - km-inkx.inline-incremental
  - km-inkx-inline-incremental
created_by: claude:891e3ce1
created_at: 2026-03-01T08:32:24Z
closed_at: 2026-03-01T09:04:16Z
owner: bjorn@stabell.org
---

# [x] Incremental rendering for inline mode @km/inkx #feature #P2

Inline mode currently re-renders entire buffer every frame (~5848 bytes at 50 items). Add incremental path using diffBuffers() + relative cursor positioning when safe (scrollbackOffset=0, dimensions unchanged). Falls back to full render for complex cases.