---
id: "@km/silvery/cli-commander"
aliases:
  - km-silvery.cli-commander
  - km-silvery-cli-commander
created_by: claude:f8196c1c
created_at: 2026-03-27T03:17:14Z
closed_at: 2026-03-27T03:51:02Z
close_reason: "@silvery/commander shipped: colorizeHelp (ANSI style hooks),
  createCLI (typed opts via const generics), Commander re-exports. 22 tests.
  Deployed to 8 CLIs. Replaced @commander-js/extra-typings across 33 files via
  direct import swap."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Colorized Commander.js help output using silvery theme tokens @km/silvery #feature #P2 @claude:f8196c1c

Add colorizeHelp() to silvery/ui/cli that patches Commander's help formatter with semantic color tokens. One-line integration for any Commander program. Keep in km for now, move to silvery later.