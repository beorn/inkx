---
mentions:
  - km
  - claude
id: "@km/terminfo/unified-cli"
aliases:
  - km-terminfo.unified-cli
  - km-terminfo-unified-cli
created_by: claude:f8196c1c
created_at: 2026-03-25T19:35:22Z
closed_at: 2026-03-25T19:48:55Z
close_reason: "Implemented unified CLI: terminfo probe
  {termless|server|app|here}, report, status, detect, submit. Consistent UX
  pattern. Fresh daemon results for 3 terminals. Pushed and deploying."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Unified terminfo CLI: terminfo probe {termless|server|app|here} @km/terminfo #task #P2 @claude:f8196c1c

Merge two separate CLIs (packages/cli/ + cli/) into one unified CLI with consistent UX:

terminfo probe termless [backend] [--all] [--force]
terminfo probe server [daemon] [--all] [--start]
terminfo probe app [terminal] [--all]
terminfo probe here [--json]
terminfo report
terminfo submit
terminfo status
terminfo detect

Pattern: bare = list, --all = run all, name = run specific.

Current state: two CLIs with different invocation (bun census:* vs npx terminfo.dev), confusing names, duplicated probe logic.

