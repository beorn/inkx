---
id: "@km/storage/remove-shouldapplytoFs"
aliases:
  - km-storage.remove-shouldapplytoFs
  - km-storage-remove-shouldapplytoFs
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:07Z
closed_at: 2026-04-03T02:31:06Z
close_reason: Deleted. Commit/save split is the structural prevention.
owner: bjorn@stabell.org
---

# [x] Remove shouldApplyToFs — redundant with commit/project split @km/storage #task #P2

From /big quality review: shouldApplyToFs(actor) checks actor === 'fs-watch' to prevent echo loops. But commit/project split already prevents this structurally — FS-origin events use commit() which never calls project(). shouldApplyToFs is now defense-in-depth that obscures the real mechanism.

FIX: Remove shouldApplyToFs. The commit/project split IS the loop prevention. If an event somehow reaches project() with actor='fs-watch', that's a bug to be caught, not silently suppressed.