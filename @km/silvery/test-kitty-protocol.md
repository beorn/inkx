---
mentions:
  - km
id: "@km/silvery/test-kitty-protocol"
aliases:
  - km-silvery.test-kitty-protocol
  - km-silvery-test-kitty-protocol
created_by: Bjørn Stabell
created_at: 2026-04-01T07:28:33Z
owner: bjorn@stabell.org
---

# [ ] Termless test for kitty keyboard protocol setup @km/silvery #task #P3

No termless test verifies that run() with kitty:true sends the kitty keyboard protocol enable escape to the emulator. Should verify:

- Protocol escape reaches emulator
- Modifier keys encode correctly through the pipeline
- Protocol disabled on cleanup

File: vendor/silvery/tests/features/run-writable.test.tsx

