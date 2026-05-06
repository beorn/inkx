---
mentions:
  - km
id: "@km/silvery/output-global-state"
aliases:
  - km-silvery.output-global-state
  - km-silvery-output-global-state
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:43Z
closed_at: 2026-03-13T04:57:57Z
close_reason: "Already fixed: createOutputPhase() factory pattern scopes all
  state per-instance via closure. No module-level globals."
owner: bjorn@stabell.org
---

# [x] Output phase diff pool/scratch state is module-global, not instance-safe @km/silvery #bug #P3

diffPool, diffResult, reusableCellStyle, wideCharLookupCell are module-level mutable state. If multiple output phases run interleaved (tests, strict verification, nested renderers), results can corrupt. Reentrancy concern. Found by GPT pipeline review.

