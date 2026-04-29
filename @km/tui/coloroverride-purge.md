---
id: "@km/tui/coloroverride-purge"
aliases:
  - km-tui.coloroverride-purge
  - km-tui-coloroverride-purge
created_by: Bjørn Stabell
created_at: 2026-04-18T18:44:01Z
closed_at: 2026-04-18T19:18:57Z
close_reason: Shipped at 089b4629f. All 36 colorOverride sites migrated to
  silvery's color='inherit' cascade (v0.18.0). InlineRenderContext.colorOverride
  deleted, replaced by stripInlineColors boolean. resolveColor helper deleted.
  Pre-existing test failures (unified-omnibox, which-key, config) confirmed
  unrelated.
---

# [x] Migrate all colorOverride → color='inherit' @km/tui #task #P2

blocks:: [[@km/tui]]

Silvery shipped color='inherit' in v0.18.0. @km/tui still has 36 colorOverride sites across 8 files. Migrate all to use color='inherit' and remove the colorOverride context entirely. Files: NodeView.tsx, selection-style.ts, OmniboxRow.tsx, TreeNode.tsx, shared-components.tsx, DetailView.tsx, InlineComponents.tsx, link-interaction.ts. Acceptance: rg colorOverride apps/@km/tui returns 0; bun fix && bun vitest run apps/@km/tui/tests passes.