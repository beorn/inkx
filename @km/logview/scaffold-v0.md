---
mentions:
  - km
  - claude
id: "@km/logview/scaffold-v0"
aliases:
  - km-logview.scaffold-v0
  - km-logview-scaffold-v0
created_by: claude:c6244087
created_at: 2026-04-23T05:56:40Z
closed_at: 2026-04-23T06:09:37Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-logview.scaffold-v0
    depends_on_id: km-logview
    type: parent-child
    created_at: 2026-04-22T22:56:47Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-logview
---

# [x] Scaffold km-logview: silverized TS log viewer @km/logview #feature #P2 @claude:c6244087

blocks:: [[@km/logview]]

Build apps/@km/logview — silvery-based TUI for viewing structured log files (JSONL etc.). Features:\n- Path-based auto-detect ViewConfig (Claude session JSONL + generic JSONL fallback)\n- silvery ListView virtual scrolling\n- / find with highlight\n- Per-field coloring + multi-line field support\n- Keybindings via silvery focusScope (j/k, Enter, /, n/N, ?, D, q)\n\nv0 scope: read JSONL, render rows, find. No watch mode, no external configs.

