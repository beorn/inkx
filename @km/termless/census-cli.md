---
id: "@km/termless/census-cli"
aliases:
  - km-termless.census-cli
  - km-termless-census-cli
created_by: claude:4929065a
created_at: 2026-03-23T05:49:02Z
closed_at: 2026-03-23T14:44:07Z
close_reason: Commander CLI with run/report/list subcommands, silvery output,
  dynamic backend discovery (5 backends), humanized notes, per-backend result
  files.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Census CLI: commander app with silvery output + sub-commands @km/termless #task #P2 @claude:4929065a

Turn bun census from a simple vitest + report pipe into a full commander CLI app with sub-commands: run (execute probes), report (generate/display matrix), diff (compare two results), list (show probe categories). Use silvery renderString for pretty output with semantic colors and flexbox tables.