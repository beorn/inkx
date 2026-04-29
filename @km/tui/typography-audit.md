---
id: "@km/tui/typography-audit"
aliases:
  - km-tui.typography-audit
  - km-tui-typography-audit
created_by: claude:3c24fe4a
created_at: 2026-03-17T21:24:45Z
closed_at: 2026-03-17T21:42:52Z
close_reason: "All dialog components (11 files) and view components (12 files)
  audited. Changed: HelpOverlay, FilterDialog, FavoritesDialog,
  SearchReplaceDialog, DatePromptDialog, Omnibox, SearchDialog,
  shared-components, NodeView, TreeNode, key-bar. Remaining render.ts/text/
  pipeline intentionally skipped (infrastructure uses raw ANSI)."
owner: bjorn@stabell.org
assignee: claude:3c24fe4a
---

# [x] Audit all views for semantic typography tokens @km/tui #task #P1 @claude:3c24fe4a

Review every view/dialog component in @km/tui for hardcoded colors, raw <Text bold/color> usage that should be semantic typography components (H1/H2/H3/P/Muted/Small/Strong/Kbd/etc). Ensure consistent token usage across all dialogs and views.