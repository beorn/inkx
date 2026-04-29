---
id: "@km/bearly/tribe-auto-report"
aliases:
  - km-bearly.tribe-auto-report
  - km-bearly-tribe-auto-report
created_by: claude:19080504
created_at: 2026-03-23T07:01:57Z
closed_at: 2026-03-25T22:36:09Z
close_reason: Background polling (30s) detects git commits and bead changes,
  auto-sends status to chief. Opt-out via --no-auto-report.
---

# [x] Auto-reporting: plugin detects commits + bead changes @km/bearly #feature #P2 @claude:19080504

Plugin auto-sends status messages when it detects: git commits in worktree, bead claims/closes (via .beads/ file watch or polling), session joins/leaves. Reduces reliance on Claude remembering to report.