---
id: "@km/_orphan/commit-perf"
aliases:
  - km-commit-perf
created_at: 2026-02-04T10:36:51Z
closed_at: 2026-02-04T11:55:34Z
---

# [x] Commit skill: LLM ignores investigation constraints, takes 2m+ instead of 30s @km/_orphan #task #P4

The /commit skill instructs the LLM to gather once then execute, but across 5+ iterations the model consistently runs 5-10 extra git diff/status/log commands after gather and haiku delegation. Tried: anti-patterns section, bold instructions, frontmatter description, removing investigation from allowed flow, haiku sub-agent for analysis, UserPromptSubmit hook for pre-gathering. None reliably prevent the model from investigating. Options: (1) bun commit CLI tool that gathers + calls haiku API directly, bypassing Opus investigation behavior, (2) Claude Code plugin that handles git commit workflow externally, (3) accept current behavior and optimize wall-clock time instead of turn count.