---
mentions:
  - km
id: "@km/infra/consolidate-scripts"
aliases:
  - km-infra.consolidate-scripts
  - km-infra-consolidate-scripts
created_by: Bjørn Stabell
created_at: 2026-04-13T06:33:54Z
closed_at: 2026-04-13T06:57:14Z
close_reason: "Moved all infra/ contents to packages/km-infra/scripts/. Updated
  all references in package.json (12 scripts), tools/sop.ts, oxlint config,
  tsconfig.json (excluded scripts dir), 7 docs, 4 skill files, and internal
  script paths (REPO_ROOT, DATA_DIR, self-references). Verified: typecheck
  passes, bun fix clean, test:fast passes (only pre-existing flaky timeouts),
  lint:deps clean."
owner: bjorn@stabell.org
---

# [x] Consolidate infra/ scripts into packages/km-infra/ @km/infra #task #P3

Two infra locations exist: top-level infra/ (scripts: audit, test runners, typecheck, lint) and packages/@km/infra/ (configs: vitest, oxlint, oxfmt, knip, typescript, tool deps). Merge infra/ into packages/@km/infra/scripts/ and update all package.json script references. Low urgency — functional as-is, just messy.

