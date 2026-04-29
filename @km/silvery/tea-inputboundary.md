---
id: "@km/silvery/tea-inputboundary"
aliases:
  - km-silvery.tea-inputboundary
  - km-silvery-tea-inputboundary
created_by: Bjørn Stabell
created_at: 2026-04-18T18:44:09Z
closed_at: 2026-04-19T04:34:56Z
close_reason: "DONE via silvery bb8f5349 (InputBoundary owns child BaseApp —
  delete rt.on fallback in 5 hooks) + km bump 5a8b352f7. Also added
  vendor/silvery/packages/ag-react/src/chain-bridge.ts (new) as shared factory
  used by InputBoundary/render.tsx/renderer.ts. Consumer API stable. /complete:
  grep rt.on in ag-react/hooks = 0. features tests 1299 pass + 6 pre-existing
  unrelated. Scope creep (acceptable): fallback removal also broke
  createRenderer/render paths — fixed by installing ChainAppContext via
  chain-bridge there too."
---

# [x] InputBoundary child BaseApp — delete rt.on fallback paths @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

After TEA Phase 2 wiring (@km/silvery/tea-useinput), 7 `rt.on` call sites remain in ag-react hooks (useInput, useModifierKeys, useTerminalFocused, usePasteEvents, usePasteCallback) as fallbacks when ChainAppContext is absent. This happens inside InputBoundary (nested modal isolation), which creates its own local RuntimeContextValue without a chain.

Fix: give InputBoundary its own child BaseApp + plugin chain so hooks inside the boundary get ChainAppContext. Then delete all rt.on fallback branches. /complete: `grep "rt\.on(" vendor/silvery/packages/ag-react/src/hooks/` → 0 hits.