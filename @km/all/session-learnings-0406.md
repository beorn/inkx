---
id: "@km/all/session-learnings-0406"
aliases:
  - km-all.session-learnings-0406
  - km-all-session-learnings-0406
created_by: Bjørn Stabell
created_at: 2026-04-06T20:31:37Z
closed_at: 2026-04-06T20:59:47Z
close_reason: "Codified in docs/principles.md (5 code patterns: scoped ops, !=
  null, style as colors, state lifetime, atomic coupled updates),
  .claude/skills/explore/team.md (4 process patterns: invariants > manual,
  real+synthetic split, parallel files, aggressive bead updates), and
  .claude/skills/refactor/SKILL.md (7-layer rename checklist). Commit
  ad80dabad."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Session learnings 2026-04-06: 15 patterns from explore session — codify in skills @km/all #task #P3 @Bjørn Stabell

Today's exploration session surfaced 15 reusable learnings:

CODE PATTERNS (codify in docs/principles.md or /code skill):
1. Cursor must update atomically with tree-changing operations
2. Use != null for absence checks, not truthiness (empty string, 0, false)
3. Style modifiers as colors not booleans (cascade via inheritance)
4. State lifetime must match component lifetime (no orphans)
5. Operations should be scoped, not flagged (TEA machines)

PROCESS PATTERNS (codify in explore workflow):
6. CLAUDE.md needs Common Tasks tables, not just package lists
7. High-level screen assertions catch real bugs; state assertions don't
8. Background agents parallelize well when they don't share files
9. Question marks are documentation gaps — write docs first
10. /why finds the same structural causes — TEA machines = cure
11. Invariant checks > manual inspection (mutation detection on every action)
12. Real vault > synthetic fixtures
13. /tdd before fix prevents wrong fixes
14. Update beads aggressively — they survive context
15. Renames need a checklist (data, types, functions, files, comments, docs, tests)

Each of these should become either: (a) an entry in docs/principles.md, (b) a memory file, or (c) a skill update.