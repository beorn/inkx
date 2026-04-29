---
id: "@km/silvery/focus-unmount"
aliases:
  - km-silvery.focus-unmount
  - km-silvery-focus-unmount
created_by: claude:c9beade3
created_at: 2026-03-13T07:13:15Z
closed_at: 2026-03-13T07:24:57Z
close_reason: "Fixed: handleSubtreeRemoved() blurs focus on unmount,
  setOnNodeRemoved() hook wired in all render paths. Tests in
  focus-manager-unit.test.ts."
owner: bjorn@stabell.org
---

# [x] Focus manager retains references to deleted/unmounted nodes @km/silvery #bug #P0

removeChild, removeChildFromContainer, clearContainer, detachDeletedInstance do not blur/retarget focus. activeElement can point to detached tree node; focusNext indexOf returns -1; hasFocusWithin becomes false while activeId claims focus. GPT 5.4 review finding.