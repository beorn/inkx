---
id: "@km/tui/empty-title-project"
aliases:
  - km-tui.empty-title-project
  - km-tui-empty-title-project
created_by: claude:8f007ba9
created_at: 2026-02-19T18:54:25Z
closed_at: 2026-02-19T19:04:42Z
---

# [x] Import: empty project title renders as '# -' @km/tui #bug #P3 @claude:8f007ba9

File 1201794885471491-.md has title '# -' — an Asana project with no name (team: Early Orbit). Renders as a dash in the TUI. Should either use the Asana project ID as fallback title or be flagged during import.