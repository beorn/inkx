---
id: "@km/tui/dialog-lifecycle-test"
aliases:
  - km-tui.dialog-lifecycle-test
  - km-tui-dialog-lifecycle-test
created_by: claude:fcaad2fa
created_at: 2026-02-17T23:53:04Z
closed_at: 2026-02-18T01:14:23Z
owner: bjorn@stabell.org
assignee: claude:fcaad2fa
---

# [x] Add createApp-lifecycle test for dialog confirm/cancel @km/tui #task #P2 @claude:fcaad2fa

The date dialog bug (@km/_orphan/qaco9) was not caught by TUI tests because createRenderer (test) and createApp (production) have different component lifecycle timing. The auto-save-on-unmount in useEditContext fires in production but may not trigger the same way in tests.

Create a test that exercises the full createApp lifecycle for dialog confirm/cancel — specifically verifying that confirming a dialog does NOT fire onConfirm twice (the auto-save-on-unmount must be properly cancelled).

This closes the test env vs production env gap that let @km/_orphan/qaco9 survive 4 fix attempts.

Root cause analysis: /pm 5-whys on @km/_orphan/qaco9