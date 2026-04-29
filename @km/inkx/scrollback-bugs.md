---
id: "@km/inkx/scrollback-bugs"
aliases:
  - km-inkx.scrollback-bugs
  - km-inkx-scrollback-bugs
created_by: claude:fa5431cd
created_at: 2026-03-03T18:25:31Z
closed_at: 2026-03-03T22:52:04Z
---

# [x] ScrollbackView: infinite compaction loop + resize corruption in run() runtime @km/inkx #bug #P1 @claude:fa5431cd

Two bugs in the static-scrollback demo:

1. **Infinite compaction loop**: computeCumulativeTokens counted ALL exchanges including frozen ones. After auto-compact at 95%, every new exchange immediately re-triggered compaction because frozen tokens still counted toward the total. Users couldn't type.

2. **Resize corruption**: mockStdout in run() had no-op on()/write() — resize events never reached ScrollbackView, and useScrollback's direct writes went nowhere. Frozen content stayed at old width on the visible screen after resize.