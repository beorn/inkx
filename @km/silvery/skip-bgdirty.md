---
id: "@km/silvery/skip-bgdirty"
aliases:
  - km-silvery.skip-bgdirty
  - km-silvery-skip-bgdirty
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:19Z
closed_at: 2026-03-13T04:42:14Z
close_reason: "False positive: bgDirty is only set inside the if(contentChanged)
  block in host-config.ts which always sets paintDirty=true first (line 436).
  Since paintDirty IS in the fast-path skip condition, bgDirty is always caught.
  No code path sets bgDirty without paintDirty."
---

# [x] Fast-path skip condition doesn't include bgDirty @km/silvery #bug #P2

If reconciler ever sets bgDirty without paintDirty, fast-path skip becomes unsafe. Should either add \!node.bgDirty to skip condition or assert invariant bgDirty => paintDirty. Found by GPT pipeline review.