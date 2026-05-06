---
mentions:
  - km
  - claude
id: "@km/silvery/createapp-reuse-term-output"
aliases:
  - km-silvery.createapp-reuse-term-output
  - km-silvery-createapp-reuse-term-output
created_by: claude:019d032d
created_at: 2026-04-23T01:26:16Z
closed_at: 2026-04-23T02:20:37Z
close_reason: Shipped (silvery b158cac2 + km bump). createApp.run() now prefers
  injectedTerm.output when present; only constructs its own Output when no Term
  is injected or the Term has no output (headless/emulator). Ownership tracked
  via ownsOutput — dispose only tears down locally-constructed Outputs. km-tui
  2511 pass; silvery 1595/1602 (7 pre-existing fails unchanged).
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-silvery.createapp-reuse-term-output
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T18:26:31Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.term-sub-owners
---

# [x] createApp uses injectedTerm.output when present (eliminate latent dual-Output) @km/silvery #task #P2 @claude:019d032d

blocks:: [[@km/silvery/term-sub-owners]]

## Why

`packages/ag-term/src/runtime/create-app.tsx` at line ~1663 does:

```
if (shouldGuardOutput) {
  output = createOutput()
  output.activate()
}
```

It constructs a fresh Output even when `injectedTerm?.output` exists. Both instances monkey-patch the same `process.stdout.write`, so whichever activates last wins — a latent doubled-patcher bug in the same class as the Console/Output ordering hazard Pro reviewed.

Today the bug isn't firing because `injectedTerm.output` is lazy and nobody touches it on the createApp path, so only one Output is ever active. But the structural invariant says one writer per resource, and this violates it.

## Fix

Prefer `injectedTerm.output` when available:

```
if (shouldGuardOutput) {
  output = injectedTerm?.output ?? createOutput()
  output.activate()
}
```

Then audit dispose: only dispose the Output if we constructed it (ownership tracking).

## Acceptance

- [ ] When `injectedTerm?.output` exists, createApp uses it — no second Output instance
- [ ] When `injectedTerm` is null OR headless (no term.output), createApp constructs one as today
- [ ] Dispose flow: createApp only calls `output.dispose()` when it constructed the Output (not on term-owned instances)
- [ ] Test: `createApp.run(…, { term })` → `term.output.active()` is true during render, false after exit; no "two outputs patched" trace in logs
- [ ] @km/tui 2511 tests pass

## Effort

~30 min. Single-file change. Low risk.

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

