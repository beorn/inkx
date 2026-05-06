---
mentions:
  - km
id: "@km/silvery/expose-termless-mouse"
aliases:
  - km-silvery.expose-termless-mouse
  - km-silvery-expose-termless-mouse
created_by: claude:c6244087
created_at: 2026-04-23T07:39:32Z
closed_at: 2026-04-23T07:58:52Z
close_reason: Landed in same commit as km-silvery.mouse-drag-vs-click. See
  silvery 915b4bf9 — term.mouse.*/term.clipboard API added to createTermless at
  vendor/silvery/packages/test/src/index.tsx. 7 regression tests use the new API
  (zero SGR byte strings, zero 'as any').
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.expose-termless-mouse
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T00:39:31Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Expose termless mouse + clipboard API through silvery's createTermless @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Termless has mouseDown/Up/Move/wheel + OSC 52 clipboardWrites already (vendor/termless/src/terminal.ts:226-260, :75-100). Silvery's createTermless() returns a Term that hides them, so every test rolls its own SGR-1006 byte injector via (term as any).sendInput. Six hand-rolled helpers in selection-e2e.test.tsx alone.

## Fix

Expose termless's existing methods on the Term returned by createTermless():

- `term.mouse.down(x, y, options?)`
- `term.mouse.up(x, y, options?)`
- `term.mouse.move(x, y, options?)`
- `term.mouse.wheel(deltaX, deltaY, options?)`
- `term.clipboard` — the OSC 52 write accumulator

Delegate straight to termless's Terminal. No new termless features, no encoding changes.

## Why

- Enables the mouse state-machine contract tests planned by @km/silvery/defaults-contract-tests
- Eliminates `as any` casts + byte-formatting drift in tests
- Makes `createTermless` surface match its purpose (simulate terminal events for tests)
- Matches the pattern the Chrome plugin uses: `page.mouse.down()`, familiar DX

## Scope

- vendor/silvery/packages/test/src/index.tsx — add the passthrough methods to the Term returned by createTermless
- Optionally: add a mouse-helper utility on createTermless ONLY (not the real createTerm, since real terminals don't inject synthetic events)

## Acceptance

- selection-e2e.test.tsx can replace its 6 hand-rolled helpers with direct `term.mouse.down()` calls
- Zero `as any` casts on term in silvery's test suite
- All existing selection + mouse tests still pass

