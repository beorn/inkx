---
mentions:
  - silvery
  - km
id: "@km/cli/sync-init-progress-import-fix"
aliases:
  - km-cli.sync-init-progress-import-fix
  - km-cli-sync-init-progress-import-fix
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: bug
priority: P1
status: todo
parent: km-cli
closeReason: "Resolved by silvery barrel re-export (ec501706) + consumer
  migration (km 688323b30). All consumers now import from @silvery/ag-react/ui
  parent barrel; vitest resolver no longer crashes on /ui/progress. Verified:
  672/672 in apps/km-cli/tests/."
---

# [x] Fix `@silvery/ag-react/ui/progress` import in init.ts/sync.ts/load-repo.ts (vitest-fail) @km/cli #bug #P1

`apps/km-cli/src/commands/init.ts`, `sync.ts`, and `apps/km-cli/src/load-repo.ts` import `steps` from `@silvery/ag-react/ui/progress`. The path resolves at runtime (Bun honors the `./ui/*` glob in package.json exports) but FAILS at vitest test-load time (vitest doesn't honor glob exports).

Symptom: 2 test-suite load failures in km — `apps/km-cli/tests/tasks-stale.test.ts` and `tasks-assignee-filter.test.ts`. Tests can't load because their import chain hits the broken path.

## Fix options (pick one)

**Option A** — depends on `@km/silvery/ag-react-progress-barrel-export-missing` landing first. Once silvery's `ui/index.ts` re-exports `progress/*`, all three consumers can switch to `@silvery/ag-react/ui` (parent barrel works in vitest). Single-character edit per file.

**Option B** — Move the `steps`-using logic into chain-immune planners, so test paths don't transit `init.ts`/`sync.ts`/`load-repo.ts`. Heavier lift; makes more sense if/when `init`, `sync`, `doctor` follow the planner-extraction pattern that `tasks/list,status,stale` shipped.

**Option C** — Pin silvery commit that has explicit `./ui/progress` export in package.json. Brittle (depends on vendor cooperation).

Recommendation: **Option A** if the silvery bead lands, else **Option B**.

## Acceptance

- [ ] `bun vitest run apps/km-cli/tests/tasks-stale.test.ts apps/km-cli/tests/tasks-assignee-filter.test.ts` passes (both files load)
- [ ] No `@silvery/ag-react/ui/progress` imports remain in km-cli source code (after Option A)
- [ ] Lint + tsc clean

## Why P1

Two visible test failures block CI green. The failures aren't real product bugs — they're infrastructure-fragility — but they undermine confidence in the test suite. Fixing them gets us back to "CI green = ship."

## Pairs with

- `@km/silvery/ag-react-progress-barrel-export-missing` — parent dependency for Option A
- `@km/storage/sync-emitter-migration` — landed; sync.ts/init.ts now use `getRepoEmitter`, but the silvery import is unrelated drift left over.

## Surfaced by

Code-quality agent + planner-extract agent + bd-fixer agent — three different agents independently flagged this in session f9eb64dc.

