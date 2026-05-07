---
mentions:
  - km
  - claude
id: "@km/flexx/scroll-height-equalization"
aliases:
  - km-flexx.scroll-height-equalization
  - km-flexx-scroll-height-equalization
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:35:29Z
closed_at: 2026-02-15T21:14:57Z
owner: bjorn@stabell.org
assignee: claude:34ba82b6
---

# [x] VirtualList scroll container equalizes all child heights during multi-iteration doRender @km/flexx #bug #P2 @claude:34ba82b6

When a VirtualList child has a non-uniform height property (marginBottom, paddingBottom, height, etc.), during the Board's multi-iteration doRender loop (up to 5 passes through executeRender + Phase 2.7 layout notifications), ALL children in the scroll container end up with the maximum height rather than their individual heights.

**Reproduction:**

- In ColumnsView, set marginBottom={1} on body block items only (not structural items)
- Expected: body blocks have 1 blank line after them, structural items have 0
- Actual: ALL items get 1 blank line after them

**Key finding:** Isolated inkx tests (using createRenderer directly) render variable heights CORRECTLY. The bug ONLY manifests when rendering through the full Board component via testEnv()/doRender loop.

**Isolation test proving layout works:** vendor/beorn-inkx/tests/vlist-variable-height.test.tsx

- Variable height with Board-like nesting: PASSES
- With useContentRectCallback + useScreenRectCallback: PASSES
- With forced re-render: PASSES
- With incremental=true: PASSES

**Root cause hypothesis:** The doRender loop (renderer.ts lines 358-387) runs executeRender + Phase 2.7 layout notifications repeatedly. On subsequent iterations, flexx's constraint fingerprinting/caching may equalize all children in a scroll container to the maximum height encountered during earlier passes.

**Approaches all producing the same bug (ALL items get blank lines):**

1. marginBottom={needsSpace ? 1 : 0} on item Box
2. paddingBottom={1} on item Box
3. height={2} on TreeNode (vs height={1})
4. Fragment with sibling spacer Box
5. Wrapper Box with conditional Text child
6. Simple <Text> replacing MemoizedTreeCard (still fails)

