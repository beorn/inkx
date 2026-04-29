---
id: "@km/silvery/runoptions-caps-colorlevel-removal"
aliases:
  - km-silvery.runoptions-caps-colorlevel-removal
  - km-silvery-runoptions-caps-colorlevel-removal
created_by: claude:c6244087
created_at: 2026-04-23T10:24:05Z
closed_at: 2026-04-23T10:48:24Z
close_reason: deprecation portion done in silvery 984f8e06 + km 4a2ccbfb4. Both
  options marked @deprecated with once-per-process console.warn + migration
  hint. NOT deleted — that is 1.1. Three contract tests pin warn behavior.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.runoptions-caps-colorlevel-removal
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T03:24:04Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Delete RunOptions.caps + RunOptions.colorLevel pre-1.0 — profile-only @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review. Both GPT + Kimi insist the 'profile wins silently over caps/colorLevel' docstring IS the bug class the plateau was supposed to kill. Kimi recommends immediate deletion (pre-1.0 excuse); GPT recommends type-level XOR + short removal schedule. Migration: run({ profile: createTerminalProfile({ caps, colorLevel }) }).