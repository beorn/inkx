---
id: "@km/silvery/selection-theme-tokens"
aliases:
  - km-silvery.selection-theme-tokens
  - km-silvery-selection-theme-tokens
created_by: claude:5e447b66
created_at: 2026-04-24T21:44:25Z
closed_at: 2026-04-25T05:59:14Z
close_reason: "Phase B shipped: silvery e69b80d9 (paintFrame plumbs
  theme[bg-selected]/theme[fg-on-selected] through composeSelectionCells; legacy
  selectionbg fallback retained for transition). 8/8 contract tests + 158/158
  selection suite green with SILVERY_STRICT=1. New
  tests/contracts/selection-theme.contract.test.ts. Pushed to origin/main."
started_at: 2026-04-25T05:20:31Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.selection-theme-tokens
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:13:01Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.selection-theme-tokens
    depends_on_id: km-silvery.sterling-selection-tokens
    type: blocks
    created_at: 2026-04-24T16:14:49Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [x] Plumb $selectionbg / $selectionfg theme tokens through paintFrame's applySelectionToPaintBuffer call @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-selection-tokens]]

Follow-up to @km/silvery/delete-render-selection-overlay (closed 2026-04-24).

Selection styling currently uses theme=undefined → fallback fg/bg swap (or SGR 7 inverse for default cells). When the user has a custom theme with semantic selection colors, those aren't honored.

## Site

vendor/silvery/packages/ag-term/src/runtime/renderer.ts:474
  applySelectionToPaintBuffer({ ... }):
    composeSelectionCells(buffer, range, undefined, false, scope)
                                       ^^^^^^^^^ — theme slot

The slot accepts SelectionTheme = { selectionFg?: Color; selectionBg?: Color }.

## What to add

1. Add $selectionbg and $selectionfg semantic tokens to silvery's theme system
   (alongside existing $inversebg/$inverse, $mutedbg/$muted, etc.)
2. Resolve them at the paintFrame call site (create-app.tsx:2007) and pass
   through applySelectionToPaintBufferFn → applySelectionToPaintBuffer →
   composeSelectionCells
3. Defaults: pick neutral selection colors that work across all 84 themes
   (similar to how $inversebg works)
4. Termless test asserting:
   - With custom theme tokens → cells get those colors
   - Without override → fallback fg/bg swap unchanged
   - Default-fg/bg cells (where compose currently uses inverseAttr SGR 7
     fallback) get the theme color, not the SGR 7 toggle

## Acceptance

- New token defined and documented in vendor/silvery/docs/guide/styling.md
- paintFrame plumbs it through (theme arg no longer undefined)
- Termless contract test in tests/contracts/ confirming default + override paths
- SILVERY_STRICT=1 selection suite passes
- @km/tui sees consistent selection color across all themes