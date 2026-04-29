---
id: "@km/silvery/listview-resize-scroll-target"
aliases:
  - km-silvery.listview-resize-scroll-target
  - km-silvery-listview-resize-scroll-target
created_by: claude:cc081a9a
created_at: 2026-04-27T04:26:35Z
closed_at: 2026-04-27T04:37:45Z
close_reason: Fixed by silvery scrollTo recovery + 15-iter single-pass cap
  (cbefc8eb3 km / corresponding silvery). ai-chat.test.tsx:153 (resize) now
  passes. Only :115 (incremental-mismatch) remains failing — separate bead.
started_at: 2026-04-27T04:27:44Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.listview-resize-scroll-target
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T21:26:51Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] ai-chat.test.tsx:153 — scrollTo target index does not intersect viewport after resize @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

RESOLVED — already fixed in silvery f7adc32b (scrollTo recovery + larger single-pass cap for layout convergence).

Root cause: during multi-pass layout convergence (resize → contentHeight grows as items measure → cached offset clamped far above target), `scrollToChanged===false` blocked ensure-visible from re-firing in `calculateScrollState`, leaving the target off-screen and tripping STRICT INV-2.

Fix: added "same intent" recovery branch — re-fires ensure-visible when the cached offset has the target COMPLETELY off-screen (zero intersection with raw viewport). Conservative; partial visibility still leaves the offset pinned (preserves click-to-expand semantics).

Verification:
- vendor/silvery/tests/examples/ai-chat.test.tsx:153 "resize to 80x24" passes under SILVERY_STRICT=2 (this was the bead's reproducer).
- vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx (3 tests, 200 random runs each) passes.
- New regression test in vendor/silvery/tests/features/box-scroll-stable-on-growth.test.tsx — "same-intent recovery: target completely off-screen re-fires ensure-visible". Verified failing without the recovery branch; passing with it.

Commits:
- silvery a99728e8 — regression test (branch fix/listview-resize-scrolltarget-regression-test)
- km 804319f76 — vendor bump

The fix landed before this bead was investigated; the regression test closes the open task by encoding the bead's failure mode into the silvery test suite directly (no longer dependent on the ai-chat example continuing to exercise the same multi-pass layout path).