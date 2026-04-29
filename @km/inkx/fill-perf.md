---
id: "@km/inkx/fill-perf"
aliases:
  - km-inkx.fill-perf
  - km-inkx-fill-perf
created_by: claude:28b14b32
created_at: 2026-02-23T13:13:19Z
closed_at: 2026-02-23T13:42:06Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Fill component causes layout cascade delay (useContentRect re-renders) @km/inkx #bug #P3 @claude:28b14b32

Fill uses useContentRect() which returns width=0 on first render, then re-renders after layout completes. With many Fill instances (e.g., 30+ in HelpOverlay), the cascading re-renders accumulate to ~3s delay before dots appear. Root cause: Fill needs a layout pass to know its width, but each re-render can trigger another frame-rate-limited layout pass (16ms per frame in scheduler). Workaround applied in HelpOverlay (46c7a3fa): pre-compute fill strings from known widths. Proper fix: Fill should avoid the two-pass render cycle, e.g., by using a CSS-like mechanism where the parent provides width synchronously.