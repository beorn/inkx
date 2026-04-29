---
id: "@km/_orphan/fix-sh-tests"
aliases:
  - km-fix-sh-tests
created_at: 2026-01-25T21:12:49Z
closed_at: 2026-01-27T19:58:38Z
assignee: beorn
---

# [x] Fix disabled km sh test expectations @km/_orphan #task #P1 @beorn

9 test files in apps/@km/_orphan/cli/tests/sh/ are disabled because their expected outputs don't match reality:

- cursor-navigation.test.md-disabled
- history.test.md-disabled  
- json-mode.test.md-disabled
- key-sequences.test.md-disabled
- keys.test.md-disabled
- mutations.test.md-disabled
- path-navigation.test.md-disabled
- selection.test.md-disabled
- view-controls.test.md-disabled
- views.test.md-disabled

Issues:
1. Expected cursor format [0,0] but actual is [0] - tests expect cursor at task level but km sh board.md starts at section level
2. keys.test.md uses `cmd="bash"` wrapper which doesn't work (stdin not terminal error)
3. mutations.test.md expects set_status to write to file but it doesn't work

Fix approach:
- Update expected outputs to match actual cursor format
- For keys.test.md, rewrite to use `cmd="km sh board.md"` directly like cursor-navigation.test.md
- For mutations.test.md, investigate why set_status doesn't persist to file