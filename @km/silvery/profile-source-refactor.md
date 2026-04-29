---
id: "@km/silvery/profile-source-refactor"
aliases:
  - km-silvery.profile-source-refactor
  - km-silvery-profile-source-refactor
created_by: claude:c6244087
created_at: 2026-04-23T10:24:13Z
closed_at: 2026-04-23T10:47:54Z
close_reason: done in silvery cbfabec4 + km 4a2ccbfb4. profile.source →
  colorForced + colorProvenance. 268+ tests passing in ansi + contracts; 2552 in
  km-tui/km-logview. Non-vendor tsc unchanged at 56.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.profile-source-refactor
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T03:24:13Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Refactor TerminalProfile source field — scope to color-only provenance @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review 2026-04-23. source field currently claims to describe the whole TerminalProfile but only describes color tier. Also source='caller-caps' conflates 'pre-detected real caps' with 'synthetically forced caps'. GPT-5.4: color.{tier,forced,source} sub-object. Kimi: flat forced:boolean + provenance:string. Either kills the 'source === env || override' idiom.