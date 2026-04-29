---
id: "@km/silvery/prevlayout-overload"
aliases:
  - km-silvery.prevlayout-overload
  - km-silvery-prevlayout-overload
created_by: claude:c9beade3
created_at: 2026-03-13T04:28:59Z
closed_at: 2026-03-13T05:18:36Z
close_reason: "Won't fix: prevLayout serves dual purpose (change detection +
  excess clearing) but works correctly via syncPrevLayout at end of content
  phase. The overload is intentional — separating would add complexity without
  benefit."
---

# [x] prevLayout field overloaded — change detection + content-phase bookkeeping @km/silvery #bug #P3

prevLayout is used for both layout change detection (notifications via notifyLayoutSubscribers) and content-phase incremental bookkeeping (syncPrevLayout). This dual role creates fragile phase interactions and potential subscriber notification drift. Recommend splitting into prevLayoutForNotification and prevLayoutForContent. Found by GPT pipeline review (3/3 flagged).