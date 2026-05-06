---
id: "@km/silvercode/popovers-avoid-transcript-occlusion"
aliases:
  - km-silvercode.popovers-avoid-transcript-occlusion
  - km-silvercode-popovers-avoid-transcript-occlusion
created_at: 2026-05-06T04:48:50.696Z
_stub: true
---

# Silvercode hover previews show too much and cover the wrong transcript context ^popovers-avoid-transcript-occlusion

Recent transcript screenshots show filename/link hover previews that are too large/eager and anchored in ways that cover unrelated command output or assistant text. This is not a blanket rule that overlays may never occlude transcript content; the issue is preview relevance, sizing, dwell/arming, and placement. Audit RawInspector, LinkifiedText, ToolCall image previews, AmbientEventRow, and SidePanel hover previews. Acceptance: hover previews expose concise relevant detail, avoid covering the row/body the user is likely reading when a smaller or differently anchored preview would work, and still allow full raw/detail inspection on explicit expansion/debug paths.
