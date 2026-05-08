---
mentions:
  - km
  - claude
id: "@km/silvercode/permission-inline-prompt"
aliases:
  - km-silvercode.permission-inline-prompt
  - km-silvercode-permission-inline-prompt
created_by: claude:2405c72e
created_at: 2026-04-28T19:26:16Z
closed_at: 2026-04-28T19:44:51Z
close_reason: "Replaced RequestPermissionInbox modal with InlinePermissionPrompt
  above the SessionPromptComposer. File diff: +1 component
  (InlinePermissionPrompt.tsx), -1 component (RequestPermissionInbox.tsx), -1
  obsolete test (permission-auto-surface.test.tsx), +1 new test
  (inline-permission-prompt.test.tsx, 3 tests all green), 1 storybook story
  renamed, plus updates to App.tsx (removed showInbox/Ctrl+E/auto-surface
  effect), slash-commands.ts (removed /inbox), Welcome.tsx (removed /inbox +
  Ctrl+E rows), CwdContext.tsx + controller.ts (doc updates), All.story.tsx +
  registry.ts + fake-session-handle.ts (story rename + slashCommands list).
  Verification: tsc errors not greater than baseline (3, all pre-existing in
  other files); inline-permission-prompt suite 3/3 green; full
  apps/silvercode/tests/ 708 passed 5 skipped; oxlint+oxfmt clean on my files
  (12 files, 0 errors); 4 verification greps all return zero hits."
started_at: 2026-04-28T19:26:17Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.permission-inline-prompt
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:26:17Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Replace permission inbox modal with inline prompt — interactive, not queued @km/silvercode #feature #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

Remove the RequestPermissionInbox modal + auto-surface + /inbox slash command + Ctrl+E binding. Replace with an InlinePermissionPrompt that renders the next pending permission request as a single y/n bar (or multi-option SelectList for ACP) at the bottom of the screen, just above the composer.

Why: permissions should be asked interactively at the point of approval, not aggregated in a separate modal that obscures which tool is being approved.

Acceptance:

- Inline prompt renders when state.permissions.length > 0 for focused session
- Single permission: tool + args summary + y/n
- Multi-option ACP: SelectList of options
- Composer inputDisabled while prompt active
- /inbox slash command removed (slash-commands.ts + App.tsx case)
- Ctrl+E binding removed from App.tsx
- showInbox state + setShowInbox + RequestPermissionInbox import removed
- RequestPermissionInbox.tsx deleted
- Termless test: legacy y/n flow + ACP multi-option flow
- bun fix clean, tsc not regressed, silvercode tests pass

