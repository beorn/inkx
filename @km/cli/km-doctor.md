---
mentions:
  - km
  - claude
id: "@km/cli/km-doctor"
aliases:
  - km-cli.km-doctor
  - km-cli-km-doctor
created_by: claude:23485adf
created_at: 2026-02-24T01:46:34Z
closed_at: 2026-03-10T15:37:00Z
close_reason: Added km doctor links subcommand. Queries links table for
  unresolved targets, groups by source file. Broken link count in main health
  check.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] km doctor: detect and report broken wikilinks @km/cli #feature #P2 @claude:55df8ef1

Add a 'km doctor' command that detects and reports broken wikilinks at load/sync time. Currently broken links (e.g., wikilinks to nodes that don't exist) are only discovered during rendering, causing expensive SQL queries for nothing. The doctor command should: 1) Scan all nodes for wikilinks. 2) Resolve each against the name index. 3) Report unresolvable links with source node, line, and target. 4) Optionally fix common issues (e.g., stale renames).

