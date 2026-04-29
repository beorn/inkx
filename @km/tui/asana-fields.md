---
id: "@km/tui/asana-fields"
aliases:
  - km-tui.asana-fields
  - km-tui-asana-fields
created_by: claude:fcaad2fa
created_at: 2026-02-18T16:17:33Z
closed_at: 2026-02-18T21:11:23Z
owner: bjorn@stabell.org
---

# [x] Asana import: expanded fields + full re-import with new data @km/tui #task #P2

## Missing Fields to Add

### Critical
- `parent.name` / `parent.gid` — parent task (canonical tree location)
- `dependencies` / `dependents` — task dependencies (map to bd dep model)
- `attachments` — file attachments (we need these!)
- `is_rendered_as_separator` — section-like tasks, should render as HR

### Nice to Have
- `external` — external integration data (if it exists)
- `followers.name` — who's watching
- `projects.name` — full project list directly

### Constraints
- Do NOT re-import existing data — changes only affect future imports
- Update TASK_FIELDS in asana-types.ts
- Update task-transform.ts to map new fields to KNode data
- For is_rendered_as_separator: set node type or fstype so TUI renders as HR
- For parent: store in data.parentTask or similar, use for link_to resolution
- For dependencies: store in data.dependencies[], map to bd dep format later