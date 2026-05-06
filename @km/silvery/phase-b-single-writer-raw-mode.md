---
mentions:
  - km
id: "@km/silvery/phase-b-single-writer-raw-mode"
aliases:
  - km-silvery.phase-b-single-writer-raw-mode
  - km-silvery-phase-b-single-writer-raw-mode
created_by: claude:019d032d
created_at: 2026-04-23T00:44:23Z
closed_at: 2026-04-23T00:55:08Z
close_reason: Shipped silvery cb8df156. term-provider + input-owner route
  raw-mode + bracketed-paste through injected Modes when Term-driven; fallback
  remains for standalone. 69 silvery runtime/modes tests + 2511 km-tui pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.phase-b-single-writer-raw-mode
    depends_on_id: km-silvery.phase-a3-streams-symbol
    type: blocks
    created_at: 2026-04-22T17:44:26Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.phase-b-single-writer-raw-mode
    depends_on_id: km-silvery.single-writer-raw-mode
    type: parent-child
    created_at: 2026-04-22T17:44:25Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.phase-a3-streams-symbol
      - type: link
        target: km-silvery.single-writer-raw-mode
---

# [x] Phase B: term-provider + InputOwner hand off raw-mode / bracketed-paste to term.modes @km/silvery #task #P1

blocks:: [[@km/silvery/phase-a3-streams-symbol]], [[@km/silvery/single-writer-raw-mode]]

## What changes

- \`packages/ag-term/src/runtime/term-provider.ts\` — accepts optional \`modes: Modes\` in options. When provided, replaces every direct \`stdin.setRawMode\` / \`enableBracketedPaste\` / \`disableBracketedPaste\` call inside \`events()\` with \`modes.rawMode(true)\` / \`modes.bracketedPaste(true)\` / \`modes.bracketedPaste(false)\`. The legacy direct-stdin path is deleted (provider requires a modes owner).
- \`packages/ag-term/src/ansi/term.ts\` — \`createTermProvider(stdin, stdout, { size, modes })\` receives both subowners.
- \`packages/ag-term/src/runtime/input-owner.ts\` — hands off raw-mode to modes where it currently calls \`stdin.setRawMode\` directly (if any remains; may already be routed through modes post-refactor).
- \`packages/km-infra/scripts/check-stdin-ownership.sh\` — baselines lowered.

## Delete

- Direct \`stdin.setRawMode(true/false)\` calls inside term-provider and input-owner (if present) — only \`devices/modes.ts\` and the `ansi/term.ts` plumbing may set raw directly.
- Direct \`enableBracketedPaste\` / \`disableBracketedPaste\` calls outside \`devices/modes.ts\`.

## /complete grep criteria

- \`grep -rn "stdin.setRawMode" vendor/silvery/packages/ag-term/src --include='*.ts'\` returns only \`devices/modes.ts\` + allowlisted lifecycle shim
- \`grep -rn "enableBracketedPaste\|disableBracketedPaste" vendor/silvery/packages/ag-term/src --include='*.ts'\` returns only \`devices/modes.ts\` imports + \`ansi/\` helper definitions
- \`bash packages/km-infra/scripts/check-stdin-ownership.sh\` passes with baselines reflecting the drops
- \`bun vitest run vendor/silvery/tests/runtime/\` passes
- Existing 2511 @km/tui tests pass

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

