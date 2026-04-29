---
id: "@km/tui/tea-withDialogs"
aliases:
  - km-tui.tea-withDialogs
  - km-tui-tea-withDialogs
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:17:10Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.tea-withDialogs
    depends_on_id: km-tui.tea
    type: parent-child
    created_at: 2026-04-21T02:17:32Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] TEA withDialogs Phase 1 — parent tracker for all dialog cutovers @km/tui #feature #P1

blocks:: [[@km/tui/tea]]

withDialogs Phase 1 — dialog cutover tracker. Parent for per-dialog beads following the HelpOverlay + SearchDialog 4-file template (plugin + hook + bridge + parity tests). See hub/km/tea-phase1-withDialogs-scope.md for the full dialog inventory and scope decisions. Status: HelpOverlay (Phase 0), SearchDialog (Phase 1 real), DeleteConfirm (easy win) all landed. DatePromptDialog / FilterDialog / NewItemDialog open as follow-ups. Omnibox tracked by @km/tui/omnibox-unified (out of scope).