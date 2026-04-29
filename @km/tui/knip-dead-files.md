---
id: "@km/tui/knip-dead-files"
aliases:
  - km-tui.knip-dead-files
  - km-tui-knip-dead-files
created_by: Bjørn Stabell
created_at: 2026-04-16T21:07:46Z
owner: bjorn@stabell.org
---

# [ ] Audit and remove knip-flagged dead files in apps/km-tui @km/tui #task #P3

SOP knip scan flags 172 unused files repo-wide. Most are false positives
(fuzz/bench/test fixtures that knip can't see entry points for), but
there's a real cleanup pass to do in apps/@km/tui:

  apps/@km/tui/src/views/ConsoleModal.tsx
  apps/@km/tui/src/views/FindBar.tsx
  apps/@km/tui/src/views/TopBar.tsx
  apps/@km/tui/src/views/selection-style.ts
  apps/@km/tui/src/config-persist.ts
  apps/@km/tui/src/undo/index.ts
  tools/session-promote.ts (verify — referenced from /sop SKILL.md)
  apps/@km/_orphan/cli/src/execute.ts
  apps/@km/tui/tests/{architecture-bench,architecture,board}.bench.ts (verify bench discovery)

For each file: confirm it's truly unreachable (grep imports across
apps/, packages/, vendor/, tests/, scripts/), or add a knip ignore
config entry if it's a legitimate-but-non-imported entry point
(benchmarks, tools, demo files).

Also: configure knip to skip *.bench.ts, *.fuzz.ts, tests/fixtures/**
properly so the noise floor drops below 20 findings, making future
SOP scans actionable instead of overwhelming.