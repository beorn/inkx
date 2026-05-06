---
mentions:
  - km
  - Bjørn
id: "@km/silvery/zero-hooks-run"
aliases:
  - km-silvery.zero-hooks-run
  - km-silvery-zero-hooks-run
created_by: Bjørn Stabell
created_at: 2026-04-10T22:10:33Z
closed_at: 2026-04-10T22:23:16Z
close_reason: >-
  Done. run.tsx now has zero hook implementations — all 3 hooks are re-exports
  from ag-react:

  - useInput → ag-react/hooks/useInput (already done, fixed double-keypress)

  - useExit → ag-react/hooks/useExit (new file, moved from run.tsx)

  - usePaste → ag-react/hooks/usePasteCallback (new file, aliased as usePaste
  for compat)


  Architecture: NOT a legacy problem — run() correctly delegates to createApp().
  The central event loop (processEventBatch in create-app.tsx) is the single
  authority. Hooks are RuntimeContext subscribers, not separate event loops. The
  duplication was just historical copy-paste, not architectural layering.


  Tests: 243 files pass (6225 tests). key-release, run-exit, run-writable,
  clipboard-providers all green.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Zero hook implementations in run.tsx — all hooks in ag-react @km/silvery #task #P0 @Bjørn Stabell

Zero hook implementations in run.tsx — all hooks live in ag-react, run.tsx re-exports.

## Problem

run.tsx was a self-contained entry point predating ag-react's hook system. When ag-react's hooks matured, run.tsx's copies weren't migrated — they became legacy duplicates that silently fell behind (caused @km/silvery/double-keypress).

## Status

- [x] useInput — unified (re-export from ag-react, return 'exit' support added)
- [ ] usePaste — ag-term version redundant with useInput's onPaste option. Delete it.
- [ ] useExit — move to ag-react, re-export from ag-term

## Remaining duplicates

| Hook     | ag-react                              | ag-term                               | Action                                           |
| -------- | ------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| usePaste | Context getter (PasteHandler \| null) | Event subscription (handler callback) | Delete ag-term version — use useInput({onPaste}) |
| useExit  | Does not exist                        | Returns rt.exit()                     | Move to ag-react, re-export                      |

## Design rule

run.tsx defines: run(), RunOptions, RunHandle
run.tsx re-exports: useInput, useExit, type Key, type InputHandler, type UseInputOptions
run.tsx implements: NOTHING — zero hooks

/complete: run.tsx has zero hook function bodies

