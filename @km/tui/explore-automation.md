---
id: "@km/tui/explore-automation"
aliases:
  - km-tui.explore-automation
  - km-tui-explore-automation
created_by: Bjørn Stabell
created_at: 2026-04-06T19:41:02Z
closed_at: 2026-04-06T21:02:35Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Automated explorative testing — invariant-driven TTY exploration @km/tui #feature #P2 @Bjørn Stabell

Vision: make explorative testing find bugs automatically instead of relying on visual inspection.

Key improvements:
1. Invariant-driven: connect TTY exploration with the invariant library (cursor valid, no IDs visible, no content corruption from nav keys, incremental=fresh)
2. Screenshot diffing: programmatic before/after comparison, flag unexpected changes
3. Mutation testing: verify filesystem not corrupted after every nav action (catches data corruption bugs like empty-card-key-capture instantly)
4. Session recording: .tape files for all TTY interactions, replay to reproduce
5. Continuous background fuzzing: run fuzz suite while user works, report via tribe

Current gap: TTY exploration is manual prompts + visual inspection. Fuzz tests run headless without TTY. These two should merge — TTY exploration with automated invariant checking.