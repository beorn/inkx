---
id: "@km/silvery/with-app-spread-bug"
aliases:
  - km-silvery.with-app-spread-bug
  - km-silvery-with-app-spread-bug
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:54:47Z
closed_at: 2026-04-28T02:29:39Z
close_reason: Fixed in vendor/silvery commit 11e6a641 (Object.assign instead of
  spread in packages/create/src/with-app.ts). New with-app-apply-chain.test.ts
  pins both reference-identity and apply-wrapper-fires invariants. All 131 tests
  in vendor/silvery/packages/create/tests/ pass. km submodule pointer updated in
  commit 3309b3512.
---

# [x] withApp() object-spread breaks apply-chain contract @km/silvery #bug #P1

blocks:: [[@km/silvery/authoring-elegance]]

## Bug

`@silvery/create` `withApp()` at `vendor/silvery/packages/create/src/with-app.ts:112` returns `{...app, ...appExt}` — a fresh object spread. This silently breaks the apply-chain contract documented in `runtime/base-app.ts`:

- `BaseApp.dispatch` is closed over the ORIGINAL `app` reference (see `createBaseApp()` at `runtime/base-app.ts:101+`).
- Any downstream plugin that captures `app.apply` and replaces it on the post-spread object writes to a DIFFERENT object than dispatch reads from.
- Result: the plugin's apply wrapper is never invoked when `dispatch()` is called through the original app closure.

## Reproduction

```ts
const app = pipe(
  createBaseApp(),
  withApp(),           // returns {...app, ...appExt} — fresh object
  withHelpOverlay(),   // captures app.apply on the fresh object; assigns new apply there
)
app.dispatch({ type: 'help.show' })
// ^ no-op — dispatch uses the ORIGINAL apply (before withHelpOverlay),
// because createBaseApp's closure captured it.
```

## Impact

Any plugin composed AFTER `withApp()` is effectively dead for op-handling purposes. Discovered while building @km/tui/tea-help-overlay-v3; the workaround in help-overlay.v3.ts was to make `withHelpOverlay()` require only `BaseApp` (not `BaseApp & AppWithApp`) and feature-detect `keymap()` at install time. This is documented in the file header at apps/@km/tui/src/plugins/help-overlay.v3.ts.

## Fix

One-line change in `vendor/silvery/packages/create/src/with-app.ts:112`:

```diff
- return { ...app, ...appExt } as A & AppWithApp
+ return Object.assign(app, appExt) as A & AppWithApp
```

With Object.assign, the enhanced object IS the same reference as the original, so BaseApp.dispatch's closure stays correct.

## Why not force this fix tonight

@km/tui/tea-help-overlay-v3 had to ship without waiting on vendor/silvery changes. The workaround is a deliberate compromise — help-overlay.v3.ts is 60% elegant / 40% workaround-with-footnotes until this bug lands.

## Acceptance

- [ ] withApp() uses Object.assign instead of spread
- [ ] Add a test in vendor/silvery demonstrating the issue (ideally fails without the fix, passes with)
- [ ] Audit any other silvery with*() plugins for similar spread patterns
- [ ] Update help-overlay.v3.ts: remove the AppWithApp feature-detection, require BaseApp & AppWithApp directly
- [ ] Remove the upstream-issue note from help-overlay.v3.ts file header
- [ ] Move the v3 singleton from pipe(createBaseApp(), withHelpOverlay()) to pipe(createBaseApp(), withApp(), withHelpOverlay()) so the keymap branch is exercised in production

## References

- vendor/silvery/packages/create/src/with-app.ts:112
- vendor/silvery/packages/create/src/runtime/base-app.ts:101+
- apps/@km/tui/src/plugins/help-overlay.v3.ts (file header)
- bead @km/tui/tea-help-overlay-v3 (the bead this was discovered under)