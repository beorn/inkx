---
id: "@km/silvery/examples-dashboard"
aliases:
  - km-silvery.examples-dashboard
  - km-silvery-examples-dashboard
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:43Z
closed_at: 2026-03-29T07:03:39Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:db326126
---

# [x] Example: dashboard (btop-style, responsive, live metrics, charts) @km/silvery #task #P1 @claude:db326126

✓ COMPLETE — Dashboard example implements approved design

## What It Demonstrates
- Complex multi-pane layout with flexbox (60% CPU | 40% Memory/Network stacked | full-width processes)
- Live-updating metrics with sparklines and progress bars
- Responsive layout (2-column on wide, tabbed on narrow)
- Severity-based color coding (green/yellow/red by percentage)
- 10 CPU cores with frequency and temperature
- Memory breakdown and network I/O rates
- Top 16 processes table sorted by CPU

## Implementation
File: vendor/silvery/examples/layout/dashboard.tsx (1001 lines)
- Renders at 137×43 (standard showcase dimension)
- WideLayout: 3-col flexbox (CPU 60%, Memory/Network 40% stacked)
- NarrowLayout: Tabs for narrow terminals (<100 cols)
- Live updates every 500ms via useInterval()
- Exit with 'q' or Esc

## Design Workflow
Approved ANSI mockup: vendor/silvery-internal/design/mockups/dashboard-mockup.ansi
(Moved from public/screenshots to silvery-internal per user directive)