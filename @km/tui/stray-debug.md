---
mentions:
  - km
id: "@km/tui/stray-debug"
aliases:
  - km-tui.stray-debug
  - km-tui-stray-debug
created_by: claude:499eee95
created_at: 2026-02-13T18:27:48Z
closed_at: 2026-02-13T18:45:28Z
owner: bjorn@stabell.org
---

# [x] Delete 3 stray debug test files @km/tui #task #P3

Three debug/analysis test files cluttering the test directory:

- ansi-diff-analysis.test.ts (585 lines) — ANSI diff analysis, review for value
- breadcrumb-update-debug.test.ts — debug repro
- fold-border-debug.test.ts — debug repro

Triage each: keep valuable ones as proper regression tests, delete the rest.

