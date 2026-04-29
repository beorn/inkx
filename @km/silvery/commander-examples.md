---
id: "@km/silvery/commander-examples"
aliases:
  - km-silvery.commander-examples
  - km-silvery-commander-examples
created_by: claude:4929065a
created_at: 2026-04-01T23:13:05Z
closed_at: 2026-04-07T19:13:53Z
close_reason: Subsumed by km-silvery.commander-text-render. The new default text
  renderer generalizes $ console-block detection across all sections, making
  addExamples() unnecessary as a separate API — addHelpSection('Examples:', ...)
  gets the same styling automatically.
owner: bjorn@stabell.org
---

# [x] @silvery/commander: addExamples() method with auto-colorized command lines @km/silvery #feature #P3

Add addExamples() to @silvery/commander that auto-colorizes command lines.

API:
  program.addExamples([
    ["terminfo probe termless --all", "Run all headless probes"],
    ["terminfo probe server --start", "Start daemon in this terminal"],
  ])

Renders as colorized Examples section with command names in yellow, --flags in cyan.

Implementation: override addHelpText to post-process example lines with the same style hooks used for Commands/Options sections.

Apply to:
- packages/terminfo.dev CLI (npx terminfo.dev)
- packages/admin CLI (bun admin)
- Any other @silvery/commander users in the ecosystem

Update /silverize skill to check for addExamples() usage.