---
id: "@km/tui/goto-journal"
aliases:
  - km-tui.goto-journal
  - km-tui-goto-journal
created_by: Bjørn Stabell
created_at: 2026-04-10T22:10:34Z
closed_at: 2026-04-10T22:22:45Z
close_reason: "Fixed: autoCreateDateTemplateFile now adds folder+file nodes to
  DB immediately via repo.addNode(), then navigates in a single press. No longer
  depends on watcher pickup. Also handles the case where file exists on disk but
  not in DB (watcher lag)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] g j (goto journal) doesn't work — file not created, no navigation @km/tui #task #P1 @Bjørn Stabell

g j should: (1) expand journals/{YYYY}/{YYYY-MM-DD}.md template, (2) create the file+dirs if missing, (3) add to DB, (4) navigate to it — all in one press. Currently nothing happens. User reports pressing multiple times with no effect.