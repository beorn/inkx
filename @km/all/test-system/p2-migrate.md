---
id: "@km/all/test-system/p2-migrate"
aliases:
  - km-all.test-system.p2-migrate
  - km-all-test-system-p2-migrate
created_by: Bjørn Stabell
created_at: 2026-04-10T08:22:57Z
closed_at: 2026-04-18T07:31:27Z
close_reason: "/complete criteria met: grep testEnv in tests/ (excl helpers) =
  0, grep testEnvWithRepo = 0. All test files migrated to createTestApp.
  Verified in worktree km-test-system at feat/test-system."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 2: Migrate ALL remaining testEnv files to createTestApp @km/all #task #P0 @Bjørn Stabell

Migrate all remaining ~67 files using testEnv to createTestApp.
For store.getState() patterns: replace with app.state, app.card(), or the new white-box APIs.
For truly internal state that has no public equivalent: add a thin accessor on TestApp.

Delete: testEnv calls from every migrated file
/complete:
- grep -rn 'testEnv\b' apps/@km/tui/tests/ --include='*.ts' | grep -v helpers/ | wc -l → 0
- grep -rn 'testEnvWithRepo' apps/@km/tui/tests/ --include='*.ts' | grep -v helpers/ | wc -l → 0