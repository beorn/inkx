---
mentions:
  - km
projects:
  - Z
id: "@km/silvery/test-suspend-resume"
aliases:
  - km-silvery.test-suspend-resume
  - km-silvery-test-suspend-resume
created_by: Bjørn Stabell
created_at: 2026-04-01T07:28:34Z
owner: bjorn@stabell.org
---

# [ ] Termless test for Ctrl+Z suspend/resume terminal state @km/silvery #task #P3

No termless test verifies that suspend (Ctrl+Z) saves terminal state (alt screen, mouse, kitty, cursor) and resume restores it. captureTerminalState() and restoreTerminalState() are implemented but never verified through a real emulator.

File: vendor/silvery/tests/features/run-writable.test.tsx

