---
id: "@km/tui/node-visual-spec"
aliases:
  - km-tui.node-visual-spec
  - km-tui-node-visual-spec
created_by: Bjørn Stabell
created_at: 2026-04-08T06:35:15Z
closed_at: 2026-04-09T05:37:38Z
close_reason: "All 3 open questions resolved: muted borders invisible (no layout
  shift), cursor sub-item shows yellow breadcrumb title (no selectedBg), hover
  is universal. Commit 53392715c."
owner: bjorn@stabell.org
---

# [x] Review node visual spec — state × role matrix @km/tui #task #P1

Review docs/design/node-visual-spec.md — the complete matrix of state × role × visual treatment. Single source of truth for all selection/cursor/editing/done visual rules. Replaces the 8-rule comment in selection-style.ts. Open questions at the bottom need decisions.