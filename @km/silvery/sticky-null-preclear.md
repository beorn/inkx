---
id: "@km/silvery/sticky-null-preclear"
aliases:
  - km-silvery.sticky-null-preclear
  - km-silvery-sticky-null-preclear
created_by: claude:c9beade3
created_at: 2026-03-13T04:28:50Z
closed_at: 2026-03-13T05:18:37Z
close_reason: "By design: Non-scroll sticky pre-clear uses bg:null to match
  fresh render semantics. Fresh renders start with null bg, so pre-clearing to
  inherited bg would diverge from STRICT checks."
owner: bjorn@stabell.org
---

# [x] Non-scroll sticky pre-clear uses bg:null instead of effective background @km/silvery #bug #P3

Normal-container sticky force-refresh in renderNormalChildren() clears content area to bg:null, but fresh render would have ancestor bg in gaps between children. Can leave holes with wrong bg in sparse layouts with inherited backgrounds. Should clear to effective bg or be more targeted. Found by GPT pipeline review (3/3 flagged).