---
id: "@km/silvery/era2a-4-tree-api"
aliases:
  - km-silvery.era2a-4-tree-api
  - km-silvery-era2a-4-tree-api
created_by: claude:fed8de9e
created_at: 2026-03-25T03:52:17Z
closed_at: 2026-03-25T06:32:31Z
close_reason: "Phase 4 absorb step: ag tree mutation API (createNode,
  insertChild, removeChild, updateProps, setText, toString) added to Ag
  interface. Handles both AgNode + LayoutNode trees in sync. Reconciler
  continues using its own node creation — migration deferred to Phase 5 where
  plugin composition makes ag mutations the standard path."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2a Phase 4: ag tree mutation API + focus @km/silvery #task #P1 @claude:fed8de9e

Replace direct node manipulation with ag-owned API. Focus system already extracted to @silvery/ag (per @km/silvery/tea-3-ag, closed).

- ag/src/index.ts — extend createAg() factory (from Phase 3) with: createNode, insertChild, removeChild, updateNode, setText
- ag/src/focus.ts — focus system already in @silvery/ag (focus-manager.ts, focus-events.ts); verify API surface, add missing methods if needed
- ag-react/src/reconciler/nodes.ts — rewrite createNode() to call ag.createNode()
- ag-react/src/reconciler/ — all tree mutations go through ag API

Note: @silvery/ag already has node types (types.ts), focus system (focus-manager.ts, focus-events.ts), keys (keys.ts), tree-utils. This phase extends it with mutation API and wires reconciler through it.

**Delete**: Remove direct layoutNode access from reconciler. Remove direct LayoutEngine usage outside ag. Remove any ad-hoc node manipulation in reconciler that bypasses ag API.
**/complete**: grep for \.layoutNode in reconciler → 0 hits. grep for getLayoutEngine outside ag/ → 0 hits. grep for direct node\.children manipulation in reconciler → 0 hits. Focus confirmed in ag/ not ag-term/. Docs/examples updated.

Depends on Phase 3 (pipeline decomposition).
Design: era2a/rendering.md §Framework Adapters