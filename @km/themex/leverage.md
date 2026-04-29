---
id: "@km/themex/leverage"
aliases:
  - km-themex.leverage
  - km-themex-leverage
created_by: claude:56a1fd6b
created_at: 2026-03-03T23:12:26Z
closed_at: 2026-03-03T23:20:37Z
owner: bjorn@stabell.org
assignee: claude:56a1fd6b
---

# [x] Leverage theme tokens across entire km + inkx codebase @km/themex #feature #P2 @claude:56a1fd6b

Go beyond migration — actively leverage the 33 theme tokens everywhere in km and inkx.

## Current State
The token migration (Phase F) renamed old tokens to new names ($text→$fg, $chromebg→$inverse, etc.), but many components still use hardcoded colors, ANSI codes, or only a subset of available tokens.

## Goal
Every color in @km/tui and inkx should come from theme tokens. No hardcoded hex values, no raw ANSI colors, no #rrggbb literals in component code. The entire UI should re-theme perfectly when switching themes.

## Areas to Audit
1. **inkx components** — ModalDialog, ScrollbackView, TextInput, TextArea, StatusBar, etc. Any hardcoded colors should use $token strings
2. **@km/tui views** — all views, dialogs, overlays. Audit for raw color literals
3. **@km/tui TreeNode/NodeView** — card rendering, icons, badges. Ensure all use semantic tokens
4. **Detail pane** — property editors, metadata display
5. **Command system UI** — CommandBox, Omnibox, search highlighting
6. **Error/status messages** — ensure they use $error/$warning/$success/$info consistently
7. **Borders and dividers** — all should use $border, not hardcoded gray
8. **Focus indicators** — all should use $focusborder
9. **Input fields** — all should use $inputborder (inactive) and $focusborder (active)
10. **Disabled states** — all should use $disabled-fg

## Non-Goals
- No new token creation (the 33 tokens should cover everything)
- No architectural changes — just color source replacement