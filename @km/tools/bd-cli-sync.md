---
mentions:
  - km
id: "@km/tools/bd-cli-sync"
aliases:
  - km-tools.bd-cli-sync
  - km-tools-bd-cli-sync
created_by: claude:f8196c1c
created_at: 2026-03-27T23:13:56Z
owner: bjorn@stabell.org
---

# [ ] km bd: full capability sync — search, count, defer, reopen, graph, advanced filters @km/tools #task #P4

Future km bd enhancements from the bd capability audit. None are blockers — standalone bd covers them all.

New subcommands: search, count, defer/undefer, reopen, label mgmt, graph
List enhancements: --sort, --parent, --limit, --tree, --label-any
Show enhancements: --children, --long
Close: --suggest-next
Dependencies: dep cycles, dep tree, relate/unrelate

Prerequisite: @km/tools/bd-cli-fields (P2) covers the daily-use gaps first.

