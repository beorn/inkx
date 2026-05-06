---
mentions:
  - silvery
  - km
id: "@km/silvery/ag-react-progress-barrel-export-missing"
aliases:
  - km-silvery.ag-react-progress-barrel-export-missing
  - km-silvery-ag-react-progress-barrel-export-missing
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: bug
priority: P1
status: todo
parent: km-silvery
closeReason: "Shipped: silvery commit ec501706 (re-export progress/* from parent
  barrel) + km commit 688323b30 (migrated all 5 remaining consumers to /ui
  parent barrel). Verified: 27/27 in tasks-stale + tasks-assignee-filter,
  672/672 across apps/km-cli/tests/."
---

# [x] Re-export `progress/*` from `@silvery/ag-react/ui` parent barrel @km/silvery #bug #P1

`vendor/silvery/packages/ag-react/src/ui/index.ts` is missing `export * from "./progress/index.js"`. The barrel currently re-exports `cli`, `wrappers`, `types` but not `progress`. Two consequences:

1. `import { steps, step } from "@silvery/ag-react/ui"` returns `undefined` for those names — sites that called them would crash at first use.
2. Vitest's resolver doesn't honor the package.json `./ui/*` glob mapping, so consumers can't switch to the parent barrel as a workaround. This blocks 2 test-suite load failures in km (`apps/km-cli/tests/tasks-stale.test.ts` and `tasks-assignee-filter.test.ts`).

## Fix

One-line edit in `vendor/silvery/packages/ag-react/src/ui/index.ts`:

```typescript
export * from "./progress/index.js"
```

(Could also conditionally re-export `animation`, `image`, `react` if those should be in the barrel — needs silvery owner's call.)

## Acceptance

- `vendor/silvery/packages/ag-react/src/ui/index.ts` exports everything from `./progress/index.js`
- `bun -e "import('@silvery/ag-react/ui').then(m => console.log('steps' in m))"` prints `true`
- `bun vitest run apps/km-cli/tests/tasks-stale.test.ts apps/km-cli/tests/tasks-assignee-filter.test.ts` passes (load failure resolved)
- Property test or barrel-completeness audit pinning `progress`/`cli`/`wrappers`/`types` are all in the parent (so removing one becomes a TS-failure, not a runtime ghost-undefined)

## Why this is L4

The bug surfaced because the barrel was incomplete BUT compile-time + runtime didn't catch it (named imports of missing symbols fail silently in vitest, silently as `undefined` at runtime). After this fix:

- The barrel is a complete re-export by construction
- A barrel-completeness test pins it as an invariant
- Consumers can use either `@silvery/ag-react/ui` (parent) or `@silvery/ag-react/ui/progress` (subpath) interchangeably

## Surfaced by

Code-quality agent in session f9eb64dc, after the bd-fixer + my barrel-blanket commit (`301996277`) caused real consumers to silently lose `steps`. Reverted by `f8ce66798`. The runtime correctness lives in vendor, not km.

