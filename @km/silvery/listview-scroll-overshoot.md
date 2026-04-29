---
id: "@km/silvery/listview-scroll-overshoot"
aliases:
  - km-silvery.listview-scroll-overshoot
  - km-silvery-listview-scroll-overshoot
created_by: claude:2405c72e
created_at: 2026-04-26T07:43:28Z
closed_at: 2026-04-26T07:59:21Z
close_reason: "Shipped: silvery 76bfa8bb + 4c7958d8 + km root 6273feb44.
  Reverted Stream M's max(totalRowsStable, totalRowsMeasured) overshoot to
  totalRowsMeasured only. 3 regression tests + Stream M's 5 still pass. Session:
  km-session.0425-evening"
---

# [x] ListView scroll cap overshoots actual content end (user scrolls into empty viewport) @km/silvery #bug #P1 @claude:2405c72e

blocks:: [[@km/silvery]]

Stream M fix (commit 8c63cfb9) changed scroll cap from totalRowsMeasured to max(totalRowsStable, totalRowsMeasured) - trackHeight. When unmeasured items get a high avgMeasured fallback (driven by an atypically tall first item like a long system prompt), the cap overshoots actual content end. User scrolling down ends up with viewport rendering items 200+ when only 50 exist → empty viewport. Repro: silvercode --resume <id> with a session that has a long system prompt, scroll down. Fix: cap should use totalRowsMeasured ONLY (not max with stable). The visibility-gate's max() is correct for that purpose; the scroll cap is different — it must not exceed actual content bound.