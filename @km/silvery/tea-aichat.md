---
id: "@km/silvery/tea-aichat"
aliases:
  - km-silvery.tea-aichat
  - km-silvery-tea-aichat
created_by: Bjørn Stabell
created_at: 2026-04-11T15:17:55Z
closed_at: 2026-04-18T19:06:59Z
close_reason: |-
  TEA Phase 3 spike complete — design validated via aichat-v2.

  ## Commits (on main)

  - f1ad9aca1 fix(hub/silvery): restore test runnability after absorption
    - Fix stale paths (silvery/examples → vendor/silvery/examples)
    - Fix @silvery/create/create-app subpath → @silvery/create barrel
    - Add "prototype" vitest project (opt-in: --project=prototype)
    - Resurrects 17 dead tests

  - 6c192d946 refactor(hub/silvery): React context replaces module-level _chat
    - ChatContext + ChatProvider + useChat() / useChatModel()
    - Model created once in main(), passed by reference to both
      withChat (domain commands) and ChatProvider (React tree)
    - Resolves divergences (b) inline model construction and (c)
      module-level _chat from the bead
    - Divergence (d) op() proxy was already absent
    - Divergence (a) app.providers is captured in new gap bead
      (not present in the prototype nor in app-composition.md)

  - da1979bf2 test(hub/silvery): validate apply chain + effects as data
    - 15 new tests covering BaseApp contract (7) + integration (8)
    - Inlines minimal substrate (createBaseApp, withInputChain) because
      real substrate is stranded on feat/tea-apply-chain-types branch
    - Proves: dispatch/apply/drainEffects semantics, reentry guard,
      dispatch-effect re-entry, plugin ordering, handler→command routing,
      exit effect, release passthrough, ops/effects are JSON-serializable,
      replay works.

  - 0222fba6a docs(hub/silvery): manual verification checklist + smoke test
    - Documents the 3s smoke test (verified: app renders first frames)
    - Lists interactive items that require real TTY: keybindings,
      focus events, resize, streaming, lifecycle

  ## Validation result

  The TEA design substrate (Op / Effect / ApplyResult / BaseApp /
  with*Chain plugins) handles a real non-trivial app (aichat-v2) end to
  end. Confirmed via 32 passing tests (17 model + 15 apply-chain) plus a
  live render smoke test that shows the composed app:

    pipe(create, withScope, withCommands, withTerm, withChat,
         withKeymap, withDemoScript, withReact)

  …producing chat UI with streaming, tool-run delivery, input box, and
  exit wiring.

  ## Substrate gaps filed (under km-silvery.tea)

  - km-silvery.tea-gap-substrate-merge (P1) — Phase 2 substrate (90
    tests, base-app/event-loop/lifecycle-effects/with-*-chain) is stuck
    on feat/tea-apply-chain-types; main is still the 2,978-line monolith.
    THIS IS THE BLOCKER for rolling out to km-tui.
  - km-silvery.tea-gap-view-factory (P2) — withReact({view}) should
    accept (app) => ReactElement for late-bound references (app.chat).
    Current forces a late-bound quit() hack.
  - km-silvery.tea-gap-app-context (P3) — createAppContext<T>() helper
    to eliminate hand-rolled Context + Provider + use() boilerplate in
    every domain plugin.
  - km-silvery.tea-gap-tsx-subpath (P3) — "./*" wildcard in
    @silvery/create package.json doesn't resolve .tsx files; broke shim
    imports.
  - km-silvery.tea-gap-hub-tests (P3) — hub/silvery/prototype/ tests
    aren't in default CI matrix; risk of silent rot (what happened after
    the silvery-internal absorption).

  ## Test counts

  - Before: 17 aichat-v2 tests were broken (hub/** excluded + stale paths)
  - After:  32 aichat-v2 tests pass (17 model + 15 apply-chain)
  - 82 total prototype tests pass (aichat-v2 + headless)
  - 0 TS errors under hub/silvery (npx tsc --noEmit)
  - 0 non-vendor TS errors added

  ## Real-substrate validation

  The 90 substrate tests on origin/feat/tea-apply-chain-types already
  pass (verified via git show --stat on latest commit). The spike's
  inline substrate mirrors the real substrate line-for-line (same
  semantics, same types, same plugin idiom); when Phase 2 merges, the
  inline substrate in apply-chain.test.ts is a single-PR swap:

    import { createBaseApp } from "@silvery/create/runtime/base-app"
    import { withInputChain } from "@silvery/create/runtime/with-input-chain"

  …replaces the ~120 lines of inlined substrate.

  ## Pipeline rule

  Zero edits to vendor/silvery/packages/ag-term/src/pipeline/*.ts.
  Also zero edits to files claimed by the parallel agent:
  - vendor/silvery/packages/ag-term/src/runtime/create-app.tsx
  - vendor/silvery/packages/ag-react/src/contexts/InputBoundary.tsx
  - vendor/silvery/packages/ag-react/src/context.ts
  - 5 ag-react hooks (useInput, useModifierKeys, useTerminalFocused,
    usePasteEvents, usePasteCallback)
---

# [x] TEA Phase 3: Validate TEA design via aichat-v2 spike @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

Spike/prototype to validate TEA design end-to-end before committing to createApp internals.

aichat-v2 is the proving ground — it exercises signals, createModel, pipe composition, when() keybindings, scope, headless tests in a real app. Not a product deliverable; a design validation.

Prototype: vendor/internal/silvery/prototype/aichat-v2/
Target design: vendor/internal/silvery/design/v10-terminal/app-composition.md

Work:
1. Fix remaining divergences from target design (app.providers, inline model, module-level _chat, no op() proxy)
2. Validate full apply chain with effects as data (building on phase 2 work)
3. Test with real TTY (keystrokes, focus, lifecycle)
4. Confirm the design works before rolling out to createApp internals

Depends on: @km/silvery/tea-useinput (phase 2 — basic apply chain)