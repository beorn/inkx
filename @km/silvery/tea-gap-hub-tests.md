---
id: "@km/silvery/tea-gap-hub-tests"
aliases:
  - km-silvery.tea-gap-hub-tests
  - km-silvery-tea-gap-hub-tests
created_by: Bjørn Stabell
created_at: 2026-04-18T19:02:13Z
closed_at: 2026-04-19T03:58:55Z
close_reason: "Fixed: added test:prototype script + wired into test:ci. bun
  vitest run --project prototype passes 82/82 (3 files). CI now blocks
  regressions in hub/silvery/prototype/."
---

# [x] TEA gap: hub/silvery/prototype/ tests need opt-in vitest project @km/silvery #task #P3

blocks:: [[@km/silvery/tea]]

Discovered while executing the aichat-v2 spike (@km/silvery/tea-aichat).

## Problem

Before the spike, hub/silvery/prototype/aichat-v2/app.test.ts had been
broken since the silvery-internal absorption (2026-04-17) because:

1. vitest.config.ts hardcoded `hub/**` in alwaysExclude (blocked discovery)
2. Relative imports in app.tsx/app.test.ts pointed to pre-absorption
   paths (silvery/examples/... instead of vendor/silvery/examples/...)
3. Shim imports pointed to @silvery/create/create-app — an invalid
   subpath because create-app.tsx is .tsx, not .ts

The net effect: all 17 aichat-v2 tests were silently dead code for ~2
weeks before anyone noticed.

## Fix (already landed in this spike)

vitest.config.ts now has a "prototype" project that explicitly includes
hub/silvery/prototype/**. Running `bun vitest run --project=prototype`
resurrects the tests.

## Remaining gap

The "prototype" project is opt-in — the default test run (`bun run
test:fast` / `test:all` / `test:ci`) still skips hub/ because hub
prototypes are by design outside the km module graph.

This is probably correct (hub is internal workspace, not km), but the
risk is that prototype tests rot silently again. Options:

(a) Wire `test:prototype` into the CI matrix so regressions in hub
    prototypes block merges.
(b) Add a pre-commit hook that runs the prototype project when files
    under hub/silvery/prototype/ change.
(c) Accept the risk; audit prototype tests periodically.

## Related

The same issue probably affects hub/silvery/prototype/headless/ — its
50 tests run fine now, but the same silent-rot risk applies.

## Effort

Small — add `bun run test:prototype` to the CI matrix if we decide to
gate merges on prototype tests.