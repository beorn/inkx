---
mentions:
  - km
id: "@km/silvery/phase-a2-backend-term-signals"
aliases:
  - km-silvery.phase-a2-backend-term-signals
  - km-silvery-phase-a2-backend-term-signals
created_by: claude:019d032d
created_at: 2026-04-23T00:44:22Z
closed_at: 2026-04-23T00:47:39Z
close_reason: Shipped silvery b77c687c. createBackendTerm now constructs Signals
  and disposes with the term; emulator-backed path tested via
  @silvery/test/createTermless; 21 term-signals tests pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.phase-a2-backend-term-signals
    depends_on_id: km-silvery.phase-a1-signals-name-uniqueness
    type: blocks
    created_at: 2026-04-22T17:44:25Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.phase-a2-backend-term-signals
    depends_on_id: km-silvery.pro-review-p1
    type: parent-child
    created_at: 2026-04-22T17:44:24Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.phase-a1-signals-name-uniqueness
      - type: link
        target: km-silvery.pro-review-p1
---

# [x] Phase A2: createBackendTerm has signals owner @km/silvery #task #P2

blocks:: [[@km/silvery/phase-a1-signals-name-uniqueness]], [[@km/silvery/pro-review-p1]]

## What changes

- `packages/ag-term/src/ansi/term.ts` — `createBackendTerm` wires `createSignals()` into its termBase alongside size/modes, matching createNodeTerm and createHeadlessTerm.
- Tests: verify that \`createBackendTerm(emulator).signals\` is defined.

## Delete

- None (additive; filling a hole in the "always present" contract).

## /complete grep criteria

- `grep -n "signals" vendor/silvery/packages/ag-term/src/ansi/term.ts` shows signals wired in ALL THREE factories (Node, headless, emulator/backend)
- Test `createBackendTerm().signals` defined check passes

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

