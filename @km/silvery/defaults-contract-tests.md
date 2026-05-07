---
mentions:
  - km
id: "@km/silvery/defaults-contract-tests"
aliases:
  - km-silvery.defaults-contract-tests
  - km-silvery-defaults-contract-tests
created_by: claude:c6244087
created_at: 2026-04-23T07:38:01Z
closed_at: 2026-04-23T08:09:38Z
close_reason: "Phase 1 landed: silvery 349a76fd — 26 tests in
  vendor/silvery/tests/contracts/ seeded with the 3 bug-rows that started the
  convention (selection auto-on, detectTerminalCaps FORCE_COLOR, mouseDown+Up
  null range). CLAUDE.md updated. Phase 2 backlog is a TODO block in each file
  enumerating remaining @default options."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.defaults-contract-tests
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T00:38:01Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Defaults-contract tests: mechanically verify every documented default @km/silvery #feature #P1

blocks:: [[@km/silvery]]

Three bugs shipped in one week with the same shape: docstring claims a default, code implements the opposite, tests never exercise the default path.

## The three cases

1. `selectionEnabled = selectionOption ?? false` — docstring said 'Default: true when mouse is enabled'. Every test passed `selection: true` explicitly. (Fixed 6c4442ee.)
2. `detectTerminalCaps()` didn't honor FORCE_COLOR — docstring listed env precedence, but the function short-circuited before the canonical `detectColor()` helper. Only the runtime `run()` path was tested (run-color-level.test.tsx), never the helper directly. (Fixed 48143ef0.)
3. Mouse drag state machine — no test simulates `mouseDown → mouseMove → mouseUp`; no test for click-vs-drag threshold. Three bugs shipped: drag doesn't shrink on reverse, mouseUp fires onClick, plain click creates 1-char selection. (In progress @km/silvery/mouse-drag-vs-click.)

## Pattern (cause)

Tests always set options explicitly → default path is never exercised → doc↔code drift is invisible to CI. Same shape likely present on every public silvery option.

## Design: defaults-contract test file

One test file per public surface (run, createApp, render, createTermless, createTerm). Each file:

1. **Omitted-option → behavior tests**: for every option with a documented default, instantiate the consumer with `undefined` for the option; assert observable behavior matches the docstring. E.g.:

```ts
test('selection defaults to true when mouse is enabled', async () => {
  using term = createTermless()
  const handle = await run(<App />, term, { mouse: true })  // no selection
  // dispatch a drag; assert a selection range appears
})
```

2. **Env-var precedence tests**: for every env var listed in a docstring, assert the mapping at BOTH the detection helper AND the runtime boundary. Covers the `detectTerminalCaps` gap.
3. **State-machine transition tests**: for public state machines (mouse selection, search, keyboard focus), one test per arc. Named like `state:X --action:Y--> state:Z`. Seeded by the @km/silvery/mouse-drag-vs-click fix.
4. **Cross-consumer parity**: an identical run-color-level-style matrix but replayed against each entry point (run / createApp().run() / render / createTermless) — catches the drift that caused the blank-screen bug.

## Scope (phases)

- Phase 1: scaffold the convention — one file per entry point, seed with selection + colorTier + mouse-drag rows. Document in vendor/silvery/CLAUDE.md.
- Phase 2: port every documented default (`grep -rn 'Default:' vendor/silvery/packages/**/*.{ts,tsx}` → checklist)
- Phase 3: convention check — a lint-ish script that flags docstring 'Default:' claims without a matching contract test
- Phase 4: extract to `@silvery/test` utility so downstream apps (@km/logview, @km/tui) can declare their own option defaults and get the same gate

## Acceptance

- No option can ship with a 'Default:' docstring unaccompanied by a contract test
- `selection`, `mouse`, `colorTier`, `colorLevel` (legacy), `kitty`, `focusReporting`, `textSizing`, `widthDetection`, `alternateScreen` all have omitted-option tests
- Every public env var mentioned in docstrings has a detection-helper test + a run() boundary test
- Mouse state machine has transition tests (@km/silvery/mouse-drag-vs-click seeds this)

## Files

- vendor/silvery/tests/contracts/defaults-run.test.tsx (new)
- vendor/silvery/tests/contracts/defaults-create-app.test.tsx (new)
- vendor/silvery/tests/contracts/defaults-detection.test.ts (new)
- vendor/silvery/tests/contracts/defaults-mouse-state-machine.test.tsx (new — seeded by in-flight mouse-drag fix)
- vendor/silvery/CLAUDE.md (doc the convention)

## Reference

- feedback memory: 'Instrument first, theorize later' and 'Failures update steering docs'
- Prior art: VS Code has `vscode/src/vs/platform/configuration/test/common/configurationRegistry.test.ts` verifying default registry integrity

