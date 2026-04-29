---
id: "@km/silvery/listview-scroll-cap-too-low"
aliases:
  - km-silvery.listview-scroll-cap-too-low
  - km-silvery-listview-scroll-cap-too-low
created_by: claude:2405c72e
created_at: 2026-04-26T06:49:59Z
closed_at: 2026-04-26T07:51:15Z
close_reason: "Superseded by km-silvery.listview-scrollcap-stale-estimate
  (closed via Stream M, silvery 8c63cfb9) + km-silvery.listview-scroll-overshoot
  (Stream O in flight, fixing the M regression). Same bug class. Session:
  km-session.0425-evening"
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.listview-scroll-cap-too-low
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-25T23:50:05Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] ListView in height-independent mode caps scroll before actual bottom @km/silvery #bug #P2

blocks:: [[@km/silvery/architectural-plateau]]

Symptom (screenshot 23.48.28): silvercode MessageList shows a list of 100+ commits; the bottom rows are visually clipped below the viewport but user cannot scroll down to reveal them. Wheel/keyboard scroll appears to hit an artificial floor before maxScrollRow reaches the real content end. Likely: in height-independent ListView mode (used by MessageList — no height prop), maxScrollRow is computed from items.length × estimateHeight (default 1) rather than measured rendered rows. Stream J fixed scrollbar visibility by using max(estimate, measured) for visibility gating, but the scroll-cap math may still use the estimate-only value. When tall items (multi-line message blocks) span more rows than estimateHeight predicts, the list 'thinks' it's at maxScrollRow when it's actually mid-content. Fix: use measured-rows for maxScrollRow too, not just for visibility. Affects vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx scrollRow clamping. Test: ListView with N items each 5 rows tall (no height prop), wheel-scroll to apparent bottom, assert all N items have been visible.