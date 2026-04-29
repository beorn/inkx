---
id: "@km/silvery/showcase-inventory"
aliases:
  - km-silvery.showcase-inventory
  - km-silvery-showcase-inventory
created_by: claude:491faf6c
created_at: 2026-03-25T20:38:36Z
closed_at: 2026-03-25T23:56:03Z
close_reason: "Created 235-line inventory at docs/showcase-inventory.md: 48
  demos cataloged across 8 categories. Found 19 orphaned demos, 3 wrong
  screenshots, 6 missing screenshots."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Showcase inventory: catalog all demos, where they're used, issues per demo @km/silvery #task #P2 @claude:19080504

## Inventory

### Showcase apps (5 built, rendered via xterm.js in showcase-app.tsx)
| ID | App | Source | Used on pages |
|---|---|---|---|
| dashboard | CPU/Memory/Network monitor | layout/dashboard.tsx | homepage viewer, /getting-started/quick-start, /examples/tables, /examples/scrollback, /examples/components (WRONG), /examples/layout, /examples/live-demo |
| kanban | Kanban board | apps/kanban.tsx | /examples/ gallery, /guide/scrolling |
| components | Component gallery | apps/components.tsx | /examples/ gallery, /guides/components, /examples/forms |
| dev-tools | Log viewer | apps/dev-tools.tsx | /examples/ gallery |
| textarea | Note editor | apps/textarea.tsx | /examples/ gallery |

### Embed types
- **ShowcaseGallery.vue** — tabbed gallery on /examples/ (interactive, xterm.js iframe)
- **LiveDemo.vue** — single demo on guide/example pages (xterm.js iframe)
- **Homepage iframe** — viewer.html with full example browser

### Example apps NOT in showcase (could be added)
aichat, cli-wizard, data-explorer, task-list, scroll, search-filter, gallery, theme, explorer, terminal

### Issues per demo
**dashboard**: Progress bars look rough (dotted fill), content cropped at bottom, uneven padding
**kanban**: Looks OK but columns could be wider
**components**: Typography tab content is cramped, tabs navigation broken in web
**dev-tools**: Looks decent, log coloring works
**textarea**: Untested quality

### Wrong demo assignments
- /examples/components shows dashboard (should show components)
- /examples/tables shows dashboard (should show data-explorer or similar)
- /examples/scrollback shows dashboard (should show scroll)
- /examples/layout shows dashboard (should show dashboard — correct but boring)

### Global issues
- xterm.js iframe: uneven padding, broken input, rendering corruption on resize
- Many example pages use dashboard as placeholder instead of relevant demo
- Canvas renderer has no input support (can't replace xterm for interactive)
- No pre-recorded screenshots for static embeds