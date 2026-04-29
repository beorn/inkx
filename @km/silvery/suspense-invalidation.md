---
id: "@km/silvery/suspense-invalidation"
aliases:
  - km-silvery.suspense-invalidation
  - km-silvery-suspense-invalidation
created_by: claude:c9beade3
created_at: 2026-03-13T07:13:11Z
closed_at: 2026-03-13T07:24:57Z
close_reason: "Fixed: hide/unhide now sets paintDirty + layoutDirty +
  markLayoutAncestorDirty. Tests in hide-unhide.test.tsx."
owner: bjorn@stabell.org
---

# [x] Suspense hide/unhide insufficient layout/paint invalidation @km/silvery #bug #P0

hideInstance/unhideInstance in host-config.ts only set contentDirty, missing paintDirty, layoutDirty, and markLayoutAncestorDirty. Combined with collectNodeTextContent not skipping hidden children (already fixed), Suspense transitions can leave stale measurement. GPT 5.4 review finding.