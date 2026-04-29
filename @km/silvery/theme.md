---
id: "@km/silvery/theme"
aliases:
  - km-silvery.theme
  - km-silvery-theme
created_by: claude:2ce3230f
created_at: 2026-03-07T19:10:17Z
closed_at: 2026-03-10T01:54:32Z
close_reason: "Enhanced ThemeExplorer Vue component: browser-side deriveTheme(),
  3 detail tabs (Preview TUI mockup, Semantic Tokens, Palette Colors), added
  cursor/selection data to all 45 palettes. Build passes."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] @silvery/theme web app for silvery docs @km/silvery #feature #P2 @claude:474834b0

Build an interactive web app hosted in the swatch VitePress docs site that lets users browse/create/customize/preview/export color themes. Uses swatch API directly (autoGenerateTheme, presetTheme, themeToCSSVars). Inspiration: shadcn/ui theme editor, Catppuccin previewer, Coolors.co