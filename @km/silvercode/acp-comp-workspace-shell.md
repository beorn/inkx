---
id: "@km/silvercode/acp-comp-workspace-shell"
aliases:
  - km-silvercode.acp-comp-workspace-shell
  - km-silvercode-acp-comp-workspace-shell
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:39Z
---

# [ ] silvercode workspace shell — SidebarShell, Titlebar, FileTabs, StatusPopover @km/silvercode #feature #P4

blocks:: [[@km/silvercode/ide-shell]], [[@km/silvery/overlay-vocabulary]]

Extract+add the workspace shell components (heaviest bead):
- Extract <SidebarShell> from PaneGrid/SidePanel
- <SidebarWorkspace>, <SidebarProject>, <SidebarItems>
- <Titlebar>, <TitlebarHistory>
- <FileTabs> + <FileTabScroll>
- <SessionSortableTab>, <SessionSortableTerminalTab>
- <StatusPopover> + body

Estimated ~1,500-2,200 LOC. Depends on: @km/silvery/overlay-vocabulary (<DropdownMenu>).

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 2 bead 8.