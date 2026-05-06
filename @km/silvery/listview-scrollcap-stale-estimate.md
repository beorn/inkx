---
mentions:
  - km
  - claude
id: "@km/silvery/listview-scrollcap-stale-estimate"
aliases:
  - km-silvery.listview-scrollcap-stale-estimate
  - km-silvery-listview-scrollcap-stale-estimate
created_by: claude:2405c72e
created_at: 2026-04-26T07:26:03Z
closed_at: 2026-04-26T07:39:08Z
close_reason: "Shipped: silvery 8c63cfb9 + km root f0b6691e8. Switched
  maxScrollRow to totalRowsMeasured (same root class as Stream J). 5 tests.
  Session: km-session.0425-evening"
started_at: 2026-04-26T07:26:07Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.listview-scrollcap-stale-estimate
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T00:26:07Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] ListView maxScrollRow uses estimate × items in height-independent mode @km/silvery #bug #P1 @claude:2405c72e

blocks:: [[@km/silvery]]

Same root class as Stream J's scrollbar/bump fix. maxScrollRow computed from items.length × estimateHeight (default 1) caps scroll prematurely when items wrap to multi-line. User can't scroll to actual bottom even though more content is below viewport. Fix: use the measured-rows source already computed by Stream J for the cap.

