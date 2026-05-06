---
mentions:
  - km
id: "@km/inbox/infra-2"
aliases:
  - km-infra-2
  - "@km/_orphan/infra-2"
created_at: 2026-02-03T09:52:28Z
closed_at: 2026-02-04T11:27:37Z
---

# [x] Monorepo infra: streamlined packaging (from feat/km-infra learnings) @km/_orphan #task #P3

Continuation of @km/_orphan/infra-1 (closed). Goal: centralize monorepo config into a reusable package.

## Background

A feat/@km/infra worktree was created with a design doc (docs/future/monorepo-infra.md, exists on main) envisioning "XDG for monorepos" — convention-based config discovery with zero-boilerplate root configs.

## What was built (feat/@km/infra branch, 4 commits)

1. **vitest-reporter.tsx** — streaming dots reporter with per-package grouping, noisy test detection, slow test reporting. Fixed for Vitest 4.x API.
2. **bun-test-setup.ts** — test quality enforcement (fail on console output).
3. **Test relocation** — moved root tests/ to apps/@km/_orphan/cli/tests/ (proper package locations).
4. **.test-results/** gitignore entry.

The infra package itself lives at `infra/` (not `packages/km-infra/`), much simpler than the original vision.

## What was NOT built

The full config centralization plan from the design doc:

- No shared TypeScript base config factory
- No ESLint/Prettier config presets
- No auto-path generation from workspaces
- No vitest config factory (just the reporter)
- No release-it or knip generators

## Why it stalled

Branch drifted 323 commits behind main. The reporter/setup work was useful but narrow — the broader config centralization wasn't tackled. The existing open bead inkx-9w4 covers the shared config angle.

## Learnings

1. **Start narrow**: The reporter + setup were the highest-value pieces. Config centralization is lower priority since tools like oxlint/oxfmt already support -c path args.
2. **Vitest 4.x breaking changes**: onTestRunEnd signature changed. Reporter needed fixes.
3. **Test co-location works**: Moving tests from root to package dirs improved reporter grouping.
4. **Config files moved to packages/@km/infra/oxfmt/ and oxlint/**: Subsequent sessions on main moved configs under the package dir using -c flags.

## Recommended next steps

1. Cherry-pick the reporter work if still relevant (check if main has equivalent).
2. Remove the @km/infra worktree (323 behind, stale).
3. Continue config centralization via inkx-9w4 if/when needed.

## Related

- @km/_orphan/infra-1 (closed) — original bead, marked complete on the branch
- inkx-9w4 (open) — @beorn/monorepo shared config package
- docs/future/monorepo-infra.md — design doc (exists on main)

