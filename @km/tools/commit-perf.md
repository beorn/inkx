---
mentions:
  - km
  - claude
id: "@km/tools/commit-perf"
aliases:
  - km-tools.commit-perf
  - km-tools-commit-perf
created_at: 2026-02-04T11:55:27Z
closed_at: 2026-02-04T12:30:39Z
assignee: claude:a7826e85
---

# [x] Commit skill: LLM ignores investigation constraints, takes 2m+ @km/tools #task #P4 @claude:a7826e85

The /commit skill instructs the LLM to gather once then execute, but the model consistently runs 5-10 extra git diff/status/log commands. Options: (1) bun commit CLI tool that gathers + calls haiku API directly, (2) Claude Code plugin that handles git commit workflow externally, (3) accept current behavior and optimize wall-clock time.

