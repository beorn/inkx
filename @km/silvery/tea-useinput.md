---
id: "@km/silvery/tea-useinput"
aliases:
  - km-silvery.tea-useinput
  - km-silvery-tea-useinput
created_by: Bjørn Stabell
created_at: 2026-04-11T15:17:42Z
closed_at: 2026-04-18T18:43:50Z
close_reason: "TEA Phase 2 wiring shipped on feat/selection-plateau: e4030611d
  (additive chain), 59ae1617e (hooks on ChainAppContext), 3380f2fb4 (chain
  authoritative, legacy arrays deleted), 8f7cc3fd9 (renderer.ts extracted, 544
  LOC). useInput precedence fixed via withFocusChain. Legacy
  runtimeInputListeners/PasteListeners/FocusListeners arrays DELETED. Deviations
  → follow-up beads: km-silvery.tea-inputboundary (7 rt.on fallbacks for nested
  InputBoundary scope), km-silvery.tea-custom-events (RuntimeContextValue façade
  kept for km-tui link:open bus), km-silvery.tea-create-app-split (2790 LOC vs
  1200 target — extract providers/lifecycle/press). Verified: non-vendor tsc 0,
  silvery tsc 154 (≤155 baseline), substrate 90/90, features 1299 + 6
  pre-existing unrelated."
---

# [x] TEA Phase 2: Fix useInput precedence inside createApp @km/silvery #task #P1 @Bjørn Stabell

blocks:: [[@km/silvery/selection-focus-plateau]]

Fix useInput precedence: focused components must get events before useInput fallback.

Current bug: processEventBatch has the right ordering (focus → fallback) but it's ad-hoc with raw Sets. Replace with structured apply chain inside createApp.

Target design: vendor/internal/silvery/design/v10-terminal/app-composition.md
Prototype: vendor/internal/silvery/design/v15-tea/plugin-system-v1r.ts

Changes (all internal to createApp — no consumer API changes):
1. Replace runtimeInputListeners/runtimePasteListeners Sets with apply chain
2. Focus dispatch returns explicit handled signal (false | Effect[])
3. useInput hooks register into the chain, not raw RuntimeContext.on()
4. Paste routing unified — focused onPaste before global usePaste
5. Keep useInput(handler, opts) signature unchanged

Consumer API stable: run(), createApp(), useInput, useApp — all unchanged.
TEA black box: only processEventBatch internals change.