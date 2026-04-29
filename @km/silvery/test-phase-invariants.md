---
id: "@km/silvery/test-phase-invariants"
aliases:
  - km-silvery.test-phase-invariants
  - km-silvery-test-phase-invariants
created_by: claude:c9beade3
created_at: 2026-03-13T04:37:19Z
closed_at: 2026-03-13T05:39:05Z
close_reason: "Added SILVERY_STRICT mode phase invariant assertions: (1)
  layout-phase.ts: validates layoutChangedThisFrame consistency with actual
  prevLayout vs contentRect comparison; (2) content-phase.ts: validates Scroll
  Tier 1 (buffer shift) never activates with sticky children"
owner: bjorn@stabell.org
---

# [x] Testing gap: runtime phase invariant assertions in strict mode @km/silvery #task #P2

Current diagnostics are mostly post-hoc differential checks. Add runtime assertions inside phases: if layoutChangedThisFrame then prevLayout != contentRect; if skipFastPath then no own dirty flags; if parentRegionCleared && has backgroundColor then illegal; scroll Tier 1 must have no sticky children. Catch bugs closer to source. Found by GPT 5.4 pro.