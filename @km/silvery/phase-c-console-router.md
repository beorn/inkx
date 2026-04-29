---
id: "@km/silvery/phase-c-console-router"
aliases:
  - km-silvery.phase-c-console-router
  - km-silvery-phase-c-console-router
created_by: claude:019d032d
created_at: 2026-04-23T00:44:23Z
closed_at: 2026-04-23T01:04:23Z
close_reason: Shipped silvery f8a9ab72 + km bump. Console tap + Output sink
  coexist on shared ConsoleRouter; 3 coexistence tests verify both orderings; 36
  owner tests + 2511 km-tui pass.
---

# [x] Phase C: one shared ConsoleRouter (Console + Output register, no direct console.* patching) @km/silvery #task #P1

blocks:: [[@km/silvery/console-output-one-patcher]], [[@km/silvery/phase-b-single-writer-raw-mode]]

## What changes
- NEW \`packages/ag-term/src/runtime/devices/console-router.ts\` — single patcher for all five \`console.*\` methods. Public API:
  - \`router.registerTap(handler: (method, args) => void): () => void\`
  - \`router.registerSink(opts: { suppress?: boolean; redirectFd?: number | null }): () => void\`
  - Dispose restores originals.
- \`packages/ag-term/src/runtime/devices/console.ts\` — \`Console.capture()\` becomes \`router.registerTap(recordEntry)\` + state bookkeeping. Delete the local \`install()\` / \`uninstall()\` patch loop.
- \`packages/ag-term/src/runtime/devices/output.ts\` — \`Output.activate()\` replaces its console.* patch block with \`router.registerSink({ suppress, redirectFd })\`. \`stdout/stderr.write\` patches stay in Output (router only owns console.*).
- \`packages/ag-term/src/ansi/term.ts\` — constructs one \`createConsoleRouter()\` per Term and passes it to both Console and Output owners.
- Tests: capture-before-activate AND activate-before-capture both result in entries captured; regression test for the pro-review P0-3 Console-first-Output-second hazard.

## Delete
- Console's local console.* patch install/uninstall code (now lives in the router).
- Output's console.* patch install/uninstall code (now lives in the router).

## /complete grep criteria
- \`grep -n "target\[method\]\s*=" vendor/silvery/packages/ag-term/src/runtime/devices/console.ts\` returns 0 (only the router installs)
- \`grep -n "console\.log\s*=\|console\.info\s*=\|console\.warn\s*=\|console\.error\s*=\|console\.debug\s*=" vendor/silvery/packages/ag-term/src/runtime/devices/output.ts\` returns 0
- New file \`devices/console-router.ts\` exists with tests
- New test: capture-before-activate AND activate-before-capture both result in Console.entries() > 0 after a \`console.log("x")\` — regression for Pro P0-3
- \`bun vitest run vendor/silvery/tests/features/console.test.ts vendor/silvery/tests/features/output.test.ts\` passes
- @km/tui 2511 tests pass

## Mandatory
Read docs/lessons/refactoring.md IN FULL before writing any code.