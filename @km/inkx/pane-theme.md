---
id: "@km/inkx/pane-theme"
aliases:
  - km-inkx.pane-theme
  - km-inkx-pane-theme
created_by: claude:53ab8041
created_at: 2026-03-01T23:06:46Z
closed_at: 2026-03-01T23:39:45Z
owner: bjorn@stabell.org
assignee: claude:53ab8041
---

# [x] Per-pane theme: Box theme prop + context theme stack for unfocused dimming @km/inkx #feature #P1 @claude:53ab8041

Add a theme prop to Box that enables per-subtree theme resolution in the content phase. Currently, $token colors (e.g., color="$selected") resolve against a single module-level global theme (setActiveTheme). This means nested ThemeProviders don't actually give per-subtree colors — the last one rendered wins globally.

Fix: add a context theme stack to theme-defs.ts. The content phase pushes/pops themes as it walks Box nodes with a theme prop. parseColor (via getActiveTheme) automatically resolves against the nearest ancestor's theme.

Immediate use case: WorkspaceView wraps unfocused panes in <Box theme={unfocusedTheme}> where unfocusedTheme has dimmed $selected/$selectedfg tokens. All components inside automatically get dimmed selection colors without any per-component changes.