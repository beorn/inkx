---
mentions:
  - km
id: "@km/silvery/single-writer-raw-mode"
aliases:
  - km-silvery.single-writer-raw-mode
  - km-silvery-single-writer-raw-mode
created_by: claude:019d032d
created_at: 2026-04-23T00:26:34Z
closed_at: 2026-04-23T00:55:10Z
close_reason: Shipped silvery cb8df156. term-provider + input-owner route
  raw-mode + bracketed-paste through injected Modes when Term-driven; fallback
  remains for standalone. 69 silvery runtime/modes tests + 2511 km-tui pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.single-writer-raw-mode
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T17:26:33Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.term-sub-owners
---

# [x] Single-owner raw mode + bracketed paste (eliminate term-provider / InputOwner / Modes overlap) @km/silvery #task #P1

blocks:: [[@km/silvery/term-sub-owners]]

## Problem (Pro-review P1)

Raw mode has three current owners:

- `term.modes.rawMode` (documented authority)
- `createInputOwner()` (sets raw at construction via `stdin.setRawMode(true)` in its own lifecycle)
- `term-provider.events()` (line ~261: `if (stdin.isTTY) stdin.setRawMode(true)` when the provider starts pumping events)

Bracketed paste has two owners:

- `term.modes.bracketedPaste`
- `term-provider.events()` (line ~347: `enableBracketedPaste(stdout)`)

This is exactly the class of split-global-state bug the whole sub-owner refactor was meant to eliminate. The refactor got half-done: sub-owners exist, but the legacy provider code never handed off.

## Solution

`createTermProvider` takes an optional `modes: Modes` dependency. When present:

- provider calls `modes.rawMode(true)` instead of `stdin.setRawMode(true)`
- provider calls `modes.bracketedPaste(true)` instead of `enableBracketedPaste(stdout)`
- cleanup is symmetric

`createInputOwner` also hands off raw-mode to `modes` instead of setting it directly (or, alternatively, its `setRawMode` op goes through modes).

Net: `modes` becomes the single source of truth, the ownership lint stops grandfathering in provider-level raw-mode writes.

## Acceptance

- [ ] `grep -rn "stdin.setRawMode" vendor/silvery/packages/ag-term/src --include='*.ts'` returns only `devices/modes.ts` + allowlisted escapes
- [ ] `grep -rn "enableBracketedPaste" vendor/silvery/packages/ag-term/src --include='*.ts'` returns only `devices/modes.ts` + `ansi/` helper definitions
- [ ] check-stdin-ownership.sh baselines drop
- [ ] term-provider tests pass under both direct-stdin and modes-injected paths

