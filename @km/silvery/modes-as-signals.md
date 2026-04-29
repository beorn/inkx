---
id: "@km/silvery/modes-as-signals"
aliases:
  - km-silvery.modes-as-signals
  - km-silvery-modes-as-signals
created_by: claude:019d032d
created_at: 2026-04-22T22:01:20Z
closed_at: 2026-04-22T22:15:00Z
close_reason: Shipped silvery 7b9c5da7 + km bump 854ac2afb. term.modes now
  exposes alien-signals as the public API (readonly
  rawMode/altScreen/bracketedPaste/kittyKeyboard/mouse/focusReporting signals).
  Internal effects emit ANSI on change. All 39/39 silvery runtime+modes tests
  pass, km-tui 2511/2511 pass, tsc 0 non-vendor errors.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.modes-as-signals
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T15:01:58Z
    created_by: claude:019d032d
    metadata: "{}"
---

# [x] term.modes: expose alien-signals as public API, drop set* methods @km/silvery #task #P1

blocks:: [[@km/silvery/term-sub-owners]]

Refactor term.modes to expose its state as alien-signals signals (the public API), instead of setX methods + readonly getters. Replaces the current Modes interface.

## Why

User asked: "instead of the set* - could we just expose the signals?" — uniformity with term.size which is signal-backed; consumers can subscribe; no separate setter+getter pair to keep in sync.

## Target API

```ts
import type { Signal } from "@silvery/signals"

interface Modes extends Disposable {
  readonly rawMode: Signal<boolean>
  readonly altScreen: Signal<boolean>
  readonly bracketedPaste: Signal<boolean>
  readonly kittyKeyboard: Signal<number | false>
  readonly mouse: Signal<boolean>
  readonly focusReporting: Signal<boolean>
}
```

Reads: `term.modes.mouse()` (alien-signals callable getter)
Writes: `term.modes.mouse(true)` (callable setter — internal effect emits ANSI on change)
Subscribe: standard alien-signals `effect(() => term.modes.mouse())` or via `@silvery/signals` `useSignal`.

## Internal mechanics

- Each signal is owned by the Modes owner.
- An internal `effect()` per signal emits the relevant ANSI when the value changes (and only then — idempotent: same-value writes are no-ops thanks to alien-signals).
- Dispose: same teardown order as before, only restoring what was set.

## Acceptance criteria
- [ ] `runtime/devices/modes.ts` exposes signals; `setMouseEnabled` / `setKittyKeyboard` / `setRawMode` / `setAlternateScreen` / `setBracketedPaste` / `setFocusReporting` and the `is*` getters are removed.
- [ ] All ~7 call sites in `runtime/create-app.tsx` migrated (`modes.setX(v)` → `modes.X(v)`).
- [ ] Test suite at `tests/runtime/modes.test.ts` (or equivalent) updated and passing.
- [ ] `docs/api/term-modes.md` rewritten — signal-shaped API, drop the setter list.
- [ ] silvery typecheck baseline.
- [ ] km consumers still build (km doesn't call term.modes directly per audit; verify `bun fix` + `bun run test:fast` pass after submodule bump).